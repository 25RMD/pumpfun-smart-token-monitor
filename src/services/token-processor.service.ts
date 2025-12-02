import { TokenAnalysis, MigrationEvent, MonitorStats } from '@/types';
import { fetchTokenMetadata } from './moralis.service';
import { fetchDexScreenerData } from './dexscreener.service';
import { fetchOnChainTokenData, getAccurateHolderCount } from './onchain-data.service';
import { fetchTokenTransactions } from './bitquery.service';
import { ScamFilterEngine } from './scam-filter.engine';

const filterEngine = new ScamFilterEngine({
  minScore: parseInt(process.env.MIN_SCORE_THRESHOLD || '60'),
  maxDevHoldings: parseFloat(process.env.MAX_DEV_HOLDINGS || '0.15'),
  minHolders: parseInt(process.env.MIN_HOLDERS || '50'),
});

// In-memory storage for processed tokens
const processedTokens: TokenAnalysis[] = [];
const stats: MonitorStats = {
  monitored: 0,
  passed: 0,
  filtered: 0,
};

// Timeout wrapper for API calls
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms))
  ]);
}

/**
 * Processes a new migration event and analyzes the token
 */
export async function processNewMigration(
  event: MigrationEvent,
  onTokenAnalyzed?: (token: TokenAnalysis) => void
): Promise<TokenAnalysis | null> {
  const tokenAddress = event.mint;

  console.log(`Processing new migration: ${tokenAddress.slice(0, 8)}...`);
  stats.monitored++;

  const TIMEOUT_MS = 8000; // 8 second timeout

  try {
    // Default values for fallbacks
    const defaultMetadata = {
      name: event.name || 'Unknown',
      symbol: event.symbol || 'UNKNOWN',
      description: '',
      creator: event.creator || '',
      image: '',
      decimals: 6,
      supply: '0',
    };

    // Fetch on-chain data FIRST (most reliable - direct from blockchain)
    const onChainData = await withTimeout(
      fetchOnChainTokenData(tokenAddress, event.creator),
      TIMEOUT_MS,
      null
    );

    // Fetch metadata and optional DexScreener data in parallel
    const [moralisMetadata, dexScreenerData, transactions, accurateHolderCount] = await Promise.all([
      withTimeout(
        fetchTokenMetadata(tokenAddress).catch(() => defaultMetadata),
        TIMEOUT_MS,
        defaultMetadata
      ),
      withTimeout(
        fetchDexScreenerData(tokenAddress).catch(() => null),
        TIMEOUT_MS,
        null
      ),
      withTimeout(
        fetchTokenTransactions(tokenAddress).catch(() => []),
        TIMEOUT_MS,
        []
      ),
      withTimeout(
        getAccurateHolderCount(tokenAddress).catch(() => 0),
        5000,
        0
      ),
    ]);

    // Merge metadata from DexScreener and Moralis
    const metadata = {
      ...moralisMetadata,
      name: moralisMetadata.name || event.name || 'Unknown',
      symbol: moralisMetadata.symbol || event.symbol || 'UNKNOWN',
      image: dexScreenerData?.metadata?.image || moralisMetadata.image || '',
      twitter: dexScreenerData?.metadata?.twitter || (moralisMetadata as { twitter?: string }).twitter,
      telegram: dexScreenerData?.metadata?.telegram || (moralisMetadata as { telegram?: string }).telegram,
      website: dexScreenerData?.metadata?.website || (moralisMetadata as { website?: string }).website,
    };

    // Build price data - prefer on-chain, then DexScreener, then event data
    const priceData = {
      price: onChainData?.price || dexScreenerData?.priceData?.price || 0,
      volume24h: dexScreenerData?.priceData?.volume24h || 0,
      marketCap: dexScreenerData?.priceData?.marketCap || event.marketCap || 0,
      liquidity: onChainData?.liquidity || dexScreenerData?.priceData?.liquidity || event.liquidity || 0,
      trades24h: dexScreenerData?.priceData?.trades24h || 0,
      priceChange24h: dexScreenerData?.priceData?.priceChange24h || 0,
    };

    // Use on-chain holder data
    const holders = onChainData?.holders || [];
    const devHoldings = onChainData?.devHoldings || 0;

    // Determine best holder count (prefer accurate API count, then on-chain estimate)
    const holderCount = accurateHolderCount > 0 
      ? accurateHolderCount 
      : onChainData?.holderCount || holders.length;

    // Run analysis with on-chain data - pass actual holder count
    const analysis = await filterEngine.analyzeToken({
      address: tokenAddress,
      metadata,
      priceData,
      holders,
      transactions,
      devHoldings,
      migrationTimestamp: event.timestamp,
      holderCount, // Pass actual holder count for accurate scam detection
    });

    // Build statistics from on-chain data
    const statistics = {
      holderCount,
      uniqueTraders: new Set(transactions.map(tx => tx.source)).size,
      top10Concentration: (onChainData?.top10Percentage || 0) / 100,
      devHoldings,
    };

    // Create token result
    const tokenResult: TokenAnalysis = {
      address: tokenAddress,
      metadata,
      priceData,
      holders,
      transactions,
      statistics,
      analysis,
      migrationTimestamp: event.timestamp,
      analyzedAt: Date.now(),
    };

    // Update stats
    if (analysis.passed) {
      stats.passed++;
    } else {
      stats.filtered++;
    }

    // Store in memory (keep last 100)
    processedTokens.unshift(tokenResult);
    if (processedTokens.length > 100) {
      processedTokens.pop();
    }

    // Callback for real-time updates
    if (onTokenAnalyzed) {
      onTokenAnalyzed(tokenResult);
    }

    console.log(
      `Token ${tokenAddress.slice(0, 8)} analyzed. Score: ${analysis.score}, Holders: ${holderCount}, MC: $${priceData.marketCap.toLocaleString()}`
    );

    return tokenResult;
  } catch (error) {
    console.error(`Error processing token ${tokenAddress}:`, error);
    return null;
  }
}

