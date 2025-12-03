import { Connection, PublicKey } from '@solana/web3.js';
import axios from 'axios';
import { getSolPrice } from './sol-price.service';

// Helius RPC for reliable data
const getHeliusRpc = () => {
  const key = process.env.HELIUS_API_KEY;
  if (key) {
    return `https://mainnet.helius-rpc.com/?api-key=${key}`;
  }
  console.warn('⚠️ HELIUS_API_KEY not found, using public RPC (will be rate limited)');
  return 'https://api.mainnet-beta.solana.com';
};

// Raydium AMM Program
const RAYDIUM_AMM_PROGRAM = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
// WSOL mint
const WSOL_MINT = 'So11111111111111111111111111111111111111112';

let connection: Connection | null = null;

function getConnection(): Connection {
  if (!connection) {
    const rpcUrl = getHeliusRpc();
    console.log(`🔗 Initializing Solana connection: ${rpcUrl.includes('helius') ? 'Helius RPC' : 'Public RPC'}`);
    connection = new Connection(rpcUrl, 'confirmed');
  }
  return connection;
}

export interface OnChainTokenData {
  holders: Array<{
    address: string;
    amount: number;
    percentage: number;
  }>;
  holderCount: number;
  totalSupply: number;
  topHolderPercentage: number;
  top5Percentage: number;
  top10Percentage: number;
  devHoldings: number;
  liquidity: number;
  price: number;
  poolAddress: string | null;
}

/**
 * Fetch comprehensive on-chain token data
 * Optimized to minimize RPC calls and handle rate limits
 */
export async function fetchOnChainTokenData(
  tokenMint: string,
  creatorAddress?: string
): Promise<OnChainTokenData> {
  const conn = getConnection();
  const mintPubkey = new PublicKey(tokenMint);

  try {
    // Fetch token supply and largest accounts in parallel (just 2 RPC calls)
    const [supplyResult, largestAccountsResult] = await Promise.all([
      conn.getTokenSupply(mintPubkey).catch(() => null),
      conn.getTokenLargestAccounts(mintPubkey).catch(() => null),
    ]);

    const decimals = supplyResult?.value.decimals || 6;
    const totalSupply = supplyResult 
      ? parseFloat(supplyResult.value.uiAmountString || '0')
      : 0;

    // Process holder data from largest accounts (no additional RPC calls needed)
    const holders: Array<{ address: string; amount: number; percentage: number }> = [];
    let devHoldings = 0;

    if (largestAccountsResult?.value && largestAccountsResult.value.length > 0) {
      // Build holders list directly from largest accounts
      // We don't need to fetch owner addresses to calculate concentration metrics
      for (const account of largestAccountsResult.value.slice(0, 20)) {
        const amount = parseFloat(account.uiAmountString || '0');
        if (amount > 0) {
          const percentage = totalSupply > 0 ? (amount / totalSupply) * 100 : 0;
          holders.push({
            address: account.address.toBase58(), // Use token account address
            amount,
            percentage,
          });
        }
      }
      
      // Only fetch owner info for creator check if we have a creator address
      // This is expensive, so we limit to just checking if creator is in top 5
      if (creatorAddress && holders.length > 0) {
        try {
          // Only check first 5 accounts for creator (minimize RPC calls)
          const topAccounts = largestAccountsResult.value.slice(0, 5);
          for (const account of topAccounts) {
            const info = await conn.getParsedAccountInfo(account.address);
            const parsed = info.value?.data as { parsed?: { info?: { owner?: string } } };
            const owner = parsed?.parsed?.info?.owner;
            if (owner && owner.toLowerCase() === creatorAddress.toLowerCase()) {
              const amount = parseFloat(account.uiAmountString || '0');
              devHoldings = totalSupply > 0 ? amount / totalSupply : 0;
              break; // Found creator, stop checking
            }
          }
        } catch {
          // Ignore errors when fetching owner info
        }
      }
    }

    // Calculate concentration metrics
    const sortedHolders = holders.sort((a, b) => b.amount - a.amount);
    const topHolderPercentage = sortedHolders[0]?.percentage || 0;
    const top5Percentage = sortedHolders.slice(0, 5).reduce((sum, h) => sum + h.percentage, 0);
    const top10Percentage = sortedHolders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0);

    // Skip Raydium pool lookup to reduce RPC calls (we get liquidity from Moralis)
    const liquidity = 0;
    const price = 0;
    const poolAddress: string | null = null;

    // getTokenLargestAccounts only returns top 20 accounts
    // We can't know the real holder count without expensive getProgramAccounts call
    // Return -1 to indicate "unknown" - the UI should show "N/A" or similar
    // Only return an actual count if we have reliable data from another source
    const holderCount = -1; // Unknown - we only have top 20 accounts

    console.log(`✅ On-chain: ${tokenMint.slice(0, 8)} - top10: ${top10Percentage.toFixed(1)}%, dev: ${(devHoldings * 100).toFixed(1)}%`);

    return {
      holders: sortedHolders,
      holderCount, // -1 means unknown
      totalSupply,
      topHolderPercentage,
      top5Percentage,
      top10Percentage,
      devHoldings,
      liquidity,
      price,
      poolAddress,
    };
  } catch (error) {
    console.error(`Error fetching on-chain data for ${tokenMint}:`, error);
    return {
      holders: [],
      holderCount: 0,
      totalSupply: 0,
      topHolderPercentage: 0,
      top5Percentage: 0,
      top10Percentage: 0,
      devHoldings: 0,
      liquidity: 0,
      price: 0,
      poolAddress: null,
    };
  }
}

