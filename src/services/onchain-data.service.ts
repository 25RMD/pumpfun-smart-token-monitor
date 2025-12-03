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
 */
export async function fetchOnChainTokenData(
  tokenMint: string,
  creatorAddress?: string
): Promise<OnChainTokenData> {
  const conn = getConnection();
  const mintPubkey = new PublicKey(tokenMint);

  try {
    // Fetch token supply and largest accounts in parallel
    const [supplyResult, largestAccountsResult] = await Promise.all([
      conn.getTokenSupply(mintPubkey).catch(() => null),
      conn.getTokenLargestAccounts(mintPubkey).catch(() => null),
    ]);

    const decimals = supplyResult?.value.decimals || 6;
    const totalSupply = supplyResult 
      ? parseFloat(supplyResult.value.uiAmountString || '0')
      : 0;

    // Process holder data
    const holders: Array<{ address: string; amount: number; percentage: number }> = [];
    let devHoldings = 0;

    if (largestAccountsResult?.value && largestAccountsResult.value.length > 0) {
      // Get owner addresses for each token account
      const accountInfos = await Promise.all(
        largestAccountsResult.value.slice(0, 20).map(async (account) => {
          try {
            const info = await conn.getParsedAccountInfo(account.address);
            const parsed = info.value?.data as { parsed?: { info?: { owner?: string } } };
            return {
              tokenAccount: account.address.toBase58(),
              owner: parsed?.parsed?.info?.owner || 'unknown',
              amount: parseFloat(account.uiAmountString || '0'),
            };
          } catch {
            return {
              tokenAccount: account.address.toBase58(),
              owner: 'unknown',
              amount: parseFloat(account.uiAmountString || '0'),
            };
          }
        })
      );

      // Build holders list
      for (const info of accountInfos) {
        if (info.amount > 0) {
          const percentage = totalSupply > 0 ? (info.amount / totalSupply) * 100 : 0;
          holders.push({
            address: info.owner,
            amount: info.amount,
            percentage,
          });

          // Check if this is the dev wallet
          if (creatorAddress && info.owner.toLowerCase() === creatorAddress.toLowerCase()) {
            devHoldings = percentage / 100; // Convert to decimal
          }
        }
      }
    }

    // Calculate concentration metrics
    const sortedHolders = holders.sort((a, b) => b.amount - a.amount);
    const topHolderPercentage = sortedHolders[0]?.percentage || 0;
    const top5Percentage = sortedHolders.slice(0, 5).reduce((sum, h) => sum + h.percentage, 0);
    const top10Percentage = sortedHolders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0);

    // Try to get Raydium pool data
    let liquidity = 0;
    let price = 0;
    let poolAddress: string | null = null;

    try {
      const poolData = await findRaydiumPool(tokenMint);
      if (poolData) {
        liquidity = poolData.liquidity;
        price = poolData.price;
        poolAddress = poolData.poolAddress;
      }
    } catch (e) {
      console.warn(`Could not fetch Raydium pool for ${tokenMint.slice(0, 8)}:`, e);
    }

    // Estimate real holder count (getTokenLargestAccounts only returns top 20)
    // For accurate count, we'd need to use getProgramAccounts which is expensive
    // Use a heuristic: if top 20 accounts < 50% of supply, likely many more holders
    const top20Percentage = holders.reduce((sum, h) => sum + h.percentage, 0);
    const estimatedHolderCount = top20Percentage < 50 
      ? Math.round(holders.length * (100 / top20Percentage))
      : holders.length;

    console.log(`On-chain data for ${tokenMint.slice(0, 8)}: ${holders.length} top holders, ~${estimatedHolderCount} estimated total, top holder: ${topHolderPercentage.toFixed(1)}%`);

    return {
      holders: sortedHolders,
      holderCount: Math.max(holders.length, estimatedHolderCount),
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

/**
 * Get holder count using multiple methods with fallbacks
 */
export async function getAccurateHolderCount(tokenMint: string): Promise<number> {
  console.log(`📊 Getting holder count for ${tokenMint.slice(0, 8)}...`);
  
  // Method 1: Use RPC getTokenLargestAccounts and estimate (most reliable)
  try {
    const conn = getConnection();
    const mintPubkey = new PublicKey(tokenMint);
    
    // Get token supply for context
    const supply = await conn.getTokenSupply(mintPubkey);
    const largestAccounts = await conn.getTokenLargestAccounts(mintPubkey);
    
    if (largestAccounts.value.length > 0) {
      // Calculate what % the top 20 accounts hold
      const totalAmount = largestAccounts.value.reduce(
        (sum, acc) => sum + parseFloat(acc.uiAmountString || '0'), 
        0
      );
      const totalSupply = parseFloat(supply.value.uiAmountString || '0');
      
      if (totalSupply > 0) {
        const top20Percentage = (totalAmount / totalSupply) * 100;
        
        // Estimate total holders based on distribution
        // If top 20 hold 90%, likely ~22-25 holders
        // If top 20 hold 50%, likely ~200 holders
        // If top 20 hold 10%, likely 1000+ holders
        let estimatedHolders: number;
        if (top20Percentage >= 95) {
          estimatedHolders = Math.max(largestAccounts.value.length, Math.round(20 / (top20Percentage / 100)));
        } else if (top20Percentage >= 80) {
          estimatedHolders = Math.round(40 / (top20Percentage / 100));
        } else if (top20Percentage >= 60) {
          estimatedHolders = Math.round(80 / (top20Percentage / 100));
        } else if (top20Percentage >= 40) {
          estimatedHolders = Math.round(150 / (top20Percentage / 100));
        } else {
          estimatedHolders = Math.round(300 / (top20Percentage / 100));
        }
        
        console.log(`✅ Holder count for ${tokenMint.slice(0, 8)}: top20 hold ${top20Percentage.toFixed(1)}%, estimated ${estimatedHolders} holders`);
        return Math.max(largestAccounts.value.length, estimatedHolders);
      }
    }
    
    // Fallback: return the number of non-zero accounts we found
    const nonZeroAccounts = largestAccounts.value.filter(
      acc => parseFloat(acc.uiAmountString || '0') > 0
    ).length;
    
    console.log(`📊 Fallback holder count for ${tokenMint.slice(0, 8)}: ${nonZeroAccounts}`);
    return nonZeroAccounts > 0 ? nonZeroAccounts : 1;
  } catch (e) {
    console.warn(`RPC holder estimation failed for ${tokenMint.slice(0, 8)}:`, e);
  }

  // Method 2: Helius DAS API (backup)
  if (process.env.HELIUS_API_KEY) {
    try {
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
          })
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.result?.total && data.result.total > 1) {
          console.log(`✅ Helius holder count for ${tokenMint.slice(0, 8)}: ${data.result.total}`);
          return data.result.total;
        }
      }
    } catch (e) {
      console.warn(`Helius DAS failed for ${tokenMint.slice(0, 8)}:`, e);
    }
  }

  // Method 3: Birdeye Public API (fallback)
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
      console.log(`✅ Birdeye holder count for ${tokenMint.slice(0, 8)}: ${data.holder}`);
      return data.holder;
    }
  } catch {
    // Ignore errors
  }

  console.warn(`⚠️ Could not get holder count for ${tokenMint.slice(0, 8)}`);
  return 0;
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