/**
 * Merges holder data from multiple sources
 */
function mergeHolderData(
  bitqueryHolders: Array<{ address: string; amount: number; percentage: number }>,
  heliusHolders: Array<{ address: string; amount: number }>
): Array<{ address: string; amount: number; percentage: number }> {
  const holderMap = new Map<string, { address: string; amount: number }>();

  // Add Bitquery holders
  bitqueryHolders.forEach((h) => {
    holderMap.set(h.address, { address: h.address, amount: h.amount });
  });

  // Merge Helius holders
  heliusHolders.forEach((h) => {
    const existing = holderMap.get(h.address);
    if (existing) {
      existing.amount = Math.max(existing.amount, h.amount);
    } else {
      holderMap.set(h.address, { address: h.address, amount: h.amount });
    }
  });

  // Convert to array and calculate percentages
  const holders = Array.from(holderMap.values());
  const totalAmount = holders.reduce((sum, h) => sum + h.amount, 0);

  return holders
    .map((h) => ({
      ...h,
      percentage: totalAmount > 0 ? (h.amount / totalAmount) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);
}

/**
 * Gets all processed tokens (optionally filtered)
 */
export function getProcessedTokens(onlyPassed: boolean = false): TokenAnalysis[] {
  if (onlyPassed) {
    return processedTokens.filter((t) => t.analysis.passed);
  }
  return processedTokens;
}

/**
 * Gets current monitoring stats
 */
export function getStats(): MonitorStats {
  return { ...stats };
}

/**
 * Resets stats (useful for testing)
 */
export function resetStats(): void {
  stats.monitored = 0;
  stats.passed = 0;
  stats.filtered = 0;
}

/**
 * Gets a specific token by address
 */
export function getTokenByAddress(address: string): TokenAnalysis | undefined {
  return processedTokens.find((t) => t.address === address);
}
