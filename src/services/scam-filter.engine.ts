import {
  TokenMetadata,
  PriceData,
  Holder,
  Transaction,
  TokenSecurity,
  LaunchAnalysis,
  AnalysisResult,
  FilterCheckResult,
  WalletFundingAnalysis,
  CompositeRiskIndicators,
  DangerScore,
  CreatorHistory,
} from '@/types';

export interface FilterThresholds {
  minScore: number;
  maxDevHoldings: number;
  minHolders: number;
  maxTopHolderConcentration: number;
  minUniqueTradersRatio: number;
  minTokenAgeHours: number;
  minLiquidityRatio: number;
  maxPriceVolatility: number;
}

export class ScamFilterEngine {
  private baseScore: number = 100;
  private thresholds: FilterThresholds;

  constructor(thresholds?: Partial<FilterThresholds>) {
    this.thresholds = {
      minScore: thresholds?.minScore || 60,
      maxDevHoldings: thresholds?.maxDevHoldings || 0.15,
      minHolders: thresholds?.minHolders || 50,
      maxTopHolderConcentration: thresholds?.maxTopHolderConcentration || 0.30,
      minUniqueTradersRatio: thresholds?.minUniqueTradersRatio || 0.60,
      minTokenAgeHours: thresholds?.minTokenAgeHours || 1,
      minLiquidityRatio: thresholds?.minLiquidityRatio || 0.05,
      maxPriceVolatility: thresholds?.maxPriceVolatility || 50,
    };
  }

  /**
   * Analyzes a token and returns a comprehensive risk assessment
   */
  async analyzeToken(tokenData: {
    address: string;
    metadata: TokenMetadata;
    priceData: PriceData;
    holders: Holder[];
    transactions: Transaction[];
    devHoldings: number;
    migrationTimestamp: number;
    holderCount?: number;
    security?: TokenSecurity;
    launchAnalysis?: LaunchAnalysis;
    walletFunding?: WalletFundingAnalysis;
    creatorHistory?: CreatorHistory;
  }): Promise<AnalysisResult> {
    let score = this.baseScore;
    let flags: string[] = [];
    const positiveSignals: string[] = [];

    // ========== EXISTING CHECKS ==========
    
    const washTradingResult = this.checkWashTrading(tokenData.transactions);
    score -= washTradingResult.penalty;
    flags = flags.concat(washTradingResult.flags);

    const holderResult = this.checkHolderDistribution(tokenData.holders, tokenData.holderCount);
    score -= holderResult.penalty;
    flags = flags.concat(holderResult.flags);

    const devResult = this.checkDeveloperHoldings(
      tokenData.holders,
      tokenData.metadata.creator,
      tokenData.devHoldings
    );
    score -= devResult.penalty;
    flags = flags.concat(devResult.flags);

    const volumeResult = this.checkVolumeManipulation(tokenData.transactions);
    score -= volumeResult.penalty;
    flags = flags.concat(volumeResult.flags);

    const airdropResult = this.checkAirdropScheme(tokenData.transactions);
    score -= airdropResult.penalty;
    flags = flags.concat(airdropResult.flags);

    const socialResult = this.checkSocialSignals(tokenData.metadata);
    score -= socialResult.penalty;
    flags = flags.concat(socialResult.flags);

    // ========== NEW CHECKS ==========
    
    // Token Age Analysis
    const tokenAgeResult = this.checkTokenAge(tokenData.priceData, tokenData.migrationTimestamp);
    score -= tokenAgeResult.penalty;
    flags = flags.concat(tokenAgeResult.flags);

    // Buy/Sell Pressure Analysis (enhanced with dump detection)
    const buyPressureResult = this.checkBuyPressure(tokenData.priceData);
    score -= buyPressureResult.penalty;
    flags = flags.concat(buyPressureResult.flags);

    // Liquidity Health Analysis
    const liquidityResult = this.checkLiquidityHealth(tokenData.priceData);
    score -= liquidityResult.penalty;
    flags = flags.concat(liquidityResult.flags);

    // Security Check (Mint/Freeze Authority, LP Lock)
    const securityResult = this.checkSecurity(tokenData.security);
    score -= securityResult.penalty;
    flags = flags.concat(securityResult.flags);

    // Sniper/Bundle Detection
    const sniperResult = this.checkSnipers(tokenData.launchAnalysis);
    score -= sniperResult.penalty;
    flags = flags.concat(sniperResult.flags);

    // Wallet Funding Analysis (NEW)
    const walletFundingResult = this.checkWalletFunding(tokenData.walletFunding);
    score -= walletFundingResult.penalty;
    flags = flags.concat(walletFundingResult.flags);

    // Trade Velocity Analysis (NEW) - trades per holder ratio
    const tradeVelocityResult = this.checkTradeVelocity(tokenData.priceData, tokenData.holderCount);
    score -= tradeVelocityResult.penalty;
    flags = flags.concat(tradeVelocityResult.flags);

    // Creator History Check (NEW) - serial scammer detection
    const creatorHistoryResult = this.checkCreatorHistory(tokenData.creatorHistory);
    score -= creatorHistoryResult.penalty;
    flags = flags.concat(creatorHistoryResult.flags);

    // ========== POSITIVE SCORING (BONUSES) ==========
    const bonusResult = this.calculatePositiveSignals(tokenData);
    score += bonusResult.bonus;
    positiveSignals.push(...bonusResult.signals);

    // ========== COMPOSITE RISK DETECTION ==========
    const compositeRisks = this.detectCompositeRisks(tokenData, {
      holderResult,
      buyPressureResult,
      tokenAgeResult,
      tradeVelocityResult,
      walletFundingResult,
      sniperResult,
    });

    // Add composite risk flags
    if (compositeRisks.rugInProgress) {
      flags.push('🚨 RUG IN PROGRESS: High concentration + active dumping');
      score -= 20; // Extra penalty
    }
    if (compositeRisks.pumpSetup) {
      flags.push('⚠️ PUMP SETUP: Artificial buy pressure detected');
      score -= 10;
    }
    if (compositeRisks.washTrading) {
      flags.push('🤖 WASH TRADING: Bot activity pattern detected');
      score -= 10;
    }
    if (compositeRisks.coordinatedDump) {
      flags.push('📉 COORDINATED DUMP: Multiple large sells detected');
      score -= 15;
    }
    if (compositeRisks.insiderAccumulation) {
      flags.push('🕵️ INSIDER ACTIVITY: Coordinated accumulation detected');
      score -= 15;
    }

    // ========== DANGER SCORE CALCULATION ==========
    const dangerScore = this.calculateDangerScore(score, flags, compositeRisks, tokenData);

    // Clamp final score
    const finalScore = Math.max(0, Math.min(100, score));

    return {
      passed: finalScore >= this.thresholds.minScore,
      score: finalScore,
      flags,
      breakdown: {
        washTrading: { ...washTradingResult, maxScore: 20 },
        holders: { ...holderResult, maxScore: 25 },
        developer: { ...devResult, maxScore: 15 },
        volume: { ...volumeResult, maxScore: 20 },
        airdrops: { ...airdropResult, maxScore: 15 },
        social: { ...socialResult, maxScore: 10 },
        tokenAge: { ...tokenAgeResult, maxScore: 15 },
        buyPressure: { ...buyPressureResult, maxScore: 15 },
        liquidity: { ...liquidityResult, maxScore: 20 },
        security: { ...securityResult, maxScore: 25 },
        snipers: { ...sniperResult, maxScore: 20 },
      },
      dangerScore,
      compositeRisks,
      positiveSignals,
    };
  }

