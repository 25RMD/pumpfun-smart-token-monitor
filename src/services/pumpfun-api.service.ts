import axios from 'axios';
import { getCachedSolPrice } from './sol-price.service';
import { fetchGraduatedTokens, MoralisPumpFunToken } from './moralis.service';
import { getTokenCreator } from './onchain-data.service';

export interface RecentMigration {
  signature: string;
  mint: string;
  name: string;
  symbol: string;
  uri: string;
  pool: string;
  timestamp: number;
  marketCapSol?: number;
  creator?: string;
  // Extended data from Moralis
  priceUsd?: number;
  liquidity?: number;
  fullyDilutedValuation?: number;
}

/**
 * Fetch recent graduated/migrated tokens from pump.fun ecosystem
 * Uses Moralis API ONLY - no fallbacks
 * Also fetches creator address using Helius getAsset for historical tokens
 */
export async function fetchRecentMigrations(limit: number = 50): Promise<RecentMigration[]> {
  console.log(`📥 Fetching recent pump.fun migrations from Moralis (limit: ${limit})...`);
  
  try {
    const moralisTokens = await fetchGraduatedTokens(limit);
    
    if (moralisTokens.length === 0) {
      console.warn('⚠️ No graduated tokens from Moralis');
      return [];
    }
    
    console.log(`✅ Got ${moralisTokens.length} graduated tokens from Moralis`);
    
    // Map tokens first
    const migrations = moralisTokens.map((token: MoralisPumpFunToken) => {
      const priceUsd = token.priceUsd ? parseFloat(token.priceUsd) : undefined;
      const liquidity = token.liquidity ? parseFloat(token.liquidity) : undefined;
      const fullyDilutedValuation = token.fullyDilutedValuation ? parseFloat(token.fullyDilutedValuation) : undefined;
      const solPrice = getCachedSolPrice();
      
      return {
        signature: '',
        mint: token.tokenAddress,
        name: token.name || 'Unknown',
        symbol: token.symbol || 'TOKEN',
        uri: token.logo || '',
        pool: token.pairAddress || '',
        timestamp: token.graduatedAt ? new Date(token.graduatedAt).getTime() : Date.now(),
        marketCapSol: fullyDilutedValuation && solPrice 
          ? fullyDilutedValuation / solPrice 
          : undefined,
        priceUsd,
        liquidity,
        fullyDilutedValuation,
        creator: undefined, // Will be fetched below
      };
    });

    // Fetch creators for all tokens in parallel (batches of 5 to avoid rate limits)
    console.log(`🔍 Fetching creators for ${migrations.length} historical tokens...`);
    const batchSize = 5;
    for (let i = 0; i < migrations.length; i += batchSize) {
      const batch = migrations.slice(i, i + batchSize);
      const creatorPromises = batch.map(async (migration: RecentMigration) => {
        const creator = await getTokenCreator(migration.mint);
        return { mint: migration.mint, creator };
      });
      
      const results = await Promise.all(creatorPromises);
      for (const result of results) {
        const migration = migrations.find((m: RecentMigration) => m.mint === result.mint);
        if (migration && result.creator) {
          migration.creator = result.creator;
        }
      }
    }
    
    const withCreator = migrations.filter((m: RecentMigration) => m.creator).length;
    console.log(`✅ Got creators for ${withCreator}/${migrations.length} tokens`);
    
    return migrations;
  } catch (error) {
    console.error('Moralis graduated tokens fetch failed:', error instanceof Error ? error.message : error);
    return [];
  }
}

/**
 * Fetch token metadata from URI
 */
export async function fetchTokenMetadataFromUri(uri: string): Promise<{
  name?: string;
  symbol?: string;
  image?: string;
  description?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
} | null> {
  if (!uri) return null;

  try {
    let fetchUrl = uri;
    if (uri.startsWith('ipfs://')) {
      fetchUrl = `https://ipfs.io/ipfs/${uri.replace('ipfs://', '')}`;
    }

    const response = await axios.get(fetchUrl, { timeout: 5000 });
    return response.data;
  } catch {
    return null;
  }
}