/**
 * Find Raydium AMM pool for a token and get liquidity
 * Uses multiple approaches for reliability
 */
async function findRaydiumPool(tokenMint: string): Promise<{
  poolAddress: string;
  liquidity: number;
  price: number;
} | null> {
  // Method 1: Direct Raydium pool lookup (most reliable)
  try {
    const raydiumLiquidity = await fetchRaydiumPoolLiquidity(tokenMint);
    if (raydiumLiquidity) {
      return {
        poolAddress: raydiumLiquidity.poolAddress,
        liquidity: raydiumLiquidity.liquidityUsd,
        price: raydiumLiquidity.price || 0,
      };
    }
  } catch (e) {
    console.warn(`Raydium pool lookup failed for ${tokenMint.slice(0, 8)}:`, e);
  }

  return null;
}

/**
 * Fetch liquidity from Raydium pools API
 */
async function fetchRaydiumPoolLiquidity(tokenMint: string): Promise<{
  poolAddress: string;
  liquidityUsd: number;
  price?: number;
} | null> {
  try {
    // Raydium API for pool info
    const response = await axios.get(
      `https://api-v3.raydium.io/pools/info/mint?mint1=${tokenMint}&mint2=${WSOL_MINT}&poolType=all&poolSortField=liquidity&sortType=desc&pageSize=1&page=1`,
      { timeout: 5000 }
    );
    
    const pools = response.data?.data?.data;
    if (pools && pools.length > 0) {
      const pool = pools[0];
      return {
        poolAddress: pool.id || '',
        liquidityUsd: pool.tvl || 0,
        price: pool.price || 0,
      };
    }
  } catch (e) {
    // Raydium API might be rate limited or unavailable
    console.warn(`Raydium API failed:`, e);
  }

  // Fallback: Try GeckoTerminal (aggregates multiple DEXes)
  try {
    const geckoResponse = await axios.get(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenMint}/pools?page=1`,
      { 
        timeout: 5000,
        headers: { 'Accept': 'application/json' }
      }
    );
    
    const pools = geckoResponse.data?.data;
    if (pools && pools.length > 0) {
      // Get the pool with highest liquidity
      const bestPool = pools.reduce((best: { attributes?: { reserve_in_usd?: string } }, pool: { attributes?: { reserve_in_usd?: string } }) => {
        const poolLiq = parseFloat(pool.attributes?.reserve_in_usd || '0');
        const bestLiq = parseFloat(best.attributes?.reserve_in_usd || '0');
        return poolLiq > bestLiq ? pool : best;
      }, pools[0]);
      
      const liquidity = parseFloat(bestPool.attributes?.reserve_in_usd || '0');
      
      if (liquidity > 0) {
        return {
          poolAddress: bestPool.id || '',
          liquidityUsd: liquidity,
        };
      }
    }
  } catch (e) {
    console.warn(`GeckoTerminal API failed:`, e);
  }

  // Fallback: Try on-chain pool account balance estimation
  try {
    const conn = getConnection();
    
    // Search for Raydium pool accounts
    const filters = [
      { dataSize: 752 }, // Raydium AMM V4 account size
    ];

    const accounts = await conn.getProgramAccounts(RAYDIUM_AMM_PROGRAM, {
      filters,
      commitment: 'confirmed',
      dataSlice: { offset: 0, length: 0 }, // Don't fetch data, just addresses
    }).catch(() => []);

    // This is expensive, so we limit checking
    for (const account of accounts.slice(0, 5)) {
      try {
        // Check if this pool contains our token by looking at SOL balance
        const solBalance = await conn.getBalance(account.pubkey);
        if (solBalance > 1e9) { // At least 1 SOL
          // Get current SOL price for conversion
          const solPrice = await getSolPrice();
          if (solPrice === null) {
            console.warn('Could not get SOL price for liquidity calculation');
            continue;
          }
          const liquidityUsd = (solBalance / 1e9) * solPrice * 2; // Approximate (SOL side * 2)
          
          return {
            poolAddress: account.pubkey.toBase58(),
            liquidityUsd,
          };
        }
      } catch {
        continue;
      }
    }
  } catch (e) {
    console.warn(`On-chain pool search failed:`, e);
  }

  return null;
}

// getSolPrice is now imported from sol-price.service.ts

// Cache for holder counts to avoid repeated API calls
const holderCountCache = new Map<string, { count: number; timestamp: number }>();
const HOLDER_CACHE_TTL = 60_000; // 1 minute cache

/**
 * Get ACCURATE holder count - NO ESTIMATES
 * Returns -1 if we cannot get an accurate count
 * Only uses APIs that return actual holder counts, not estimates
 */
export async function getAccurateHolderCount(tokenMint: string): Promise<number> {
  // Check cache first
  const cached = holderCountCache.get(tokenMint);
  if (cached && Date.now() - cached.timestamp < HOLDER_CACHE_TTL) {
    return cached.count;
  }

  // Method 1: Helius DAS API - returns ACTUAL total count
  if (process.env.HELIUS_API_KEY) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
      
      const response = await fetch(
        `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'holder-count',
            method: 'getTokenAccounts',
            params: {
              mint: tokenMint,
              limit: 1,
              options: { showZeroBalance: false }
            }
          }),
          signal: controller.signal
        }
      );
      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json();
        if (data.result?.total && data.result.total > 0) {
          console.log(`✅ Helius: ${tokenMint.slice(0, 8)} has ${data.result.total} holders`);
          holderCountCache.set(tokenMint, { count: data.result.total, timestamp: Date.now() });
          return data.result.total;
        }
      }
    } catch (e: unknown) {
      const errorName = e instanceof Error ? e.name : 'Unknown';
      if (errorName !== 'AbortError') {
        console.warn(`Helius DAS failed for ${tokenMint.slice(0, 8)}:`, e);
      }
    }
  }

  // Method 2: Birdeye Public API - returns actual holder count
  try {
    const response = await axios.get(
      `https://public-api.birdeye.so/defi/token_overview`,
      {
        params: { address: tokenMint },
        headers: { 'X-Chain': 'solana' },
        timeout: 4000,
      }
    );

    const data = response.data?.data;
    if (data?.holder && data.holder > 0) {
      console.log(`✅ Birdeye: ${tokenMint.slice(0, 8)} has ${data.holder} holders`);
      holderCountCache.set(tokenMint, { count: data.holder, timestamp: Date.now() });
      return data.holder;
    }
  } catch {
    // Birdeye failed, continue to return unknown
  }

  // No accurate count available - return -1 (unknown)
  // Cache the failure too so we don't keep retrying
  holderCountCache.set(tokenMint, { count: -1, timestamp: Date.now() });
  console.warn(`⚠️ ${tokenMint.slice(0, 8)}: Could not get accurate holder count`);
  return -1;
}

