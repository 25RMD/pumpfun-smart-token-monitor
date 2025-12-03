/**
 * Moralis API Service - SOLE data source for pump.fun GRADUATED tokens
 * 
 * For graduated tokens, we use:
 * - /exchange/pumpfun/graduated - Market cap (fullyDilutedValuation), price, liquidity, name, symbol
 * - /token/{address}/pairs - Volume, liquidity breakdown, price change
 * - /token/mainnet/holders/{address} - Holder count, concentration stats
 * - /token/{address}/top-holders - Dev holdings, top holder breakdown
 * 
 * API Documentation: https://docs.moralis.io/web3-data-api/solana/reference
 */

import axios from 'axios';

const MORALIS_BASE_URL = 'https://solana-gateway.moralis.io';

// Cache for token data
interface TokenCache {
  data: MoralisTokenData;
  timestamp: number;
}
const tokenCache = new Map<string, TokenCache>();
const CACHE_TTL = 30_000; // 30 seconds

// Cache for holder data (longer TTL since it changes less frequently)
interface HolderCache {
  data: MoralisHolderStats;
  timestamp: number;
}
const holderCache = new Map<string, HolderCache>();
const HOLDER_CACHE_TTL = 60_000; // 1 minute

// Track which API key to use (rotates through keys on 401/429)
let currentKeyIndex = 0;

function getMoralisHeaders(): Record<string, string> {
  const keys = [
    process.env.MORALIS_API_KEY,
    process.env.MORALIS_API_KEY_FALLBACK,
    process.env.MORALIS_API_KEY_FALLBACK_3,
  ].filter(Boolean) as string[];
  
  const apiKey = keys[currentKeyIndex % keys.length];
  
  if (!apiKey) {
    console.error('❌ No MORALIS_API_KEY set');
  }
  return {
    'accept': 'application/json',
    'X-API-Key': apiKey || '',
  };
}

// Switch to next API key on 401/429 error
export function switchToFallbackKey(): void {
  const keys = [
    process.env.MORALIS_API_KEY,
    process.env.MORALIS_API_KEY_FALLBACK,
    process.env.MORALIS_API_KEY_FALLBACK_3,
  ].filter(Boolean);
  
  if (keys.length > 1) {
    currentKeyIndex = (currentKeyIndex + 1) % keys.length;
    console.log(`🔄 Switching to Moralis API key #${currentKeyIndex + 1}`);
  }
}

// ============ TYPE DEFINITIONS ============

/**
 * Graduated token from /exchange/pumpfun/graduated endpoint
 * This is the PRIMARY source for market cap data
 */
export interface MoralisPumpFunToken {
  tokenAddress: string;
  name?: string;
  symbol?: string;
  logo?: string;
  decimals?: string;
  priceNative?: string;      // Price in SOL
  priceUsd?: string;         // Price in USD (string from API)
  liquidity?: string;        // Liquidity in USD (string from API)
  fullyDilutedValuation?: string; // Market Cap = price × 1B (string from API)
  graduatedAt?: string;
  pairAddress?: string;
}

/**
 * Pair data from /token/{address}/pairs endpoint
 * Used for volume and detailed trading stats
 */
export interface MoralisPair {
  exchangeAddress: string;
  exchangeName: string;
  pairAddress: string;
  pairLabel: string;
  liquidityUsd: number;
  usdPrice: number;
  usdPrice24hrPercentChange?: number;
  usdPrice24hrUsdChange?: number;
  volume24hrUsd?: number;
  volume24hrNative?: number;
}

export interface MoralisPairsResponse {
  pairs: MoralisPair[];
}

/**
 * Complete token data combining graduated endpoint + pairs endpoint
 */
export interface MoralisTokenData {
  // Basic info (from /graduated)
  address: string;
  name: string;
  symbol: string;
  logo?: string;
  
  // Market data (from /graduated - ACCURATE)
  priceUsd: number;
  marketCap: number;      // fullyDilutedValuation from /graduated (price × 1B)
  liquidity: number;      // From /graduated
  
  // Trading data (from /pairs)
  totalVolume24h: number;
  priceChange24h: number;
  pairs: MoralisPair[];
  
  // Timestamps
  graduatedAt?: string;
  fetchedAt: number;
}

