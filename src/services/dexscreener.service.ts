import axios from 'axios';
import { PriceData } from '@/types';

const DEXSCREENER_API = 'https://api.dexscreener.com/latest/dex';
const BIRDEYE_API = 'https://public-api.birdeye.so';

interface DexScreenerPair {
  chainId: string;
  dexId: string;
  url: string;
  pairAddress: string;
  baseToken: {
    address: string;
    name: string;
    symbol: string;
  };
  quoteToken: {
    address: string;
    name: string;
    symbol: string;
  };
  priceNative: string;
  priceUsd: string;
  txns: {
    m5: { buys: number; sells: number };
    h1: { buys: number; sells: number };
    h24: { buys: number; sells: number };
  };
  volume: {
    m5: number;
    h1: number;
    h24: number;
  };
  priceChange: {
    m5: number;
    h1: number;
    h24: number;
  };
  liquidity?: {
    usd: number;
    base: number;
    quote: number;
  };
  fdv?: number;
  marketCap?: number;
  pairCreatedAt?: number;
  info?: {
    imageUrl?: string;
    websites?: Array<{ label: string; url: string }>;
    socials?: Array<{ type: string; url: string }>;
  };
}

interface DexScreenerResponse {
  schemaVersion: string;
  pairs: DexScreenerPair[] | null;
}

/**
 * Fetch token price and market data from DexScreener
 */