  // ========== NEW: DANGER SCORE CALCULATION ==========

  /**
   * Calculate a danger score (0-100) - higher = more dangerous
   * This is the INVERSE of the safety score
   */
  calculateDangerScore(
    safetyScore: number,
    flags: string[],
    compositeRisks: CompositeRiskIndicators,
    tokenData: {
      priceData: PriceData;
      holderCount?: number;
      security?: TokenSecurity;
    }
  ): DangerScore {
    // Base danger = inverse of safety
    let danger = 100 - Math.max(0, Math.min(100, safetyScore));

    // Boost danger for composite risks
    if (compositeRisks.rugInProgress) danger = Math.min(100, danger + 20);
    if (compositeRisks.coordinatedDump) danger = Math.min(100, danger + 15);
    if (compositeRisks.insiderAccumulation) danger = Math.min(100, danger + 10);
    if (compositeRisks.pumpSetup) danger = Math.min(100, danger + 10);
    if (compositeRisks.washTrading) danger = Math.min(100, danger + 5);

    // Determine confidence based on data availability
    let confidence: 'high' | 'medium' | 'low' = 'high';
    if (!tokenData.holderCount || tokenData.holderCount < 0) confidence = 'medium';
    if (!tokenData.security) confidence = 'low';
    if (tokenData.priceData.trades24h === 0) confidence = 'low';

    // Categorize risk level
    let category: 'SAFE' | 'LOW_RISK' | 'MODERATE' | 'HIGH_RISK' | 'EXTREME';
    if (danger >= 80) category = 'EXTREME';
    else if (danger >= 60) category = 'HIGH_RISK';
    else if (danger >= 40) category = 'MODERATE';
    else if (danger >= 20) category = 'LOW_RISK';
    else category = 'SAFE';

    // Extract primary risks (top 3 most concerning flags)
    const riskPriority = [
      '🚨 RUG IN PROGRESS',
      '📉 COORDINATED DUMP',
      '🕵️ INSIDER ACTIVITY',
      '⚠️ PUMP SETUP',
      'Dump in progress',
      'Mega whale',
      'Mint authority NOT revoked',
      'LP not locked',
      '🤖 Bundled launch',
      'Very high concentration',
      'Dangerously low liquidity',
      'Heavy sniper activity',
      'Low holders',
      'No social links',
    ];

    const primaryRisks: string[] = [];
    for (const priority of riskPriority) {
      const matchingFlag = flags.find(f => f.includes(priority));
      if (matchingFlag && primaryRisks.length < 3) {
        primaryRisks.push(matchingFlag);
      }
    }

    // Extract positive signals
    const positiveSignals: string[] = [];
    if (tokenData.security?.mintAuthorityRevoked) positiveSignals.push('Mint revoked');
    if (tokenData.security?.freezeAuthorityRevoked) positiveSignals.push('Freeze revoked');
    if (tokenData.security?.lpLocked) positiveSignals.push('LP locked');
    if (tokenData.holderCount && tokenData.holderCount > 200) positiveSignals.push('Good holder count');
    if (tokenData.priceData.liquidity > 20000) positiveSignals.push('Good liquidity');

    return {
      overall: Math.round(danger),
      confidence,
      category,
      primaryRisks,
      positiveSignals,
    };
  }

