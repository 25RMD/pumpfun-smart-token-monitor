import { getMoralisMarketCap } from './moralis.service';

/**
 * Market Cap Service
 * Uses Moralis as the ONLY source for market cap data
 * No fallbacks - Moralis provides the most accurate pump.fun data
 */

// Cache for MC values with timestamps
interface MCCache {
  marketCap: number;
  price: number;
  source: string;
  timestamp: number;
  confidence: 'high' | 'medium' | 'low';
}

const mcCache = new Map<string, MCCache>();
const CACHE_TTL_MS = 30_000; // 30 seconds

interface MarketCapResult {
  marketCap: number;
  price: number;
  source: string;
  confidence: 'high' | 'medium' | 'low';
  supply: number;
  liquidity: number;
  warning?: string;
}

/**
 * Get accurate market cap from Moralis ONLY
 */
export async function getAccurateMarketCap(tokenMint: string): Promise<MarketCapResult> {
  // Check cache first
  const cached = mcCache.get(tokenMint);
  const now = Date.now();
  
  if (cached && now - cached.timestamp < CACHE_TTL_MS) {
    return {
      marketCap: cached.marketCap,
      price: cached.price,
      source: `${cached.source} (cached)`,
      confidence: cached.confidence,
      supply: 0,
      liquidity: 0,
    };
  }

  // Fetch from Moralis (ONLY source)
  const moralisData = await getMoralisMarketCap(tokenMint);

  if (moralisData.marketCap === 0) {
    return {
      marketCap: 0,
      price: 0,
      source: 'none',
      confidence: 'low',
      supply: 0,
      liquidity: 0,
      warning: 'No market cap data from Moralis',
    };
  }

  // Cache the result
  mcCache.set(tokenMint, {
    marketCap: moralisData.marketCap,
    price: moralisData.price,
    source: moralisData.source,
    timestamp: now,
    confidence: moralisData.confidence,
  });

  // Add warning for suspicious values
  let warning: string | undefined;
  
  if (moralisData.marketCap > 100_000_000) {
    warning = `Unusually high MC for pump.fun token: $${(moralisData.marketCap / 1_000_000).toFixed(1)}M`;
  }
  
  if (moralisData.liquidity > 0 && moralisData.liquidity / moralisData.marketCap < 0.001) {
    warning = `Very low liquidity (${((moralisData.liquidity / moralisData.marketCap) * 100).toFixed(2)}% of MC)`;
  }

  return {
    marketCap: moralisData.marketCap,
    price: moralisData.price,
    source: moralisData.source,
    confidence: moralisData.confidence,
    supply: 0,
    liquidity: moralisData.liquidity,
    warning,
  };
}

/**
 * Validate market cap against volume (sanity check)
 */
export function validateMCvsVolume(marketCap: number, volume24h: number): {
  valid: boolean;
  warning?: string;
} {
  if (marketCap === 0 || volume24h === 0) {
    return { valid: true }; // Can't validate without data
  }

  const ratio = marketCap / volume24h;

  // MC/Volume ratio > 10000 is suspicious (10000x MC with minimal trading)
  if (ratio > 10000) {
    return {
      valid: false,
      warning: `Suspicious MC/Volume ratio: ${ratio.toFixed(0)}x (MC: $${marketCap.toLocaleString()}, Vol: $${volume24h.toLocaleString()})`,
    };
  }

  // MC/Volume < 0.1 is also suspicious (more volume than MC in 24h)
  if (ratio < 0.1) {
    return {
      valid: false,
      warning: `Unusual trading volume relative to MC: ${(1/ratio).toFixed(0)}x daily turnover`,
    };
  }

  return { valid: true };
}

/**
 * Clear cache for a specific token (call when data seems stale)
 */
export function clearMCCache(tokenMint?: string): void {
  if (tokenMint) {
    mcCache.delete(tokenMint);
  } else {
    mcCache.clear();
  }
}