/**
 * Holder statistics from /token/mainnet/holders/{address}
 */
export interface MoralisHolderStats {
  totalHolders: number;
  holderChange24hr?: number;
  holderChange7d?: number;
  concentration?: {
    top10Percent: number;
    top25Percent?: number;
    top50Percent?: number;
    top100Percent?: number;
  };
  acquisition?: {
    swapPercent: number;
    transferPercent: number;
    airdropPercent?: number;
  };
}

/**
 * Top holder from /token/{address}/top-holders
 * Note: API returns `percentageRelativeToTotalSupply`, not `percentageOfSupply`
 */
export interface MoralisTopHolder {
  ownerAddress: string;
  balance: string;
  balanceFormatted: number;
  percentageRelativeToTotalSupply: number; // This is the actual field name from API
  usdValue?: number;
  isContract?: boolean;
  label?: string;
}

/**
 * Combined holder data for a token
 */
export interface MoralisHolderData {
  totalHolders: number;
  top10Percent: number;
  devHoldingsPercent: number;
  topHolders: MoralisTopHolder[];
  source: 'moralis' | 'fallback';
}

// ============ API FUNCTIONS ============

/**
 * Fetch graduated pump.fun tokens
 * Endpoint: GET /token/mainnet/exchange/pumpfun/graduated
 * 
 * This is the PRIMARY endpoint for graduated tokens.
 * Returns: tokenAddress, name, symbol, logo, priceUsd, liquidity, fullyDilutedValuation (MC)
 */
export async function fetchGraduatedTokens(limit: number = 50): Promise<MoralisPumpFunToken[]> {
  const keys = [
    process.env.MORALIS_API_KEY,
    process.env.MORALIS_API_KEY_FALLBACK,
    process.env.MORALIS_API_KEY_FALLBACK_3,
  ].filter(Boolean) as string[];

  // Try each key until one works
  for (let i = 0; i < keys.length; i++) {
    try {
      const response = await axios.get(
        `${MORALIS_BASE_URL}/token/mainnet/exchange/pumpfun/graduated`,
        {
          headers: {
            'accept': 'application/json',
            'X-API-Key': keys[i],
          },
          params: { limit },
          timeout: 15000,
        }
      );
      
      const tokens = response.data?.result || response.data || [];
      console.log(`✅ Moralis (key #${i + 1}): Fetched ${tokens.length} graduated tokens`);
      // Update current key index for other requests
      currentKeyIndex = i;
      return tokens;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401 || status === 429) {
          console.log(`⚠️ Moralis key #${i + 1} failed (${status}), trying next...`);
          continue; // Try next key
        }
        console.error(`Moralis graduated tokens fetch failed: ${status || error.message}`);
      }
      // For non-auth errors, don't try other keys
      break;
    }
  }
  
  console.error('❌ All Moralis API keys exhausted');
  return [];
}

/**
 * Fetch token pairs for volume and detailed stats
 * Endpoint: GET /token/mainnet/{address}/pairs
 * 
 * Returns: volume24hrUsd, liquidityUsd, usdPrice24hrPercentChange per pair
 */
export async function fetchTokenPairs(tokenMint: string): Promise<MoralisPairsResponse | null> {
  try {
    const response = await axios.get(
      `${MORALIS_BASE_URL}/token/mainnet/${tokenMint}/pairs`,
      {
        headers: getMoralisHeaders(),
        timeout: 8000,
      }
    );
    
    return response.data as MoralisPairsResponse;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.warn(`Moralis pairs fetch failed for ${tokenMint.slice(0, 8)}: ${error.response?.status || error.message}`);
    }
    return null;
  }
}

/**
 * Fetch complete token data for a graduated token
 * Combines /pairs endpoint data with cached graduated data
 * 
 * For graduated tokens, market cap comes from the graduated endpoint (fullyDilutedValuation)
 * NOT from /metadata (which can be wrong for tokens with >1B total supply)
 */
