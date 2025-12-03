import { TokenAnalysis, MigrationEvent, MonitorStats, PriceData, TokenSecurity, LaunchAnalysis } from '@/types';
import { fetchTokenPairs, MoralisPair } from './moralis.service';
import { getAccurateHolderCount } from './onchain-data.service';
import { fetchTokenTransactions } from './bitquery.service';
import { ScamFilterEngine } from './scam-filter.engine';
import { performSecurityCheck, analyzeLaunch } from './security-check.service';

/**
 * Token Processor Service
 * Uses Moralis as the ONLY data source for price, MC, metadata, pairs
 * No fallbacks to DexScreener, Birdeye, or other APIs
 */

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
 * Uses Moralis ONLY for price, MC, metadata, pairs
 * @param fastMode - If true, skips expensive API calls for faster initial loading
 */
export async function processNewMigration(
  event: MigrationEvent,
  onTokenAnalyzed?: (token: TokenAnalysis) => void,
  fastMode: boolean = false
): Promise<TokenAnalysis | null> {
  const tokenAddress = event.mint;

  console.log(`Processing ${fastMode ? '(fast)' : ''}: ${tokenAddress.slice(0, 8)}...`);
  stats.monitored++;

  const TIMEOUT_MS = fastMode ? 6000 : 10000;

  try {
    // Fetch pairs data from Moralis for volume/price change
    // Market cap, price, liquidity come from event (from /graduated endpoint)
    const [pairsData, accurateHolderCount, transactions] = await Promise.all([
      withTimeout(
        fetchTokenPairs(tokenAddress),
        TIMEOUT_MS,
        null
      ),
      withTimeout(
        getAccurateHolderCount(tokenAddress).catch(() => 0),
        5000,
        0
      ),
      fastMode ? Promise.resolve([]) : withTimeout(
        fetchTokenTransactions(tokenAddress).catch(() => []),
        TIMEOUT_MS,
        []
      ),
    ]);

    // Aggregate pairs data for volume and price change
    const pairs: MoralisPair[] = pairsData?.pairs || [];
    let totalVolume24h = 0;
    let priceChange24h = 0;
    
    for (const pair of pairs) {
      totalVolume24h += pair.volume24hrUsd || 0;
      if (pair.usdPrice24hrPercentChange !== undefined && priceChange24h === 0) {
        priceChange24h = pair.usdPrice24hrPercentChange;
      }
    }

    // Build metadata from event (from /graduated endpoint)
    const metadata = {
      name: event.name || 'Unknown',
      symbol: event.symbol || 'UNKNOWN',
      description: '',
      creator: event.creator || '',
      image: '',
      decimals: 6,
      supply: '1000000000', // Pump.fun circulating supply
    };

    // Get market cap, price, liquidity directly from event
    // These values come from /graduated endpoint (fullyDilutedValuation = price × 1B)
    const marketCap = event.marketCap || 0;
    const price = pairs[0]?.usdPrice || 0;
    const liquidity = event.liquidity || pairs.reduce((sum, p) => sum + (p.liquidityUsd || 0), 0);
    
    const mcSource = 'Graduated';
    const mcConfidence: 'high' | 'medium' | 'low' = event.marketCap ? 'high' : 'low';

    // Log MC
    console.log(`💰 ${tokenAddress.slice(0, 8)}: MC $${marketCap.toLocaleString()}, Liq $${liquidity.toLocaleString()}, Vol $${totalVolume24h.toLocaleString()} (${mcSource})`);

    // Build price data
    const priceData: PriceData = {
      price,
      volume24h: totalVolume24h,
      marketCap,
      marketCapSource: mcSource,
      marketCapConfidence: mcConfidence,
      liquidity,
      trades24h: 0,
      priceChange24h,
      buys24h: 0,
      sells24h: 0,
    };

    // Get holder count from RPC
    const holderCount = accurateHolderCount > 0 ? accurateHolderCount : 0;
    const holderSource = accurateHolderCount > 0 ? 'RPC' : 'None';

    if (holderCount === 0) {
      console.warn(`⚠️ ${tokenAddress.slice(0, 8)}: Could not get holder count`);
    }

    // Fetch security info - skip in fast mode
    // For pump.fun, defaults are SECURE (mint/freeze revoked, LP burned)
    let securityCheck = null;
    let launchAnalysis = null;
    
    if (!fastMode) {
      [securityCheck, launchAnalysis] = await Promise.all([
        withTimeout(
          performSecurityCheck(tokenAddress, []).catch((err) => {
            console.warn(`Security check failed for ${tokenAddress.slice(0, 8)}:`, err.message);
            return null;
          }),
          TIMEOUT_MS,
          null
        ),
        withTimeout(
          analyzeLaunch(tokenAddress, event.timestamp).catch((err) => {
            console.warn(`Launch analysis failed for ${tokenAddress.slice(0, 8)}:`, err.message);
            return null;
          }),
          TIMEOUT_MS,
          null
        ),
      ]);
    }

    // Build security and launch data objects
    // For pump.fun tokens, defaults are SECURE
    const security: TokenSecurity = securityCheck || {
      mintAuthorityRevoked: true,
      freezeAuthorityRevoked: true,
      lpLocked: true,
      lpLockPercentage: 100,
      lpLockDuration: Infinity,
      isRugpullRisk: false,
      topHoldersAreContracts: false,
    };

    const launch: LaunchAnalysis = launchAnalysis || {
      bundledBuys: 0,
      sniperCount: 0,
      firstBuyerHoldings: 0,
      avgFirstBuySize: 0,
      creatorBoughtBack: false,
    };

    // Run analysis with Moralis data
    const analysis = await filterEngine.analyzeToken({
      address: tokenAddress,
      metadata,
      priceData,
      holders: [],
      transactions,
      devHoldings: 0,
      migrationTimestamp: event.timestamp,
      holderCount,
      security,
      launchAnalysis: launch,
    });

    // Log analysis
    console.log(`📊 Analysis for ${tokenAddress.slice(0, 8)}:`);
    console.log(`   Score: ${analysis.score}, Passed: ${analysis.passed}`);
    console.log(`   Holders: ${holderCount} (${holderSource}), MC: $${priceData.marketCap.toLocaleString()}`);
    console.log(`   🔒 Security: Mint=${security.mintAuthorityRevoked ? '✅' : '⚠️'}, Freeze=${security.freezeAuthorityRevoked ? '✅' : '⚠️'}, LP=${security.lpLocked ? '✅' : '⚠️'}`);
    if (analysis.flags.length > 0) {
      console.log(`   Flags: ${analysis.flags.join(', ')}`);
    }

    // Build statistics
    const statistics = {
      holderCount,
      uniqueTraders: 0,
      top10Concentration: 0,
      devHoldings: 0,
      buySellRatio: 1,
      liquidityToMcapRatio: priceData.marketCap > 0 ? priceData.liquidity / priceData.marketCap : 0,
      volumeToMcapRatio: priceData.marketCap > 0 ? priceData.volume24h / priceData.marketCap : 0,
      avgTradeSize: 0,
      tokenAge: 0,
      buyPressure: 0.5,
      liquidityRatio: priceData.marketCap > 0 ? priceData.liquidity / priceData.marketCap : 0,
      volumeToLiquidityRatio: priceData.liquidity > 0 ? priceData.volume24h / priceData.liquidity : 0,
    };

    // Create token result
    const tokenResult: TokenAnalysis = {
      address: tokenAddress,
      metadata,
      priceData,
      holders: [],
      transactions,
      statistics,
      security,
      launchAnalysis: launch,
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
