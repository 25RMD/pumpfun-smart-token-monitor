/**
 * Moralis API Service - SOLE data source for pump.fun GRADUATED tokens
 * 
 * For graduated tokens, we use:
 * - /exchange/pumpfun/graduated - Market cap (fullyDilutedValuation), price, liquidity, name, symbol
 * - /token/{address}/pairs - Volume, liquidity breakdown, price change
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

function getMoralisHeaders(): Record<string, string> {
  const apiKey = process.env.MORALIS_API_KEY;
  if (!apiKey) {
    console.error('❌ MORALIS_API_KEY not set');
  }
  return {
    'accept': 'application/json',
    'X-API-Key': apiKey || '',
  };
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

// ============ API FUNCTIONS ============

/**
 * Fetch graduated pump.fun tokens
 * Endpoint: GET /token/mainnet/exchange/pumpfun/graduated
 * 
 * This is the PRIMARY endpoint for graduated tokens.
 * Returns: tokenAddress, name, symbol, logo, priceUsd, liquidity, fullyDilutedValuation (MC)
 */
export async function fetchGraduatedTokens(limit: number = 50): Promise<MoralisPumpFunToken[]> {
  try {
    const response = await axios.get(
      `${MORALIS_BASE_URL}/token/mainnet/exchange/pumpfun/graduated`,
      {
        headers: getMoralisHeaders(),
        params: { limit },
        timeout: 15000,
      }
    );
    
    const tokens = response.data?.result || response.data || [];
    console.log(`✅ Moralis: Fetched ${tokens.length} graduated tokens`);
    return tokens;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      console.error(`Moralis graduated tokens fetch failed: ${error.response?.status || error.message}`);
    }
    return [];
  }
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
  } else {
    tokenCache.clear();
  }
}

/**
 * Check if Moralis API is configured
 */
export function isMoralisConfigured(): boolean {
  return !!process.env.MORALIS_API_KEY;
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