export async function fetchTokenData(tokenMint: string): Promise<MoralisTokenData | null> {
  // Check cache first
  const cached = tokenCache.get(tokenMint);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  
  try {
    // Fetch pairs data for volume and price change
    const pairsResponse = await fetchTokenPairs(tokenMint);
    const pairs = pairsResponse?.pairs || [];
    
    // Aggregate pairs data
    let totalVolume24h = 0;
    let priceChange24h = 0;
    let hasChange = false;
    
    for (const pair of pairs) {
      totalVolume24h += pair.volume24hrUsd || 0;
      if (pair.usdPrice24hrPercentChange !== undefined && !hasChange) {
        priceChange24h = pair.usdPrice24hrPercentChange;
        hasChange = true;
      }
    }
    
    // Note: For market cap, price, and liquidity, we rely on data passed from
    // the /graduated endpoint via the event object in token-processor
    // This function only fetches additional trading data (volume, pairs)
    
    const result: MoralisTokenData = {
      address: tokenMint,
      name: 'Unknown',
      symbol: 'TOKEN',
      logo: undefined,
      
      priceUsd: pairs[0]?.usdPrice || 0,
      marketCap: 0, // Will be set from event.marketCap (from /graduated)
      liquidity: pairs.reduce((sum, p) => sum + (p.liquidityUsd || 0), 0),
      
      totalVolume24h,
      priceChange24h,
      pairs,
      
      fetchedAt: Date.now(),
    };
    
    // Cache the result
    tokenCache.set(tokenMint, {
      data: result,
      timestamp: Date.now(),
    });
    
    return result;
  } catch (error) {
    console.error(`Error fetching token data for ${tokenMint}:`, error);
    return null;
  }
}

/**
 * Clear cache for a token or all tokens
 */
export function clearMoralisCache(tokenMint?: string): void {
  if (tokenMint) {
    tokenCache.delete(tokenMint);
    holderCache.delete(tokenMint);
  } else {
    tokenCache.clear();
    holderCache.clear();
  }
}

/**
 * Check if Moralis API is configured
 */
export function isMoralisConfigured(): boolean {
  return !!process.env.MORALIS_API_KEY;
}

// ============ HOLDER DATA FUNCTIONS ============

/**
 * Fetch holder statistics for a token
 * Endpoint: GET /token/mainnet/holders/{tokenAddress}
 * 
 * Returns: totalHolders, holderChange24hr, concentration stats
 */
export async function fetchHolderStats(tokenMint: string): Promise<MoralisHolderStats | null> {
  try {
    const response = await axios.get(
      `${MORALIS_BASE_URL}/token/mainnet/holders/${tokenMint}`,
      {
        headers: getMoralisHeaders(),
        timeout: 8000,
      }
    );
    
    const data = response.data;
    if (data && data.totalHolders !== undefined) {
      console.log(`✅ Moralis holders: ${tokenMint.slice(0, 8)} has ${data.totalHolders} holders`);
      return data as MoralisHolderStats;
    }
    return null;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // 404 is common for new tokens - don't log as error
      if (error.response?.status !== 404) {
        console.warn(`Moralis holders fetch failed for ${tokenMint.slice(0, 8)}: ${error.response?.status || error.message}`);
      }
    }
    return null;
  }
}

/**
 * Fetch top holders for a token
 * Endpoint: GET /token/mainnet/{tokenAddress}/top-holders
 * 
 * Returns: array of top holders with percentageOfSupply
 */
export async function fetchTopHolders(tokenMint: string, limit: number = 20): Promise<MoralisTopHolder[]> {
  try {
    const response = await axios.get(
      `${MORALIS_BASE_URL}/token/mainnet/${tokenMint}/top-holders`,
      {
        headers: getMoralisHeaders(),
        params: { limit },
        timeout: 8000,
      }
    );
    
    const holders = response.data?.result || response.data || [];
    if (holders.length > 0) {
      console.log(`✅ Moralis top holders: ${tokenMint.slice(0, 8)} - got ${holders.length} holders`);
      // Debug: Log first holder's percentage
      if (holders[0]?.percentageRelativeToTotalSupply !== undefined) {
        console.log(`   Top holder owns: ${holders[0].percentageRelativeToTotalSupply}%`);
      }
    }
    return holders as MoralisTopHolder[];
  } catch (error) {
    if (axios.isAxiosError(error)) {
      // 404 is common for new tokens
      if (error.response?.status !== 404) {
        console.warn(`Moralis top holders fetch failed for ${tokenMint.slice(0, 8)}: ${error.response?.status || error.message}`);
      }
    }
    return [];
  }
}