  // ========== NEW: COMPOSITE RISK DETECTION ==========

  /**
   * Detect composite risk patterns by combining multiple indicators
   */
  detectCompositeRisks(
    tokenData: {
      priceData: PriceData;
      holderCount?: number;
      launchAnalysis?: LaunchAnalysis;
      walletFunding?: WalletFundingAnalysis;
    },
    checkResults: {
      holderResult: FilterCheckResult;
      buyPressureResult: FilterCheckResult;
      tokenAgeResult: FilterCheckResult;
      tradeVelocityResult: FilterCheckResult;
      walletFundingResult: FilterCheckResult;
      sniperResult: FilterCheckResult;
    }
  ): CompositeRiskIndicators {
    const { priceData, holderCount, launchAnalysis, walletFunding } = tokenData;
    
    // Calculate key metrics
    const buys = priceData.buys24h || 0;
    const sells = priceData.sells24h || 0;
    const totalTrades = buys + sells;
    const sellRatio = totalTrades > 0 ? sells / totalTrades : 0;
    const buyRatio = totalTrades > 0 ? buys / totalTrades : 0;
    const ageHours = this.getTokenAgeHours(priceData);
    const tradesPerHolder = (holderCount && holderCount > 0) 
      ? priceData.trades24h / holderCount 
      : 0;

    // RUG IN PROGRESS: High concentration + high sells + new token
    const rugInProgress = 
      checkResults.holderResult.flags.some(f => f.includes('Very high concentration') || f.includes('Mega whale')) &&
      sellRatio > 0.70 &&
      ageHours < 12;

    // PUMP SETUP: High buy pressure + low holders + new token
    const pumpSetup =
      buyRatio > 0.85 &&
      (holderCount === undefined || holderCount < 100) &&
      ageHours < 6 &&
      priceData.trades24h > 100;

    // WASH TRADING: High trades/holder + suspicious patterns
    const washTrading =
      tradesPerHolder > 10 &&
      checkResults.tradeVelocityResult.penalty > 5;

    // COORDINATED DUMP: Multiple large sells detected
    const coordinatedDump =
      sellRatio > 0.80 &&
      priceData.trades24h > 50 &&
      ageHours < 24;

    // INSIDER ACCUMULATION: Bundled buys + wallet clustering + whale
    const insiderAccumulation =
      (launchAnalysis?.bundledBuys || 0) > 2 &&
      (walletFunding?.clusteredWallets || 0) >= 2 &&
      checkResults.holderResult.flags.some(f => f.includes('whale'));

    return {
      rugInProgress,
      pumpSetup,
      washTrading,
      coordinatedDump,
      insiderAccumulation,
    };
  }

  // ========== NEW: POSITIVE SIGNAL DETECTION ==========