export async function fetchDexScreenerData(tokenAddress: string): Promise<{
  priceData: PriceData;
  metadata: {
    image?: string;
    website?: string;
    twitter?: string;
    telegram?: string;
  };
  holderCount?: number;
} | null> {
  try {
    // Fetch DexScreener data and holder count in parallel
    const [dexResponse, holderCount] = await Promise.all([
      axios.get<DexScreenerResponse>(
        `${DEXSCREENER_API}/tokens/${tokenAddress}`,
        { timeout: 8000 }
      ),
      fetchHolderCount(tokenAddress),
    ]);

    const pairs = dexResponse.data.pairs;
    if (!pairs || pairs.length === 0) {
      console.log(`No DexScreener pairs found for ${tokenAddress.slice(0, 8)}...`);
      return null;
    }

    // Get the most liquid pair (usually Raydium)
    const pair = pairs.sort((a, b) => 
      (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
    )[0];

    // Use marketCap preferentially - fdv can be wildly inflated for tokens with large supply
    // Also sanity check: pump.fun tokens typically have MC between $10K and $100M
    let marketCap = pair.marketCap || 0;
    
    // If no marketCap, try to calculate from price * circulating supply
    // For pump.fun tokens, total supply is usually 1 billion
    if (marketCap === 0 && pair.priceUsd) {
      const price = parseFloat(pair.priceUsd);
      // Pump.fun tokens have 1 billion supply
      marketCap = price * 1_000_000_000;
    }
    
    // Sanity check - if MC is over $1B, something is wrong for a pump.fun token
    // Use fdv only if marketCap seems wrong and fdv is reasonable
    if (marketCap > 1_000_000_000 && pair.fdv && pair.fdv < 1_000_000_000) {
      marketCap = pair.fdv;
    } else if (marketCap > 1_000_000_000) {
      // Recalculate from price if MC is absurdly high
      const price = parseFloat(pair.priceUsd) || 0;
      marketCap = price * 1_000_000_000; // Assume 1B supply
    }

    const priceData: PriceData = {
      price: parseFloat(pair.priceUsd) || 0,
      volume24h: pair.volume?.h24 || 0,
      volume1h: pair.volume?.h1 || 0,
      volume5m: pair.volume?.m5 || 0,
      marketCap,
      liquidity: pair.liquidity?.usd || 0,
      trades24h: (pair.txns?.h24?.buys || 0) + (pair.txns?.h24?.sells || 0),
      buys24h: pair.txns?.h24?.buys || 0,
      sells24h: pair.txns?.h24?.sells || 0,
      buys1h: pair.txns?.h1?.buys || 0,
      sells1h: pair.txns?.h1?.sells || 0,
      buys5m: pair.txns?.m5?.buys || 0,
      sells5m: pair.txns?.m5?.sells || 0,
      priceChange24h: pair.priceChange?.h24 || 0,
      priceChange1h: pair.priceChange?.h1 || 0,
      priceChange5m: pair.priceChange?.m5 || 0,
      pairCreatedAt: pair.pairCreatedAt || 0,
    };

    // Extract social links from info
    const metadata: {
      image?: string;
      website?: string;
      twitter?: string;
      telegram?: string;
    } = {
      image: pair.info?.imageUrl,
    };

    if (pair.info?.websites && pair.info.websites.length > 0) {
      metadata.website = pair.info.websites[0].url;
    }

    if (pair.info?.socials) {
      for (const social of pair.info.socials) {
        if (social.type === 'twitter') {
          metadata.twitter = social.url;
        } else if (social.type === 'telegram') {
          metadata.telegram = social.url;
        }
      }
    }

    console.log(`DexScreener data for ${tokenAddress.slice(0, 8)}: MC=$${priceData.marketCap.toLocaleString()}, Liq=$${priceData.liquidity.toLocaleString()}, Holders=${holderCount || 'N/A'}`);

    return { priceData, metadata, holderCount: holderCount || undefined };
  } catch (error) {
    console.warn(`DexScreener fetch failed for ${tokenAddress.slice(0, 8)}:`, error instanceof Error ? error.message : 'Unknown error');
    return null;
  }
}

/**
 * Fetch holder count from Birdeye API (free tier)
 */
async function fetchHolderCount(tokenAddress: string): Promise<number | null> {
  // Method 1: Try Birdeye with API key if available
  if (process.env.BIRDEYE_API_KEY) {
    try {
      const response = await axios.get(
        `${BIRDEYE_API}/defi/token_overview`,
        {
          params: { address: tokenAddress },
          headers: {
            'X-API-KEY': process.env.BIRDEYE_API_KEY,
            'X-Chain': 'solana',
          },
          timeout: 5000,
        }
      );

      const data = response.data?.data;
      if (data?.holder && data.holder > 0) {
        return data.holder;
      }
    } catch {
      // Continue to fallback
    }
  }

  // Method 2: Try Birdeye public endpoint
  try {
    const response = await axios.get(
      `${BIRDEYE_API}/defi/token_overview`,
      {
        params: { address: tokenAddress },
        headers: {
          'X-Chain': 'solana',
        },
        timeout: 5000,
      }
    );

    const data = response.data?.data;
    if (data?.holder && data.holder > 0) {
      return data.holder;
    }
  } catch {
    // Continue to fallback
  }

  // Method 3: Try Helius DAS API if available
  if (process.env.HELIUS_API_KEY) {
    try {
      const response = await axios.post(
        `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
        {
          jsonrpc: '2.0',
          id: 'holder-count',
          method: 'getTokenAccounts',
          params: {
            mint: tokenAddress,
            limit: 1,
            showZeroBalance: false,
          },
        },
        { timeout: 5000 }
      );
      
      // Helius returns total in response
      const total = response.data?.result?.total;
      if (total && total > 0) {
        return total;
      }
    } catch {
      // Continue to fallback
    }
  }

  // Method 4: Fallback to Solscan
  try {
    const solscanResponse = await axios.get(
      `https://api.solscan.io/token/holders`,
      {
        params: { token: tokenAddress, offset: 0, size: 1 },
        timeout: 5000,
      }
    );
    
    const total = solscanResponse.data?.total;
    if (total && total > 0) {
      return total;
    }
  } catch {
    // All methods failed
  }

  return null;
}

/**
 * Fetch multiple tokens at once (batch)
 */
export async function fetchMultipleTokens(tokenAddresses: string[]): Promise<Map<string, {
  priceData: PriceData;
  metadata: { image?: string; website?: string; twitter?: string; telegram?: string };
}>> {
  const results = new Map();
  
  // DexScreener allows comma-separated addresses (up to ~30)
  const chunks: string[][] = [];
  for (let i = 0; i < tokenAddresses.length; i += 25) {
    chunks.push(tokenAddresses.slice(i, i + 25));
  }

  for (const chunk of chunks) {
    try {
      const addresses = chunk.join(',');
      const response = await axios.get<DexScreenerResponse>(
        `${DEXSCREENER_API}/tokens/${addresses}`,
        { timeout: 10000 }
      );

      const pairs = response.data.pairs || [];
      
      // Group by base token address
      const pairsByToken = new Map<string, DexScreenerPair[]>();
      for (const pair of pairs) {
        const addr = pair.baseToken.address;
        if (!pairsByToken.has(addr)) {
          pairsByToken.set(addr, []);
        }
        pairsByToken.get(addr)!.push(pair);
      }

      // Process each token
      for (const [addr, tokenPairs] of pairsByToken) {
        const bestPair = tokenPairs.sort((a, b) => 
          (b.liquidity?.usd || 0) - (a.liquidity?.usd || 0)
        )[0];

        results.set(addr, {
          priceData: {
            price: parseFloat(bestPair.priceUsd) || 0,
            volume24h: bestPair.volume?.h24 || 0,
            marketCap: bestPair.marketCap || bestPair.fdv || 0,
            liquidity: bestPair.liquidity?.usd || 0,
            trades24h: (bestPair.txns?.h24?.buys || 0) + (bestPair.txns?.h24?.sells || 0),
            priceChange24h: bestPair.priceChange?.h24 || 0,
          },
          metadata: {
            image: bestPair.info?.imageUrl,
          },
        });
      }
    } catch (error) {
      console.warn('Batch DexScreener fetch failed:', error instanceof Error ? error.message : 'Unknown');
    }
  }

  return results;
}