/**
 * Get complete holder data for a token (with caching)
 * Combines holder stats and top holders to get:
 * - Total holder count
 * - Top 10 concentration %
 * - Dev holdings % (estimated from top holder without labels)
 */
export async function fetchMoralisHolderData(
  tokenMint: string,
  creatorAddress?: string
): Promise<MoralisHolderData | null> {
  // Note: We don't cache with creator address since it may vary per call
  // Always fetch fresh to properly check dev holdings
  
  try {
    // Fetch both in parallel
    const [holderStats, topHolders] = await Promise.all([
      fetchHolderStats(tokenMint),
      fetchTopHolders(tokenMint, 20),
    ]);

    // If we got holder stats, cache them
    if (holderStats) {
      holderCache.set(tokenMint, {
        data: holderStats,
        timestamp: Date.now(),
      });
    }

    // Calculate metrics
    const totalHolders = holderStats?.totalHolders || -1;
    
    // Top 10 concentration - calculate from top holders if API doesn't provide it
    let top10Percent = holderStats?.concentration?.top10Percent || 0;
    if (!top10Percent && topHolders.length > 0) {
      // Calculate from top holders - use first 10 (or all if less than 10)
      const top10 = topHolders.slice(0, 10);
      top10Percent = top10.reduce((sum, h) => {
        // API uses percentageRelativeToTotalSupply, not percentageOfSupply
        const pct = h.percentageRelativeToTotalSupply || 0;
        return sum + pct;
      }, 0);
      
      if (top10Percent > 0) {
        console.log(`📊 Moralis top10: ${tokenMint.slice(0, 8)} - calculated ${top10Percent.toFixed(1)}% from ${top10.length} holders`);
      }
    }

    // Dev holdings - check if creator is in top holders
    let devHoldingsPercent = 0;
    if (creatorAddress && topHolders.length > 0) {
      console.log(`🔍 Moralis dev check: ${tokenMint.slice(0, 8)} - looking for creator ${creatorAddress.slice(0, 8)} in ${topHolders.length} top holders`);
      const devWallet = topHolders.find(
        h => h.ownerAddress.toLowerCase() === creatorAddress.toLowerCase()
      );
      if (devWallet) {
        devHoldingsPercent = devWallet.percentageRelativeToTotalSupply || 0;
        console.log(`👤 Moralis dev: ${tokenMint.slice(0, 8)} - creator ${creatorAddress.slice(0, 8)} owns ${devHoldingsPercent.toFixed(1)}%`);
      } else {
        console.log(`⚠️ Creator not in top holders for ${tokenMint.slice(0, 8)}`);
      }
    } else if (!creatorAddress) {
      console.log(`⚠️ No creator address provided for ${tokenMint.slice(0, 8)}`);
    }
    
    // Also check for labeled dev/team wallets (Moralis sometimes labels known wallets)
    for (const holder of topHolders) {
      if (holder.label && (
        holder.label.toLowerCase().includes('team') ||
        holder.label.toLowerCase().includes('dev') ||
        holder.label.toLowerCase().includes('founder')
      )) {
        devHoldingsPercent += holder.percentageRelativeToTotalSupply || 0;
      }
    }

    return {
      totalHolders,
      top10Percent,
      devHoldingsPercent,
      topHolders,
      source: 'moralis',
    };
  } catch (error) {
    console.error(`Error fetching Moralis holder data for ${tokenMint}:`, error);
    return null;
  }
}

// ============ MARKET CAP HELPER ============

interface MoralisMCResult {
  marketCap: number;
  price: number;
  liquidity: number;
  source: string;
  confidence: 'high' | 'medium' | 'low';
}

/**
 * Get market cap for a token by looking it up in graduated tokens
 * Note: For best accuracy, use event.marketCap from pumpfun-api which 
 * uses the /graduated endpoint directly
 * 
 * This is a fallback for when we need to look up a token individually
 */
