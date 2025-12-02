import { Connection, PublicKey } from '@solana/web3.js';

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
 * Find Raydium AMM pool for a token
 */
async function findRaydiumPool(tokenMint: string): Promise<{
  poolAddress: string;
  liquidity: number;
  price: number;
} | null> {
  const conn = getConnection();
  
  try {
    // SOL mint (WSOL)
    const WSOL = 'So11111111111111111111111111111111111111112';
    
    // Use Helius API to search for Raydium pools if available
    if (process.env.HELIUS_API_KEY) {
      const response = await fetch(
        `https://api.helius.xyz/v0/addresses/${tokenMint}/transactions?api-key=${process.env.HELIUS_API_KEY}&limit=50`
      );
      
      if (response.ok) {
        const transactions = await response.json();
        
        // Look for Raydium swap/add liquidity transactions
        for (const tx of transactions) {
          if (tx.type === 'SWAP' && tx.source === 'RAYDIUM') {
            // Found a Raydium transaction, try to extract pool info
            const poolAccount = tx.accountData?.find((acc: { account: string }) => 
              acc.account && acc.account !== tokenMint && acc.account !== WSOL
            );
            
            if (poolAccount) {
              // Get pool account balance for liquidity estimate
              try {
                const poolBalance = await conn.getBalance(new PublicKey(poolAccount.account));
                const liquiditySOL = poolBalance / 1e9;
                const liquidityUSD = liquiditySOL * 200; // Rough SOL price estimate
                
                return {
                  poolAddress: poolAccount.account,
                  liquidity: liquidityUSD,
                  price: 0, // Would need more complex calculation
                };
              } catch {
                // Continue searching
              }
            }
          }
        }
      }
    }

    // Fallback: Try to find pool by searching program accounts
    // This is expensive so we limit the search
    const filters = [
      { dataSize: 752 }, // Raydium AMM account size
      { memcmp: { offset: 400, bytes: tokenMint } }, // Token mint at specific offset
    ];

    const accounts = await conn.getProgramAccounts(RAYDIUM_AMM_PROGRAM, {
      filters,
      commitment: 'confirmed',
    }).catch(() => []);

    if (accounts.length > 0) {
      const poolAddress = accounts[0].pubkey.toBase58();
      
      // Get SOL balance of pool for liquidity estimate
      const poolBalance = await conn.getBalance(accounts[0].pubkey).catch(() => 0);
      const liquiditySOL = poolBalance / 1e9;
      const liquidityUSD = liquiditySOL * 200;

      return {
        poolAddress,
        liquidity: liquidityUSD,
        price: 0,
      };
    }

    return null;
  } catch (error) {
    console.warn(`Error finding Raydium pool for ${tokenMint}:`, error);
    return null;
  }
}

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

  console.warn(`⚠️ Could not get holder count for ${tokenMint.slice(0, 8)}`);
  return 0;
}