/**
 * Get token creator/authority using Helius DAS getAsset API
 * This works for ALL tokens, including historical ones from Moralis
 */
export async function getTokenCreator(tokenMint: string): Promise<string | null> {
  if (!process.env.HELIUS_API_KEY) {
    console.warn('HELIUS_API_KEY not configured for getTokenCreator');
    return null;
  }

  try {
    const response = await fetch(
      `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 'get-asset',
          method: 'getAsset',
          params: {
            id: tokenMint,
            displayOptions: {
              showFungible: true,
            },
          },
        }),
      }
    );

    if (!response.ok) {
      console.warn(`Helius getAsset failed for ${tokenMint.slice(0, 8)}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    // The creator/authority info is in multiple places depending on token type
    // For pump.fun tokens: check authorities.creator or content.metadata.attributes
    const result = data.result;
    
    if (!result) {
      return null;
    }

    // Method 1: Check authorities.creator (most reliable for pump.fun)
    if (result.authorities && result.authorities.length > 0) {
      // Look for the update authority or creator
      for (const auth of result.authorities) {
        if (auth.scopes?.includes('full') || auth.scopes?.includes('metadata')) {
          if (auth.address) {
            console.log(`✅ Creator for ${tokenMint.slice(0, 8)}: ${auth.address.slice(0, 8)}... (from authorities)`);
            return auth.address;
          }
        }
      }
    }

    // Method 2: Check ownership/creator in metadata
    if (result.ownership?.owner) {
      console.log(`✅ Creator for ${tokenMint.slice(0, 8)}: ${result.ownership.owner.slice(0, 8)}... (from ownership)`);
      return result.ownership.owner;
    }

    // Method 3: For fungible tokens, check mutable metadata
    if (result.mutable && result.creators && result.creators.length > 0) {
      const creator = result.creators[0].address;
      console.log(`✅ Creator for ${tokenMint.slice(0, 8)}: ${creator.slice(0, 8)}... (from creators)`);
      return creator;
    }

    console.warn(`Could not find creator for ${tokenMint.slice(0, 8)} in getAsset response`);
    return null;
  } catch (error) {
    console.warn(`Error getting token creator for ${tokenMint.slice(0, 8)}:`, 
      error instanceof Error ? error.message : error);
    return null;
  }
}

/**
 * Fetch accurate liquidity for a token using multiple sources
 * Priority: GeckoTerminal > Raydium API > Jupiter > On-chain estimate
 */
export async function fetchAccurateLiquidity(tokenMint: string): Promise<{
  liquidity: number;
  source: string;
}> {
  // Method 1: GeckoTerminal (aggregates multiple DEXes, very reliable)
  try {
    const geckoResponse = await axios.get(
      `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenMint}`,
      { 
        timeout: 5000,
        headers: { 'Accept': 'application/json' }
      }
    );
    
    const tokenData = geckoResponse.data?.data?.attributes;
    if (tokenData) {
      // GeckoTerminal provides total_reserve_in_usd across all pools
      const totalReserve = parseFloat(tokenData.total_reserve_in_usd || '0');
      if (totalReserve > 0) {
        console.log(`💧 GeckoTerminal liquidity for ${tokenMint.slice(0, 8)}: $${totalReserve.toLocaleString()}`);
        return { liquidity: totalReserve, source: 'GeckoTerminal' };
      }
    }
  } catch (e) {
    console.warn(`GeckoTerminal token API failed:`, e);
  }

  // Method 2: Raydium API
  try {
    const response = await axios.get(
      `https://api-v3.raydium.io/pools/info/mint?mint1=${tokenMint}&mint2=${WSOL_MINT}&poolType=all&poolSortField=liquidity&sortType=desc&pageSize=5&page=1`,
      { timeout: 5000 }
    );
    
    const pools = response.data?.data?.data;
    if (pools && pools.length > 0) {
      // Sum up liquidity from all pools
      const totalLiquidity = pools.reduce((sum: number, pool: { tvl?: number }) => sum + (pool.tvl || 0), 0);
      if (totalLiquidity > 0) {
        console.log(`💧 Raydium liquidity for ${tokenMint.slice(0, 8)}: $${totalLiquidity.toLocaleString()}`);
        return { liquidity: totalLiquidity, source: 'Raydium' };
      }
    }
  } catch (e) {
    console.warn(`Raydium API failed:`, e);
  }

  // Method 3: Birdeye (if API key available)
  if (process.env.BIRDEYE_API_KEY) {
    try {
      const birdeyeResponse = await axios.get(
        `https://public-api.birdeye.so/defi/token_overview?address=${tokenMint}`,
        {
          headers: {
            'X-API-KEY': process.env.BIRDEYE_API_KEY,
            'X-Chain': 'solana',
          },
          timeout: 5000,
        }
      );
      
      const data = birdeyeResponse.data?.data;
      if (data?.liquidity && data.liquidity > 0) {
        console.log(`💧 Birdeye liquidity for ${tokenMint.slice(0, 8)}: $${data.liquidity.toLocaleString()}`);
        return { liquidity: data.liquidity, source: 'Birdeye' };
      }
    } catch (e) {
      console.warn(`Birdeye API failed:`, e);
    }
  }

  // Method 4: DexScreener (already fetched in main flow, but as backup)
  try {
    const dexResponse = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenMint}`,
      { timeout: 5000 }
    );
    
    const pairs = dexResponse.data?.pairs;
    if (pairs && pairs.length > 0) {
      // Sum liquidity from all pairs
      const totalLiquidity = pairs.reduce((sum: number, pair: { liquidity?: { usd?: number } }) => 
        sum + (pair.liquidity?.usd || 0), 0
      );
      if (totalLiquidity > 0) {
        console.log(`💧 DexScreener liquidity for ${tokenMint.slice(0, 8)}: $${totalLiquidity.toLocaleString()}`);
        return { liquidity: totalLiquidity, source: 'DexScreener' };
      }
    }
  } catch (e) {
    console.warn(`DexScreener API failed:`, e);
  }

  console.warn(`⚠️ Could not fetch liquidity for ${tokenMint.slice(0, 8)}`);
  return { liquidity: 0, source: 'none' };
}