export async function getMoralisMarketCap(tokenMint: string): Promise<MoralisMCResult> {
  try {
    // First check if this token is in the graduated tokens list
    const graduatedTokens = await fetchGraduatedTokens(100);
    const token = graduatedTokens.find(t => t.tokenAddress === tokenMint);
    
    if (token) {
      const marketCap = parseFloat(token.fullyDilutedValuation || '0');
      const price = parseFloat(token.priceUsd || '0');
      const liquidity = parseFloat(token.liquidity || '0');
      
      return {
        marketCap,
        price,
        liquidity,
        source: 'Moralis Graduated',
        confidence: 'high',
      };
    }
    
    // Fallback: get pairs data and calculate from liquidity
    const pairsData = await fetchTokenPairs(tokenMint);
    if (pairsData?.pairs?.length) {
      const pairs = pairsData.pairs;
      const price = pairs[0].usdPrice || 0;
      const liquidity = pairs.reduce((sum, p) => sum + (p.liquidityUsd || 0), 0);
      
      // For pump.fun tokens, estimate MC as price × 1B (circulating supply)
      const estimatedMC = price * 1_000_000_000;
      
      return {
        marketCap: estimatedMC,
        price,
        liquidity,
        source: 'Moralis Pairs (estimated)',
        confidence: 'medium',
      };
    }
    
    return {
      marketCap: 0,
      price: 0,
      liquidity: 0,
      source: 'none',
      confidence: 'low',
    };
  } catch (error) {
    console.error(`getMoralisMarketCap error for ${tokenMint}:`, error);
    return {
      marketCap: 0,
      price: 0,
      liquidity: 0,
      source: 'error',
      confidence: 'low',
    };
  }
}

// ============ TRADING STATS ============

interface MoralisTradingStats {
  trades24h: number;
  buys24h: number;
  sells24h: number;
  volume24h: number;
  uniqueTraders24h: number;
}

/**
 * Fetch 24hr trading statistics from Moralis swaps endpoint
 * Endpoint: GET /token/mainnet/{address}/swaps
 */
export async function fetchMoralisTradingStats(tokenMint: string): Promise<MoralisTradingStats | null> {
  const now = Date.now();
  const oneDayAgo = now - 24 * 60 * 60 * 1000;
  
  try {
    // Fetch recent swaps - paginate to get 24h of data
    let allSwaps: Array<{
      transactionType: string;
      totalValueUsd: number;
      walletAddress: string;
      blockTimestamp: string;
    }> = [];
    let cursor: string | null = null;
    let pageCount = 0;
    const maxPages = 5; // Limit pagination to avoid too many requests
    
    while (pageCount < maxPages) {
      const params: Record<string, string | number> = { limit: 100 };
      if (cursor) {
        params.cursor = cursor;
      }
      
      const response = await axios.get(
        `${MORALIS_BASE_URL}/token/mainnet/${tokenMint}/swaps`,
        {
          headers: getMoralisHeaders(),
          params,
          timeout: 8000,
        }
      );
      
      const swaps = response.data?.result || [];
      if (swaps.length === 0) break;
      
      // Filter to last 24h
      for (const swap of swaps) {
        const swapTime = new Date(swap.blockTimestamp).getTime();
        if (swapTime >= oneDayAgo) {
          allSwaps.push({
            transactionType: swap.transactionType,
            totalValueUsd: swap.totalValueUsd || 0,
            walletAddress: swap.walletAddress,
            blockTimestamp: swap.blockTimestamp,
          });
        } else {
          // Swaps are sorted by time, so we can stop
          cursor = null;
          break;
        }
      }
      
      cursor = response.data?.cursor;
      if (!cursor) break;
      pageCount++;
    }
    
    // Calculate stats
    const buys = allSwaps.filter(s => s.transactionType === 'buy');
    const sells = allSwaps.filter(s => s.transactionType === 'sell');
    const uniqueTraders = new Set(allSwaps.map(s => s.walletAddress)).size;
    const volume = allSwaps.reduce((sum, s) => sum + s.totalValueUsd, 0);
    
    if (allSwaps.length > 0) {
      console.log(`📈 Moralis trades: ${tokenMint.slice(0, 8)} - ${allSwaps.length} trades (${buys.length} buys, ${sells.length} sells)`);
    }
    
    return {
      trades24h: allSwaps.length,
      buys24h: buys.length,
      sells24h: sells.length,
      volume24h: volume,
      uniqueTraders24h: uniqueTraders,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response?.status !== 404) {
        console.warn(`Moralis swaps fetch failed for ${tokenMint.slice(0, 8)}: ${error.response?.status || error.message}`);
      }
    }
    return null;
  }
}
