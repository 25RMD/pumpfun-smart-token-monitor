import { TokenAnalysis, MigrationEvent, MonitorStats, PriceData, TokenSecurity, LaunchAnalysis, WalletFundingAnalysis, CreatorHistory } from '@/types';
import { fetchTokenPairs, MoralisPair, fetchMoralisHolderData, fetchMoralisTradingStats } from './moralis.service';
import { fetchOnChainTokenData, getTokenCreator } from './onchain-data.service';
import { fetchTokenTransactions } from './bitquery.service';
import { ScamFilterEngine } from './scam-filter.engine';
import { performSecurityCheck, analyzeLaunch, analyzeWalletFunding, getCreatorHistory } from './security-check.service';
import { fetchTokenMetadataFromUri } from './pumpfun-api.service';

/**
 * Token Processor Service
 * Uses Moralis as the PRIMARY data source for all token data:
 * - Price, MC, metadata, pairs from /graduated endpoint
 * - Holder count, top 10%, dev holdings from /holders endpoint
 * - 24hr trading stats from /swaps endpoint
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
    // Get creator address - from event (PumpPortal) or fetch via Helius
    let creatorAddress = event.creator;
    if (!creatorAddress) {
      creatorAddress = await withTimeout(
        getTokenCreator(tokenAddress).catch(() => null),
        3000,
        null
      ) || undefined;
      if (creatorAddress) {
        console.log(`🔍 Fetched creator for ${tokenAddress.slice(0, 8)}: ${creatorAddress.slice(0, 8)}...`);
      }
    }

    // Fetch all data in parallel:
    // - Pairs data from Moralis for volume/price change
    // - Holder data from Moralis (holder count, top10%, dev%)
    // - Trading stats from Moralis for 24h transaction count
    // - On-chain data as fallback for concentration metrics
    // Market cap, price, liquidity come from event (from /graduated endpoint)
    const [pairsData, moralisHolderData, moralisTradingStats, onChainData, transactions] = await Promise.all([
      withTimeout(
        fetchTokenPairs(tokenAddress),
        TIMEOUT_MS,
        null
      ),
      // Get holder data from Moralis (primary source)
      withTimeout(
        fetchMoralisHolderData(tokenAddress, creatorAddress).catch(() => null),
        TIMEOUT_MS,
        null
      ),
      // Get trading stats from Moralis (24h txns, buys/sells)
      withTimeout(
        fetchMoralisTradingStats(tokenAddress).catch(() => null),
        TIMEOUT_MS,
        null
      ),
      // Fetch on-chain data as fallback for concentration metrics
      withTimeout(
        fetchOnChainTokenData(tokenAddress, creatorAddress).catch((err) => {
          console.warn(`On-chain fetch failed for ${tokenAddress.slice(0, 8)}: ${err.message || err}`);
          return null;
        }),
        fastMode ? 4000 : TIMEOUT_MS,
        null
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

    // Determine the image URL
    // If uri looks like an image URL (from Moralis logo), use it directly
    // If it's a metadata URI, try to fetch the image from it
    let imageUrl = '';
    const uri = event.uri || '';
    
    if (uri) {
      // Check if it's already an image URL (common image extensions or Moralis CDN)
      const isImageUrl = /\.(png|jpg|jpeg|gif|webp|svg)(\?.*)?$/i.test(uri) || 
                         uri.includes('moralis') ||
                         uri.includes('ipfs.io/ipfs') && uri.includes('image');
      
      if (isImageUrl) {
        imageUrl = uri;
      } else if (!fastMode) {
        // For live events (not fast mode), try to fetch metadata from URI
        try {
          const uriMetadata = await withTimeout(
            fetchTokenMetadataFromUri(uri),
            3000,
            null
          );
          if (uriMetadata?.image) {
            imageUrl = uriMetadata.image;
          }
        } catch {
          // Silently fail - image is not critical
        }
      }
    }

    // Build metadata from event (from /graduated endpoint)
    const metadata = {
      name: event.name || 'Unknown',
      symbol: event.symbol || 'UNKNOWN',
      description: '',
      creator: creatorAddress || event.creator || '',
      image: imageUrl,
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

    // Get trading stats from Moralis
    const trades24h = moralisTradingStats?.trades24h || 0;
    const buys24h = moralisTradingStats?.buys24h || 0;
    const sells24h = moralisTradingStats?.sells24h || 0;
    const uniqueTraders = moralisTradingStats?.uniqueTraders24h || 0;

    // Log MC
    console.log(`💰 ${tokenAddress.slice(0, 8)}: MC $${marketCap.toLocaleString()}, Liq $${liquidity.toLocaleString()}, Vol $${totalVolume24h.toLocaleString()} (${mcSource})`);

    // Build price data with trading stats from Moralis
    const priceData: PriceData = {
      price,
      volume24h: totalVolume24h > 0 ? totalVolume24h : (moralisTradingStats?.volume24h || 0),
      marketCap,
      marketCapSource: mcSource,
      marketCapConfidence: mcConfidence,
      liquidity,
      trades24h,
      priceChange24h,
      buys24h,
      sells24h,
    };

    // Extract holder metrics - prefer Moralis for holder count, on-chain for concentration
    // Moralis provides: totalHolders (accurate), top10Percent (often 0), devHoldingsPercent
    // On-chain provides: holderCount (estimate), top10Percentage (from RPC), devHoldings
    const holderCount = moralisHolderData?.totalHolders ?? onChainData?.holderCount ?? -1;
    
    // For dev holdings: use Moralis if > 0, else on-chain
    const moralisDevPct = moralisHolderData?.devHoldingsPercent || 0;
    const onChainDevPct = (onChainData?.devHoldings || 0) * 100;
    const devHoldings = (moralisDevPct > 0 ? moralisDevPct : onChainDevPct) / 100; // Normalize to decimal
    
    // For top 10: use Moralis if > 0, else on-chain (on-chain is usually more accurate for this)
    const moralisTop10 = moralisHolderData?.top10Percent || 0;
    const onChainTop10 = onChainData?.top10Percentage || 0;
    const top10Concentration = (moralisTop10 > 0 ? moralisTop10 : onChainTop10) / 100; // Convert to decimal
    
    const holderSource = moralisHolderData?.totalHolders ? 'Moralis' : (onChainData?.holderCount ? 'OnChain' : 'Unknown');

    if (holderCount <= 0) {
      console.warn(`⚠️ ${tokenAddress.slice(0, 8)}: Holder count unknown`);
    }
    
    // Log holder data
    const holderDisplay = holderCount > 0 ? holderCount.toString() : 'N/A';
    console.log(`📊 ${tokenAddress.slice(0, 8)}: Holders=${holderDisplay} (${holderSource}), Dev=${(devHoldings * 100).toFixed(1)}%, Top10=${(top10Concentration * 100).toFixed(1)}%`);

    // Fetch security info, launch analysis, and wallet funding
    // ALWAYS run security checks (even in fast mode) - essential for scam detection
    // Use shorter timeout in fast mode
    const securityTimeout = fastMode ? 4000 : TIMEOUT_MS;
    
    // Build holder list for security analysis
    const holdersForAnalysis = onChainData?.holders?.map(h => ({
      address: h.address,
      percentage: h.percentage
    })) || [];

    const [securityCheck, launchAnalysis, walletFunding, creatorHistory] = await Promise.all([
      // Security check - ALWAYS run
      withTimeout(
        performSecurityCheck(tokenAddress, holdersForAnalysis).catch((err) => {
          console.warn(`Security check failed for ${tokenAddress.slice(0, 8)}:`, err.message);
          return null;
        }),
        securityTimeout,
        null
      ),
      // Launch analysis - skip in fast mode (expensive)
      fastMode ? Promise.resolve(null) : withTimeout(
        analyzeLaunch(tokenAddress, event.timestamp).catch((err) => {
          console.warn(`Launch analysis failed for ${tokenAddress.slice(0, 8)}:`, err.message);
          return null;
        }),
        TIMEOUT_MS,
        null
      ),
      // Wallet funding analysis - ALWAYS run (shorter timeout in fast mode)
      withTimeout(
        analyzeWalletFunding(tokenAddress, holdersForAnalysis).catch((err) => {
          console.warn(`Wallet funding analysis failed for ${tokenAddress.slice(0, 8)}:`, err.message);
          return null;
        }),
        fastMode ? 3000 : TIMEOUT_MS,
        null
      ),
      // Creator history - ALWAYS run for serial scammer detection (shorter timeout in fast mode)
      creatorAddress ? withTimeout(
        getCreatorHistory(creatorAddress).catch((err) => {
          console.warn(`Creator history failed for ${tokenAddress.slice(0, 8)}:`, err.message);
          return null;
        }),
        fastMode ? 3000 : TIMEOUT_MS,
        null
      ) : Promise.resolve(null),
    ]);

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
      holders: onChainData?.holders || [],
      transactions,
      devHoldings: devHoldings,
      migrationTimestamp: event.timestamp,
      holderCount,
      security,
      launchAnalysis: launch,
      walletFunding: walletFunding || undefined,
      creatorHistory: creatorHistory || undefined,
    });

    // Log analysis with danger score
    console.log(`📊 Analysis for ${tokenAddress.slice(0, 8)}:`);
    console.log(`   Score: ${analysis.score}, Passed: ${analysis.passed}`);
    if (analysis.dangerScore) {
      console.log(`   🎯 Danger: ${analysis.dangerScore.overall}/100 (${analysis.dangerScore.category})`);
    }
    console.log(`   Holders: ${holderCount} (${holderSource}), MC: $${priceData.marketCap.toLocaleString()}`);
    console.log(`   🔒 Security: Mint=${security.mintAuthorityRevoked ? '✅' : '⚠️'}, Freeze=${security.freezeAuthorityRevoked ? '✅' : '⚠️'}, LP=${security.lpLocked ? '✅' : '⚠️'}`);
    if (analysis.compositeRisks && Object.values(analysis.compositeRisks).some(v => v)) {
      const activeRisks = Object.entries(analysis.compositeRisks)
        .filter(([, v]) => v)
        .map(([k]) => k);
      console.log(`   ⚠️ Composite Risks: ${activeRisks.join(', ')}`);
    }
    if (analysis.positiveSignals && analysis.positiveSignals.length > 0) {
      console.log(`   ✅ Positive: ${analysis.positiveSignals.join(', ')}`);
    }
    if (creatorHistory?.isSerialCreator) {
      console.log(`   🚨 Serial Creator: ${creatorHistory.recentTokens.length} tokens in 30 days, ${creatorHistory.tokenCount} total`);
    }
    if (analysis.flags.length > 0) {
      console.log(`   Flags: ${analysis.flags.join(', ')}`);
    }

    // Build statistics from on-chain data and trading stats
    const statistics = {
      holderCount,
      uniqueTraders: uniqueTraders > 0 ? uniqueTraders : transactions.length,
      top10Concentration: top10Concentration,
      devHoldings: devHoldings,
      buySellRatio: 1,
      liquidityToMcapRatio: priceData.marketCap > 0 ? priceData.liquidity / priceData.marketCap : 0,
      volumeToMcapRatio: priceData.marketCap > 0 ? priceData.volume24h / priceData.marketCap : 0,
      avgTradeSize: 0,
      tokenAge: 0,
      buyPressure: 0.5,
      liquidityRatio: priceData.marketCap > 0 ? priceData.liquidity / priceData.marketCap : 0,
      volumeToLiquidityRatio: priceData.liquidity > 0 ? priceData.volume24h / priceData.liquidity : 0,
      onChainDataLoaded: !!(moralisHolderData || onChainData), // Track if holder data was successfully fetched
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
      walletFunding: walletFunding || undefined,
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