  /**
   * Calculate bonuses for positive signals
   */
  calculatePositiveSignals(tokenData: {
    priceData: PriceData;
    holderCount?: number;
    security?: TokenSecurity;
    migrationTimestamp: number;
    metadata: TokenMetadata;
  }): { bonus: number; signals: string[] } {
    let bonus = 0;
    const signals: string[] = [];

    const ageHours = this.getTokenAgeHours(tokenData.priceData, tokenData.migrationTimestamp);
    const buys = tokenData.priceData.buys24h || 0;
    const sells = tokenData.priceData.sells24h || 0;
    const totalTrades = buys + sells;
    const buyRatio = totalTrades > 10 ? buys / totalTrades : 0.5;

    // Age bonus: survived > 24 hours
    if (ageHours >= 24) {
      bonus += 5;
      signals.push('✅ Token age > 24 hours');
    }
    if (ageHours >= 72) {
      bonus += 5;
      signals.push('✅ Token age > 3 days');
    }

    // Holder count bonus
    if (tokenData.holderCount && tokenData.holderCount >= 500) {
      bonus += 5;
      signals.push('✅ Strong holder base (500+)');
    } else if (tokenData.holderCount && tokenData.holderCount >= 200) {
      bonus += 3;
      signals.push('✅ Good holder count (200+)');
    }

    // Balanced buy/sell ratio
    if (buyRatio >= 0.40 && buyRatio <= 0.60) {
      bonus += 5;
      signals.push('✅ Balanced trading activity');
    }

    // Good liquidity
    if (tokenData.priceData.marketCap > 0) {
      const liqRatio = tokenData.priceData.liquidity / tokenData.priceData.marketCap;
      if (liqRatio >= 0.10) {
        bonus += 5;
        signals.push('✅ Healthy liquidity ratio');
      }
    }

    // Has socials
    if (tokenData.metadata.twitter && tokenData.metadata.website) {
      bonus += 3;
      signals.push('✅ Has Twitter and website');
    }

    // Security fully verified
    if (tokenData.security?.mintAuthorityRevoked && 
        tokenData.security?.freezeAuthorityRevoked &&
        tokenData.security?.lpLocked) {
      bonus += 5;
      signals.push('✅ Security fully verified');
    }

    return { bonus: Math.min(bonus, 25), signals }; // Cap bonus at 25
  }

  // ========== NEW: WALLET FUNDING CHECK ==========

  /**
   * Check for suspicious wallet funding patterns
   */
  checkWalletFunding(walletFunding?: WalletFundingAnalysis): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    if (!walletFunding) {
      return { penalty: 0, flags: [] };
    }

    // Clustered wallets (same funding source)
    if (walletFunding.clusteredWallets >= 5) {
      penalty += 20;
      flags.push(`🕵️ Coordinated buying: ${walletFunding.clusteredWallets} wallets from same source`);
    } else if (walletFunding.clusteredWallets >= 3) {
      penalty += 12;
      flags.push(`Wallet clustering: ${walletFunding.clusteredWallets} wallets from same source`);
    } else if (walletFunding.clusteredWallets >= 2) {
      penalty += 5;
      flags.push(`Minor wallet clustering detected`);
    }

    // Fresh wallet buyers
    if (walletFunding.freshWalletBuyers >= 5) {
      penalty += 15;
      flags.push(`🆕 Many fresh wallets: ${walletFunding.freshWalletBuyers} created recently`);
    } else if (walletFunding.freshWalletBuyers >= 3) {
      penalty += 8;
      flags.push(`Fresh wallet activity: ${walletFunding.freshWalletBuyers} new wallets`);
    }

    // Overall suspicious pattern
    if (walletFunding.suspiciousFundingPattern) {
      penalty += 5;
      flags.push('Suspicious funding pattern detected');
    }

