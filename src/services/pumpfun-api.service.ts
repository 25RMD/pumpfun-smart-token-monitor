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
export async function fetchRecentMigrations(limit: number = 40): Promise<RecentMigration[]> {
  console.log('📥 Fetching recent migrations...');
  
  // Try Helius first (most reliable for Pump.fun migrations)
  let migrations = await fetchFromHelius(limit);
  
  if (migrations.length >= limit) {
    console.log(`✅ Found ${migrations.length} tokens from Helius`);
    return migrations;
  }

  // Try DexScreener as fallback
  console.log('Trying DexScreener as additional source...');
  const dexMigrations = await fetchFromDexScreener(limit);
  
  // Merge and dedupe
  const seenMints = new Set(migrations.map(m => m.mint));
  for (const m of dexMigrations) {
    if (!seenMints.has(m.mint)) {
      migrations.push(m);
      seenMints.add(m.mint);
    }
  }
  
  if (migrations.length > 0) {
    console.log(`✅ Found ${migrations.length} total tokens`);
    return migrations.slice(0, limit);
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
 * Fetch graduated tokens from DexScreener (searches for pump.fun tokens on Raydium)
 */
export async function fetchFromDexScreener(limit: number = 40): Promise<RecentMigration[]> {
  try {
    console.log('🔍 Fetching new pairs from DexScreener...');
    
    // Use the token profiles endpoint for recently boosted/new tokens
    // or search for tokens that end with "pump" which is the pump.fun signature
    const searchResponse = await axios.get(
      'https://api.dexscreener.com/token-profiles/latest/v1',
      { timeout: 15000 }
    );

    const profiles = searchResponse.data || [];
    
    // Filter for Solana tokens
    const solanaTokens = profiles
      .filter((p: { chainId: string }) => p.chainId === 'solana')
      .slice(0, limit * 2);

    console.log(`Found ${solanaTokens.length} recent Solana tokens from DexScreener`);
    
    if (solanaTokens.length === 0) {
      // Fallback: try getting new pairs
      const pairsResponse = await axios.get(
        'https://api.dexscreener.com/latest/dex/pairs/solana',
        { timeout: 15000 }
      );
      
      const pairs: DexScreenerPair[] = pairsResponse.data?.pairs || [];
      const recentPairs = pairs
        .filter((pair: DexScreenerPair) => {
          if (!pair.dexId?.toLowerCase().includes('raydium')) return false;
          const ageHours = (Date.now() - (pair.pairCreatedAt || 0)) / (1000 * 60 * 60);
          return ageHours < 24;
        })
        .sort((a: DexScreenerPair, b: DexScreenerPair) => (b.pairCreatedAt || 0) - (a.pairCreatedAt || 0))
        .slice(0, limit);

      console.log(`Found ${recentPairs.length} recent Raydium pairs`);
      
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
    }

    return solanaTokens.map((token: { tokenAddress?: string; description?: string; icon?: string }) => ({
      signature: '',
      mint: token.tokenAddress || '',
      name: token.description?.slice(0, 30) || 'Unknown',
      symbol: 'TOKEN',
      uri: token.icon || '',
      pool: '',
      timestamp: Date.now(),
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
async function fetchFromHelius(limit: number = 40): Promise<RecentMigration[]> {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    console.warn('HELIUS_API_KEY not configured');
    return [];
  }

  try {
    // Use Helius Enhanced Transactions API with the correct format
    const PUMP_FUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
    
    const response = await axios.post(
      `https://api.helius.xyz/v0/transactions/?api-key=${apiKey}`,
      {
        query: {
          accounts: [PUMP_FUN_PROGRAM],
          options: {
            limit: limit * 3,
          }
        }
      },
      { timeout: 15000 }
    );

    const transactions = response.data || [];
    const migrations: RecentMigration[] = [];
    const seenMints = new Set<string>();

    for (const tx of transactions) {
      // Look for token transfers in the transaction
      const tokenTransfers = tx.tokenTransfers || [];
      
      for (const transfer of tokenTransfers) {
        const mint = transfer.mint;
        if (mint && !seenMints.has(mint) && mint.endsWith('pump')) {
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

    console.log(`Found ${migrations.length} pump.fun tokens from Helius`);
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
