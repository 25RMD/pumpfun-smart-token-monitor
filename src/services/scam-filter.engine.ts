import {
  TokenMetadata,
  PriceData,
  Holder,
  Transaction,
  TokenSecurity,
  LaunchAnalysis,
  AnalysisResult,
  FilterCheckResult,
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
  }): Promise<AnalysisResult> {
    let score = this.baseScore;
    let flags: string[] = [];

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

    // Buy/Sell Pressure Analysis
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

    return {
      passed: score >= this.thresholds.minScore,
      score: Math.max(0, Math.min(100, score)),
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
    };
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

    const totalSupply = holders.reduce((sum, h) => sum + h.amount, 0);

    if (totalSupply > 0 && holders.length >= 10) {
      const top10Holdings = holders.slice(0, 10).reduce((sum, h) => sum + h.amount, 0);
      const top10Percentage = top10Holdings / totalSupply;

      if (top10Percentage > 0.50) {
        penalty += 15;
        flags.push(`Very high concentration: Top 10 hold ${(top10Percentage * 100).toFixed(1)}%`);
      } else if (top10Percentage > this.thresholds.maxTopHolderConcentration) {
        penalty += 10;
        flags.push(`High concentration: Top 10 hold ${(top10Percentage * 100).toFixed(1)}%`);
      }

      const largestHolder = holders[0];
      const largestPercentage = largestHolder ? largestHolder.amount / totalSupply : 0;
      
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