    return { penalty: Math.min(penalty, 25), flags };
  }

  // ========== NEW: TRADE VELOCITY CHECK ==========

  /**
   * Check trade velocity (trades per holder ratio)
   * High ratio with few holders suggests bot activity
   */
  checkTradeVelocity(priceData: PriceData, holderCount?: number): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    if (!holderCount || holderCount <= 0 || priceData.trades24h <= 0) {
      return { penalty: 0, flags: [] };
    }

    const tradesPerHolder = priceData.trades24h / holderCount;

    // Very high ratio = suspicious
    if (tradesPerHolder > 20) {
      penalty += 15;
      flags.push(`Extreme trade velocity: ${tradesPerHolder.toFixed(1)} trades/holder`);
    } else if (tradesPerHolder > 10) {
      penalty += 10;
      flags.push(`High trade velocity: ${tradesPerHolder.toFixed(1)} trades/holder`);
    } else if (tradesPerHolder > 5) {
      penalty += 5;
      flags.push(`Elevated trade velocity: ${tradesPerHolder.toFixed(1)} trades/holder`);
    }

    return { penalty: Math.min(penalty, 15), flags };
  }

  // ========== NEW: CREATOR HISTORY CHECK ==========

  /**
   * Check creator history for serial scammer patterns
   * Heavily penalize creators who launch many tokens quickly
   */
  checkCreatorHistory(creatorHistory?: CreatorHistory): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    if (!creatorHistory) {
      return { penalty: 0, flags: [] };
    }

    // Serial creator detection (3+ tokens in 30 days)
    if (creatorHistory.isSerialCreator) {
      const recentCount = creatorHistory.recentTokens.length;
      
      if (recentCount >= 10) {
        penalty += 30;
        flags.push(`🚨 SERIAL SCAMMER: Creator launched ${recentCount} tokens in 30 days`);
      } else if (recentCount >= 5) {
        penalty += 20;
        flags.push(`⚠️ High-volume creator: ${recentCount} tokens in 30 days`);
      } else if (recentCount >= 3) {
        penalty += 12;
        flags.push(`Serial creator: ${recentCount} tokens in 30 days`);
      }
    }

    // Total token count (all time)
    if (creatorHistory.tokenCount >= 20) {
      penalty += 15;
      flags.push(`Prolific creator: ${creatorHistory.tokenCount} total tokens`);
    } else if (creatorHistory.tokenCount >= 10) {
      penalty += 8;
      flags.push(`Multiple tokens: ${creatorHistory.tokenCount} total`);
    } else if (creatorHistory.tokenCount >= 5) {
      penalty += 4;
      flags.push(`${creatorHistory.tokenCount} previous tokens`);
    }

    // Rugged tokens penalty
    if (creatorHistory.ruggedTokens >= 3) {
      penalty += 15;
      flags.push(`History of failed tokens: ${creatorHistory.ruggedTokens} suspected rugs`);
    }

    return { penalty: Math.min(penalty, 35), flags }; // Cap at 35 - this is a major red flag
  }

  // Helper to calculate token age in hours
  private getTokenAgeHours(priceData: PriceData, migrationTimestamp?: number): number {
    const createdAt = priceData.pairCreatedAt || migrationTimestamp || Date.now();
    return (Date.now() - createdAt) / (1000 * 60 * 60);
  }

  // ========== NEW CHECK METHODS ==========

  /**
   * Check token age - newer tokens are riskier
   */
  checkTokenAge(priceData: PriceData, migrationTimestamp: number): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    // Use pairCreatedAt from DexScreener or migration timestamp
    const createdAt = priceData.pairCreatedAt || migrationTimestamp;
    const ageHours = (Date.now() - createdAt) / (1000 * 60 * 60);

    if (ageHours < 0.5) { // Less than 30 minutes
      penalty += 15;
      flags.push(`Very new token: ${Math.round(ageHours * 60)}m old`);
    } else if (ageHours < 1) { // Less than 1 hour
      penalty += 10;
      flags.push(`New token: ${Math.round(ageHours * 60)}m old`);
    } else if (ageHours < 6) { // Less than 6 hours
      penalty += 5;
      flags.push(`Recently launched: ${ageHours.toFixed(1)}h old`);
    } else if (ageHours >= 24) { // Bonus for surviving 24h
      // No penalty, good sign
    }

    return { penalty: Math.min(penalty, 15), flags };
  }

  /**
   * Check buy/sell pressure for pump patterns
   */
  checkBuyPressure(priceData: PriceData): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    // Calculate buy ratios - handle both naming conventions
    const buys24h = priceData.buys24h || 0;
    const sells24h = priceData.sells24h || 0;
    const buys1h = priceData.buys1h || priceData.buysH1 || 0;
    const sells1h = priceData.sells1h || priceData.sellsH1 || 0;
    const buys5m = priceData.buys5m || 0;
    const sells5m = priceData.sells5m || 0;
    const priceChange5m = priceData.priceChange5m || 0;
    const priceChange1h = priceData.priceChange1h || priceData.priceChangeH1 || 0;
    
    const total24h = buys24h + sells24h;
    const total1h = buys1h + sells1h;
    const total5m = buys5m + sells5m;

    // 24h buy pressure
    if (total24h > 10) {
      const buyRatio24h = buys24h / total24h;
      
      if (buyRatio24h > 0.90) {
        penalty += 10;
        flags.push(`Extreme buy pressure: ${(buyRatio24h * 100).toFixed(0)}% buys`);
      } else if (buyRatio24h > 0.80) {
        penalty += 5;
        flags.push(`High buy pressure: ${(buyRatio24h * 100).toFixed(0)}% buys`);
      } else if (buyRatio24h < 0.20) {
        penalty += 15;
        flags.push(`Dump in progress: ${((1 - buyRatio24h) * 100).toFixed(0)}% sells`);
      }
    }

    // 5m spike detection - sudden activity
    if (total5m > 20 && total1h > 0) {
      const fiveMinRatio = total5m / (total1h / 12); // Compare to avg 5m in last hour
      if (fiveMinRatio > 5) {
        penalty += 8;
        flags.push(`Volume spike: ${fiveMinRatio.toFixed(1)}x normal activity`);
      }
    }

    // Price volatility
    if (Math.abs(priceChange5m) > 30) {
      penalty += 10;
      flags.push(`Extreme 5m volatility: ${priceChange5m > 0 ? '+' : ''}${priceChange5m.toFixed(0)}%`);
    } else if (Math.abs(priceChange1h) > 50) {
      penalty += 8;
      flags.push(`High 1h volatility: ${priceChange1h > 0 ? '+' : ''}${priceChange1h.toFixed(0)}%`);
    }

    return { penalty: Math.min(penalty, 15), flags };
  }

  /**
   * Check liquidity health
   */
  checkLiquidityHealth(priceData: PriceData): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    // Liquidity to Market Cap ratio
    if (priceData.marketCap > 0) {
      const liquidityRatio = priceData.liquidity / priceData.marketCap;

      if (liquidityRatio < 0.02) { // Less than 2%
        penalty += 20;
        flags.push(`Dangerously low liquidity: ${(liquidityRatio * 100).toFixed(2)}% of MC`);
      } else if (liquidityRatio < 0.05) { // Less than 5%
        penalty += 12;
        flags.push(`Low liquidity: ${(liquidityRatio * 100).toFixed(1)}% of MC`);
      } else if (liquidityRatio < 0.10) { // Less than 10%
        penalty += 5;
        flags.push(`Moderate liquidity: ${(liquidityRatio * 100).toFixed(1)}% of MC`);
      }
    }

    // Volume to Liquidity ratio (too high = easy to manipulate)
    if (priceData.liquidity > 0) {
      const volumeToLiq = priceData.volume24h / priceData.liquidity;
      
      if (volumeToLiq > 20) { // Volume is 20x liquidity
        penalty += 10;
        flags.push(`Suspicious volume/liquidity: ${volumeToLiq.toFixed(1)}x ratio`);
      } else if (volumeToLiq > 10) {
        penalty += 5;
        flags.push(`High volume/liquidity: ${volumeToLiq.toFixed(1)}x ratio`);
      }
    }

    // Absolute liquidity check
    if (priceData.liquidity < 5000) {
      penalty += 10;
      flags.push(`Very low liquidity: $${priceData.liquidity.toLocaleString()}`);
    } else if (priceData.liquidity < 10000) {
      penalty += 5;
      flags.push(`Low liquidity: $${priceData.liquidity.toLocaleString()}`);
    }

    return { penalty: Math.min(penalty, 20), flags };
  }

  /**
   * Check security aspects (mint authority, freeze, LP lock)
   */
  checkSecurity(security?: TokenSecurity): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    if (!security) {
      // If we couldn't get security data, add small penalty
      penalty += 5;
      flags.push('Security data unavailable');
      return { penalty, flags };
    }

    // Mint authority not revoked - can create infinite tokens
    if (!security.mintAuthorityRevoked) {
      penalty += 15;
      flags.push('⚠️ Mint authority NOT revoked (can mint more tokens)');
    }

    // Freeze authority exists - can freeze your tokens
    if (!security.freezeAuthorityRevoked) {
      penalty += 10;
      flags.push('⚠️ Freeze authority exists (can freeze transfers)');
    }

    // LP not locked - can rug pull
    if (!security.lpLocked && security.lpLockPercentage < 80) {
      penalty += 15;
      flags.push(`⚠️ LP not locked (${security.lpLockPercentage.toFixed(0)}% locked)`);
    } else if (security.lpLockPercentage < 50) {
      penalty += 8;
      flags.push(`Low LP lock: ${security.lpLockPercentage.toFixed(0)}%`);
    }

    // Top holders are contracts (potential honeypot)
    if (security.topHoldersAreContracts) {
      penalty += 10;
      flags.push('Top holders are contracts (honeypot risk)');
    }

    // Overall rugpull risk
    if (security.isRugpullRisk) {
      penalty += 5;
      flags.push('🚨 High rugpull risk');
    }

    return { penalty: Math.min(penalty, 25), flags };
  }

  /**
   * Check for snipers and bundled launches
   */
  checkSnipers(launchAnalysis?: LaunchAnalysis): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    if (!launchAnalysis) {
      return { penalty: 0, flags: [] };
    }

    // Bundled buys (same block as creation = insider)
    if (launchAnalysis.bundledBuys > 3) {
      penalty += 15;
      flags.push(`🤖 Bundled launch: ${launchAnalysis.bundledBuys} buys in creation block`);
    } else if (launchAnalysis.bundledBuys > 1) {
      penalty += 8;
      flags.push(`Bundled buys detected: ${launchAnalysis.bundledBuys}`);
    }

    // Many snipers
    if (launchAnalysis.sniperCount > 20) {
      penalty += 12;
      flags.push(`Heavy sniper activity: ${launchAnalysis.sniperCount} early buyers`);
    } else if (launchAnalysis.sniperCount > 10) {
      penalty += 6;
      flags.push(`Sniper activity: ${launchAnalysis.sniperCount} early buyers`);
    }

    // Large average first buy (insider with capital)
    if (launchAnalysis.avgFirstBuySize > 5) { // More than 5 SOL avg
      penalty += 10;
      flags.push(`Large early buys: avg ${launchAnalysis.avgFirstBuySize.toFixed(1)} SOL`);
    } else if (launchAnalysis.avgFirstBuySize > 2) {
      penalty += 5;
      flags.push(`Significant early buys: avg ${launchAnalysis.avgFirstBuySize.toFixed(1)} SOL`);
    }

    // Creator bought back
    if (launchAnalysis.creatorBoughtBack) {
      penalty += 8;
      flags.push('Creator bought tokens after launch');
    }

    return { penalty: Math.min(penalty, 20), flags };
  }

  // ========== EXISTING CHECK METHODS (UPDATED) ==========

  /**
   * Detects wash trading patterns
   */
  checkWashTrading(transactions: Transaction[]): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    if (transactions.length === 0) {
      return { penalty: 0, flags: [] };
    }

    const walletActivity: Record<string, { buys: number; sells: number; timestamps: number[] }> = {};

    transactions.forEach((tx) => {
      const wallet = tx.source;
      if (!walletActivity[wallet]) {
        walletActivity[wallet] = { buys: 0, sells: 0, timestamps: [] };
      }

      if (tx.type === 'BUY' || tx.type === 'SWAP') walletActivity[wallet].buys++;
      if (tx.type === 'SELL') walletActivity[wallet].sells++;
      walletActivity[wallet].timestamps.push(tx.timestamp);
    });

    Object.entries(walletActivity).forEach(([wallet, activity]) => {
      if (activity.buys > 5 && activity.sells > 5) {
        penalty += 12;
        flags.push(`Wash trading: ${wallet.slice(0, 8)}...`);
      }

      if (activity.timestamps.length > 1) {
        const sortedTimes = activity.timestamps.sort((a, b) => a - b);
        const timeDiffs: number[] = [];
        for (let i = 1; i < sortedTimes.length; i++) {
          timeDiffs.push(sortedTimes[i] - sortedTimes[i - 1]);
        }
        const avgInterval = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
        
        if (avgInterval < 30000 && activity.buys + activity.sells > 10) {
          penalty += 10;
          flags.push(`Bot activity: ${wallet.slice(0, 8)}...`);
        }
      }
    });

    return { penalty: Math.min(penalty, 20), flags };
  }

  /**
   * Checks holder distribution
   * NOTE: holders[].percentage is already calculated as 0-100 from the actual total supply
   */
  checkHolderDistribution(holders: Holder[], actualHolderCount?: number): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    const holderCount = actualHolderCount || holders.length;

    if (holderCount < this.thresholds.minHolders) {
      penalty += 15;
      flags.push(`Low holders: ${holderCount}`);
    } else if (holderCount < this.thresholds.minHolders * 2) {
      penalty += 8;
      flags.push(`Moderate holders: ${holderCount}`);
    }

    // Use the pre-calculated percentage field (0-100) from on-chain data
    // This is accurate because it's calculated against the actual total supply
    if (holders.length >= 10) {
      // Sum the percentages of top 10 holders (already in 0-100 format)
      const top10Percentage = holders.slice(0, 10).reduce((sum, h) => sum + h.percentage, 0) / 100;

      if (top10Percentage > 0.50) {
        penalty += 15;
        flags.push(`Very high concentration: Top 10 hold ${(top10Percentage * 100).toFixed(1)}%`);
      } else if (top10Percentage > this.thresholds.maxTopHolderConcentration) {
        penalty += 10;
        flags.push(`High concentration: Top 10 hold ${(top10Percentage * 100).toFixed(1)}%`);
      }

      // Largest holder percentage (already 0-100)
      const largestHolder = holders[0];
      const largestPercentage = largestHolder ? largestHolder.percentage / 100 : 0;
      
      if (largestPercentage > 0.30) {
        penalty += 10;
        flags.push(`Mega whale: ${(largestPercentage * 100).toFixed(1)}% held by one wallet`);
      } else if (largestPercentage > 0.20) {
        penalty += 6;
        flags.push(`Whale: ${(largestPercentage * 100).toFixed(1)}% held by one wallet`);
      }
    } else if (holders.length > 0) {
      // Less than 10 holders - use what we have
      const totalPct = holders.reduce((sum, h) => sum + h.percentage, 0) / 100;
      if (totalPct > 0.80) {
        penalty += 15;
        flags.push(`Very high concentration: Top ${holders.length} hold ${(totalPct * 100).toFixed(1)}%`);
      }
      
      const largestHolder = holders[0];
      const largestPercentage = largestHolder ? largestHolder.percentage / 100 : 0;
      
      if (largestPercentage > 0.30) {
        penalty += 10;
        flags.push(`Mega whale: ${(largestPercentage * 100).toFixed(1)}% held by one wallet`);
      } else if (largestPercentage > 0.20) {
        penalty += 6;
        flags.push(`Whale: ${(largestPercentage * 100).toFixed(1)}% held by one wallet`);
      }
    }

    return { penalty: Math.min(penalty, 25), flags };
  }

  /**
   * Checks developer holdings
   */
  checkDeveloperHoldings(
    holders: Holder[],
    devWallet: string,
    devHoldingsAmount: number
  ): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    const totalSupply = holders.reduce((sum, h) => sum + h.amount, 0);

    if (totalSupply > 0 && devHoldingsAmount > 0) {
      const devPercentage = devHoldingsAmount / totalSupply;

      if (devPercentage > 0.25) {
        penalty += 15;
        flags.push(`Very high dev holdings: ${(devPercentage * 100).toFixed(1)}%`);
      } else if (devPercentage > this.thresholds.maxDevHoldings) {
        penalty += 10;
        flags.push(`High dev holdings: ${(devPercentage * 100).toFixed(1)}%`);
      } else if (devPercentage > 0.05) {
        penalty += 5;
        flags.push(`Moderate dev holdings: ${(devPercentage * 100).toFixed(1)}%`);
      }
    } else if (devWallet && holders.length > 0) {
      const devHolding = holders.find(
        (h) => h.address.toLowerCase() === devWallet.toLowerCase()
      );
      
      if (devHolding && totalSupply > 0) {
        const devPercentage = devHolding.amount / totalSupply;
        
        if (devPercentage > this.thresholds.maxDevHoldings) {
          penalty += 10;
          flags.push(`High dev holdings: ${(devPercentage * 100).toFixed(1)}%`);
        }
      }
    }

    return { penalty: Math.min(penalty, 15), flags };
  }

  /**
   * Checks for volume manipulation
   */
  checkVolumeManipulation(transactions: Transaction[]): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    if (transactions.length === 0) {
      return { penalty: 0, flags: [] };
    }

    const uniqueTraders = new Set(transactions.map((tx) => tx.source)).size;
    const totalTxs = transactions.length;
    const uniqueRatio = uniqueTraders / totalTxs;

    if (uniqueRatio < 0.30) {
      penalty += 15;
      flags.push(`Low trader diversity: ${uniqueTraders}/${totalTxs} unique`);
    } else if (uniqueRatio < this.thresholds.minUniqueTradersRatio) {
      penalty += 8;
      flags.push(`Volume manipulation risk: ${uniqueTraders} unique in ${totalTxs} txs`);
    }

    const buyTransactions = transactions.filter(
      (tx) => tx.type === 'BUY' || tx.type === 'SWAP'
    );
    const microBuys = buyTransactions.filter((tx) => tx.amount < 0.01).length;

    if (buyTransactions.length > 0 && microBuys > buyTransactions.length * 0.4) {
      penalty += 10;
      flags.push(`Micro-buys: ${microBuys}/${buyTransactions.length} tiny transactions`);
    }

    return { penalty: Math.min(penalty, 20), flags };
  }

  /**
   * Checks for airdrop schemes
   */
  checkAirdropScheme(transactions: Transaction[]): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    if (transactions.length === 0) {
      return { penalty: 0, flags: [] };
    }

    const sortedTxs = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
    const firstTradeIndex = sortedTxs.findIndex(
      (tx) => tx.type === 'BUY' || tx.type === 'SELL' || tx.type === 'SWAP'
    );

    if (firstTradeIndex > 0) {
      const preTradeTransfers = sortedTxs
        .slice(0, firstTradeIndex)
        .filter((tx) => tx.type === 'TRANSFER');

      let dumpCount = 0;
      preTradeTransfers.forEach((transfer) => {
        const recipientSold = sortedTxs.find(
          (tx) =>
            tx.source === transfer.toUserAccount &&
            tx.type === 'SELL' &&
            tx.timestamp > transfer.timestamp
        );
        if (recipientSold) dumpCount++;
      });

      if (dumpCount > 5) {
        penalty += 15;
        flags.push(`Airdrop dump: ${dumpCount} recipients sold`);
      } else if (dumpCount > 2) {
        penalty += 8;
        flags.push(`Minor airdrop dump: ${dumpCount} recipients sold`);
      }
    }

    return { penalty: Math.min(penalty, 15), flags };
  }

  /**
   * Checks social signals
   */
  checkSocialSignals(metadata: TokenMetadata): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    if (!metadata.twitter && !metadata.telegram) {
      penalty += 6;
      flags.push('No social links');
    } else if (!metadata.twitter) {
      penalty += 3;
      flags.push('No Twitter');
    }

    if (!metadata.website) {
      penalty += 2;
      flags.push('No website');
    }

    const genericTerms = ['moon', 'pump', 'gem', '100x', '1000x', 'ape', 'degen', 'send it'];
    const description = metadata.description?.toLowerCase() || '';
    
    if (genericTerms.some((term) => description.includes(term)) && description.length < 50) {
      penalty += 3;
      flags.push('Generic description');
    }

    const copycatPatterns = ['elon', 'musk', 'trump', 'official'];
    const name = metadata.name?.toLowerCase() || '';
    
    if (copycatPatterns.some((p) => name.includes(p)) && !metadata.twitter) {
      penalty += 4;
      flags.push('Possible impersonation');
    }

    return { penalty: Math.min(penalty, 10), flags };
  }
}

// Export singleton instance
export const scamFilterEngine = new ScamFilterEngine({
  minScore: parseInt(process.env.MIN_SCORE_THRESHOLD || '60'),
  maxDevHoldings: parseFloat(process.env.MAX_DEV_HOLDINGS || '0.15'),
  minHolders: parseInt(process.env.MIN_HOLDERS || '50'),
});
