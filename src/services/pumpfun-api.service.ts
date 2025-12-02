import axios from 'axios';

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
}

/**
 * Fetch recent graduated tokens - tries multiple sources
 */
export async function fetchRecentMigrations(limit: number = 20): Promise<RecentMigration[]> {
  console.log('📥 Fetching recent migrations...');
  
  // Try DexScreener first (most reliable)
  let migrations = await fetchFromDexScreener(limit);
  
  if (migrations.length > 0) {
    console.log(`✅ Found ${migrations.length} tokens from DexScreener`);
    return migrations;
  }

  // Fallback to Helius
  console.log('Trying Helius as fallback...');
  migrations = await fetchFromHelius(limit);
  
  if (migrations.length > 0) {
    console.log(`✅ Found ${migrations.length} tokens from Helius`);
    return migrations;
  }

  console.warn('⚠️ No tokens found from any source');
  return [];
}

interface DexScreenerPair {
  chainId: string;
  dexId?: string;
  pairAddress?: string;
  pairCreatedAt?: number;
  marketCap?: number;
  baseToken?: {
    address: string;
    name: string;
    symbol: string;
  };
  info?: {
    imageUrl?: string;
  };
}

/**
 * Fetch graduated tokens from DexScreener (most reliable source)
 */
export async function fetchFromDexScreener(limit: number = 20): Promise<RecentMigration[]> {
  try {
    console.log('🔍 Searching DexScreener for recent Raydium tokens...');
    
    // Search for new Solana tokens on Raydium (where graduated pump.fun tokens go)
    const pairsResponse = await axios.get(
      'https://api.dexscreener.com/latest/dex/tokens/solana',
      { timeout: 15000 }
    );

    let pairs: DexScreenerPair[] = pairsResponse.data?.pairs || [];
    
    // If no pairs, try search endpoint
    if (pairs.length === 0) {
      console.log('Trying DexScreener search...');
      const searchResponse = await axios.get(
        'https://api.dexscreener.com/latest/dex/search',
        {
          params: { q: 'pump' },
          timeout: 15000,
        }
      );
      pairs = searchResponse.data?.pairs || [];
    }
    
    // Get recent Raydium pairs on Solana (recently created)
    const recentPairs = pairs
      .filter((pair: DexScreenerPair) => {
        const ageHours = (Date.now() - (pair.pairCreatedAt || 0)) / (1000 * 60 * 60);
        return pair.chainId === 'solana' && ageHours < 72;
      })
      .sort((a: DexScreenerPair, b: DexScreenerPair) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0))
      .slice(0, limit);

    console.log(`Found ${recentPairs.length} recent pairs from DexScreener`);

    return recentPairs.map((pair: DexScreenerPair) => ({
      signature: '',
      mint: pair.baseToken?.address || '',
      name: pair.baseToken?.name || 'Unknown',
      symbol: pair.baseToken?.symbol || 'UNKNOWN',
      uri: pair.info?.imageUrl || '',
      pool: pair.pairAddress || '',
      timestamp: pair.pairCreatedAt || Date.now(),
      marketCapSol: pair.marketCap ? pair.marketCap / 200 : undefined,
    }));
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Error fetching from DexScreener:', message);
    return [];
  }
}

/**
 * Fetch recent migrations from Helius by parsing program transactions
 */
async function fetchFromHelius(limit: number = 20): Promise<RecentMigration[]> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    console.warn('HELIUS_API_KEY not configured');
    return [];
  }

  try {
    // Fetch recent transactions from the Pump.fun migration program
    const MIGRATION_PROGRAM = '39azUYFWPz3VHgKCf3VChUwbpURdCHRxjWVowf5jUJjg';
    
    const response = await axios.get(
      `https://api.helius.xyz/v0/addresses/${MIGRATION_PROGRAM}/transactions`,
      {
        params: {
          'api-key': apiKey,
          limit: limit * 3,
        },
        timeout: 15000,
      }
    );

    const transactions = response.data || [];
    const migrations: RecentMigration[] = [];
    const seenMints = new Set<string>();

    for (const tx of transactions) {
      // Look for token transfers in the transaction
      const tokenTransfers = tx.tokenTransfers || [];
      
      for (const transfer of tokenTransfers) {
        const mint = transfer.mint;
        if (mint && !seenMints.has(mint)) {
          seenMints.add(mint);
          migrations.push({
            signature: tx.signature,
            mint: mint,
            name: 'Unknown Token',
            symbol: 'TOKEN',
            uri: '',
            pool: '',
            timestamp: tx.timestamp ? tx.timestamp * 1000 : Date.now(),
            creator: tx.feePayer,
          });

          if (migrations.length >= limit) break;
        }
      }
      if (migrations.length >= limit) break;
    }

    return migrations;
  } catch (error) {
    console.error('Error fetching from Helius:', error);
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
