import axios from 'axios';

/**
 * SOL Price Service
 * Fetches real SOL price from public APIs (no API keys needed)
 * Never returns fake/fallback prices - returns null if unavailable
 */

// Cache the price for 30 seconds to avoid rate limiting
let cachedPrice: number | null = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 30_000; // 30 seconds

/**
 * Get current SOL price in USD
 * Uses CoinGecko (primary) and Binance (secondary) - both free, no auth
 * Returns null if price cannot be fetched - NEVER returns fake data
 */
export async function getSolPrice(): Promise<number | null> {
  // Return cached price if still valid
  const now = Date.now();
  if (cachedPrice !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedPrice;
  }

  // Method 1: CoinGecko - Free public API, no auth needed
  // Rate limit: 10-30 calls/minute for free tier
  try {
    const response = await axios.get(
      'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd',
      { timeout: 5000 }
    );
    const price = response.data?.solana?.usd;
    if (typeof price === 'number' && price > 0) {
      cachedPrice = price;
      cacheTimestamp = now;
      return price;
    }
  } catch (e) {
    console.warn('CoinGecko price fetch failed:', e instanceof Error ? e.message : e);
  }

  // Method 2: Binance - Free public API, no auth needed
  // Rate limit: 1200 requests/minute
  try {
    const response = await axios.get(
      'https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT',
      { timeout: 5000 }
    );
    const price = parseFloat(response.data?.price);
    if (!isNaN(price) && price > 0) {
      cachedPrice = price;
      cacheTimestamp = now;
      return price;
    }
  } catch (e) {
    console.warn('Binance price fetch failed:', e instanceof Error ? e.message : e);
  }

  // Method 3: Kraken - Free public API, no auth needed
  try {
    const response = await axios.get(
      'https://api.kraken.com/0/public/Ticker?pair=SOLUSD',
      { timeout: 5000 }
    );
    const result = response.data?.result?.SOLUSD;
    const price = parseFloat(result?.c?.[0]); // 'c' is last trade closed
    if (!isNaN(price) && price > 0) {
      cachedPrice = price;
      cacheTimestamp = now;
      return price;
    }
  } catch (e) {
    console.warn('Kraken price fetch failed:', e instanceof Error ? e.message : e);
  }

  // All sources failed - return null, never fake data
  console.error('❌ All SOL price sources failed - cannot determine price');
  return null;
}

/**
 * Convert SOL amount to USD
 * Returns null if price unavailable
 */
export async function solToUsd(solAmount: number): Promise<number | null> {
  const price = await getSolPrice();
  if (price === null) return null;
  return solAmount * price;
}

/**
 * Convert USD amount to SOL
 * Returns null if price unavailable
 */
export async function usdToSol(usdAmount: number): Promise<number | null> {
  const price = await getSolPrice();
  if (price === null) return null;
  return usdAmount / price;
}

/**
 * Get cached price without fetching (for sync operations)
 * Returns null if no cached price available
 */
export function getCachedSolPrice(): number | null {
  const now = Date.now();
  if (cachedPrice !== null && now - cacheTimestamp < CACHE_TTL_MS) {
    return cachedPrice;
  }
  return null;
}
