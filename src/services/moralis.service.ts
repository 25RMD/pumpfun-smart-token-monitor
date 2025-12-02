import axios from 'axios';
import { TokenMetadata, PriceData } from '@/types';

const MORALIS_BASE_URL = 'https://solana-gateway.moralis.io';

const moralisClient = axios.create({
  baseURL: MORALIS_BASE_URL,
  headers: {
    'X-API-Key': process.env.MORALIS_API_KEY || '',
    'Accept': 'application/json',
  },
});

export interface MoralisTokenMetadata {
  name: string;
  symbol: string;
  decimals: number;
  supply: string;
  mint: string;
  standard: string;
  metaplex?: {
    metadataUri?: string;
    updateAuthority?: string;
    sellerFeeBasisPoints?: number;
    primarySaleHappened?: boolean;
    isMutable?: boolean;
    masterEdition?: boolean;
    creators?: Array<{ address: string; share: number; verified: boolean }>;
  };
}

export interface MoralisPriceData {
  usdPrice: number;
  exchangeName: string;
  exchangeAddress: string;
  nativePrice?: {
    value: string;
    symbol: string;
    name: string;
    decimals: number;
  };
}

/**
 * Fetches token metadata from Moralis
 */
export async function fetchTokenMetadata(tokenAddress: string): Promise<TokenMetadata> {
  try {
    const response = await moralisClient.get<MoralisTokenMetadata>(
      `/token/mainnet/${tokenAddress}/metadata`
    );
    
    const data = response.data;
    
    // Try to fetch extended metadata from metaplex URI if available
    let extendedMetadata: Record<string, unknown> = {};
    if (data.metaplex?.metadataUri) {
      try {
        const metadataResponse = await axios.get(data.metaplex.metadataUri, { timeout: 5000 });
        extendedMetadata = metadataResponse.data;
      } catch {
        console.warn(`Failed to fetch extended metadata for ${tokenAddress}`);
      }
    }

    // Extract creator from metaplex or use default
    const creator = data.metaplex?.creators?.[0]?.address || 
                   data.metaplex?.updateAuthority || 
                   '';

    return {
      name: data.name || (extendedMetadata.name as string) || 'Unknown',
      symbol: data.symbol || (extendedMetadata.symbol as string) || 'UNKNOWN',
      description: (extendedMetadata.description as string) || '',
      creator,
      image: (extendedMetadata.image as string) || '',
      decimals: data.decimals || 6,
      supply: data.supply || '0',
      twitter: (extendedMetadata.twitter as string) || (extendedMetadata.external_url as string) || undefined,
      telegram: (extendedMetadata.telegram as string) || undefined,
      website: (extendedMetadata.website as string) || (extendedMetadata.external_url as string) || undefined,
    };
  } catch (error) {
    console.error(`Error fetching token metadata for ${tokenAddress}:`, error);
    throw error;
  }
}

/**
 * Fetches token price data from Moralis
 */
export async function fetchPriceData(tokenAddress: string): Promise<PriceData> {
  try {
    const response = await moralisClient.get<MoralisPriceData>(
      `/token/mainnet/${tokenAddress}/price`
    );
    
    const data = response.data;

    return {
      price: data.usdPrice || 0,
      volume24h: 0, // Moralis doesn't provide this directly
      marketCap: 0, // Will calculate from supply * price
      liquidity: 0, // Will get from other sources
      trades24h: 0,
      priceChange24h: 0,
    };
  } catch (error) {
    // Price might not be available for new tokens
    console.warn(`Price data not available for ${tokenAddress}`);
    return {
      price: 0,
      volume24h: 0,
      marketCap: 0,
      liquidity: 0,
      trades24h: 0,
      priceChange24h: 0,
    };
  }
}

/**
 * Gets token accounts by owner (for checking holdings)
 */
export async function getTokenAccountsByOwner(
  ownerAddress: string,
  tokenMint: string
): Promise<{ amount: number } | null> {
  try {
    const response = await moralisClient.get(
      `/account/mainnet/${ownerAddress}/tokens`,
      {
        params: { token_addresses: tokenMint }
      }
    );
    
    const tokens = response.data;
    if (Array.isArray(tokens) && tokens.length > 0) {
      return { amount: parseFloat(tokens[0].amount || '0') };
    }
    return null;
  } catch (error) {
    console.warn(`Failed to get token accounts for ${ownerAddress}`);
    return null;
  }
}
