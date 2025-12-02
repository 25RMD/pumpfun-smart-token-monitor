import {
  TokenAnalysis,
  TokenMetadata,
  PriceData,
  Holder,
  Transaction,
  TokenStatistics,
  AnalysisResult,
  FilterCheckResult,
} from '@/types';

export interface FilterThresholds {
  minScore: number;
  maxDevHoldings: number;
  minHolders: number;
  maxTopHolderConcentration: number;
  minUniqueTradersRatio: number;
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
    holderCount?: number; // Actual holder count (not just holders.length which is top 20)
  }): Promise<AnalysisResult> {
    let score = this.baseScore;
    let flags: string[] = [];

    // Run all filter checks
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

    return {
      passed: score >= this.thresholds.minScore,
      score: Math.max(0, Math.min(100, score)),
      flags,
      breakdown: {
        washTrading: { ...washTradingResult, maxScore: 30 },
        holders: { ...holderResult, maxScore: 35 },
        developer: { ...devResult, maxScore: 20 },
        volume: { ...volumeResult, maxScore: 35 },
        airdrops: { ...airdropResult, maxScore: 25 },
        social: { ...socialResult, maxScore: 15 },
      },
    };
  }

  /**
   * Detects wash trading patterns - same wallet buying and selling frequently
   */
  checkWashTrading(transactions: Transaction[]): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    if (transactions.length === 0) {
      return { penalty: 0, flags: [] };
    }

    // Group transactions by wallet
    const walletActivity: Record<string, {
      buys: number;
      sells: number;
      timestamps: number[];
    }> = {};

    transactions.forEach((tx) => {
      const wallet = tx.source;
      if (!walletActivity[wallet]) {
        walletActivity[wallet] = { buys: 0, sells: 0, timestamps: [] };
      }

      if (tx.type === 'BUY' || tx.type === 'SWAP') {
        walletActivity[wallet].buys++;
      }
      if (tx.type === 'SELL') {
        walletActivity[wallet].sells++;
      }
      walletActivity[wallet].timestamps.push(tx.timestamp);
    });

    // Check for suspicious patterns
    Object.entries(walletActivity).forEach(([wallet, activity]) => {
      // Same wallet buying and selling frequently
      if (activity.buys > 5 && activity.sells > 5) {
        penalty += 15;
        flags.push(`Wash trading detected: ${wallet.slice(0, 8)}...`);
      }

      // High-frequency trading in short intervals
      if (activity.timestamps.length > 1) {
        const sortedTimes = activity.timestamps.sort((a, b) => a - b);
        const timeDiffs: number[] = [];
        
        for (let i = 1; i < sortedTimes.length; i++) {
          timeDiffs.push(sortedTimes[i] - sortedTimes[i - 1]);
        }

        const avgInterval = timeDiffs.reduce((a, b) => a + b, 0) / timeDiffs.length;
        
        // If average interval is less than 30 seconds and high activity
        if (avgInterval < 30000 && activity.buys + activity.sells > 10) {
          penalty += 15;
          flags.push(`Bot-like activity: ${wallet.slice(0, 8)}...`);
        }
      }
    });

    return { penalty: Math.min(penalty, 30), flags };
  }

  /**
   * Checks holder distribution for concentration risks
   */
  checkHolderDistribution(holders: Holder[], actualHolderCount?: number): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    // Use actual holder count if provided, otherwise fall back to holders.length
    const holderCount = actualHolderCount || holders.length;

    // Too few holders
    if (holderCount < this.thresholds.minHolders) {
      penalty += 20;
      flags.push(`Low holder count: ${holderCount}`);
    } else if (holderCount < this.thresholds.minHolders * 2) {
      penalty += 10;
      flags.push(`Moderate holder count: ${holderCount}`);
    }

    // Calculate total supply
    const totalSupply = holders.reduce((sum, h) => sum + h.amount, 0);

    if (totalSupply > 0 && holders.length >= 10) {
      // Check top holder concentration
      const top10Holdings = holders
        .slice(0, 10)
        .reduce((sum, h) => sum + h.amount, 0);
      const top10Percentage = top10Holdings / totalSupply;

      if (top10Percentage > this.thresholds.maxTopHolderConcentration) {
        penalty += 15;
        flags.push(
          `High concentration: Top 10 hold ${(top10Percentage * 100).toFixed(1)}%`
        );
      }

      // Check for single whale
      const largestHolder = holders[0];
      const largestPercentage = largestHolder ? largestHolder.amount / totalSupply : 0;
      
      if (largestPercentage > 0.20) {
        penalty += 10;
        flags.push(`Whale alert: Largest holder owns ${(largestPercentage * 100).toFixed(1)}%`);
      }
    }

    return { penalty, flags };
  }

  /**
   * Checks developer/creator holdings
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

      if (devPercentage > this.thresholds.maxDevHoldings) {
        penalty += 20;
        flags.push(`High dev holdings: ${(devPercentage * 100).toFixed(1)}%`);
      } else if (devPercentage > 0.05) {
        penalty += 8;
        flags.push(`Moderate dev holdings: ${(devPercentage * 100).toFixed(1)}%`);
      }
    } else if (devWallet && holders.length > 0) {
      // Try to find dev wallet in holders list
      const devHolding = holders.find(
        (h) => h.address.toLowerCase() === devWallet.toLowerCase()
      );
      
      if (devHolding && totalSupply > 0) {
        const devPercentage = devHolding.amount / totalSupply;
        
        if (devPercentage > this.thresholds.maxDevHoldings) {
          penalty += 20;
          flags.push(`High dev holdings: ${(devPercentage * 100).toFixed(1)}%`);
        } else if (devPercentage > 0.05) {
          penalty += 8;
          flags.push(`Moderate dev holdings: ${(devPercentage * 100).toFixed(1)}%`);
        }
      }
    }

    return { penalty, flags };
  }

  /**
   * Checks for volume manipulation patterns
   */
  checkVolumeManipulation(transactions: Transaction[]): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    if (transactions.length === 0) {
      return { penalty: 0, flags: [] };
    }

    // Count unique traders vs total transactions
    const uniqueTraders = new Set(transactions.map((tx) => tx.source)).size;
    const totalTxs = transactions.length;
    const uniqueRatio = uniqueTraders / totalTxs;

    if (uniqueRatio < this.thresholds.minUniqueTradersRatio) {
      penalty += 20;
      flags.push(
        `Volume manipulation: ${uniqueTraders} unique traders in ${totalTxs} transactions`
      );
    }

    // Check for micro-buys (very small amounts repeated)
    const buyTransactions = transactions.filter(
      (tx) => tx.type === 'BUY' || tx.type === 'SWAP'
    );
    const microBuys = buyTransactions.filter((tx) => tx.amount < 0.01).length;

    if (buyTransactions.length > 0 && microBuys > buyTransactions.length * 0.3) {
      penalty += 15;
      flags.push(`Suspicious micro-buys: ${microBuys} transactions`);
    }

    // Check for suspicious timing patterns (transactions in exact intervals)
    const sortedTxs = [...transactions].sort((a, b) => a.timestamp - b.timestamp);
    const intervals: number[] = [];
    
    for (let i = 1; i < sortedTxs.length; i++) {
      intervals.push(sortedTxs[i].timestamp - sortedTxs[i - 1].timestamp);
    }

    if (intervals.length > 10) {
      // Check if many transactions happen at exact same intervals (bot behavior)
      const intervalCounts: Record<number, number> = {};
      intervals.forEach((interval) => {
        // Round to nearest second
        const rounded = Math.round(interval / 1000) * 1000;
        intervalCounts[rounded] = (intervalCounts[rounded] || 0) + 1;
      });

      const maxCount = Math.max(...Object.values(intervalCounts));
      if (maxCount > intervals.length * 0.5) {
        penalty += 10;
        flags.push('Suspicious uniform transaction timing detected');
      }
    }

    return { penalty: Math.min(penalty, 35), flags };
  }

  /**
   * Checks for airdrop dump schemes
   */
  checkAirdropScheme(transactions: Transaction[]): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    if (transactions.length === 0) {
      return { penalty: 0, flags: [] };
    }

    // Sort transactions by time
    const sortedTxs = [...transactions].sort((a, b) => a.timestamp - b.timestamp);

    // Find first trade (buy or sell)
    const firstTradeIndex = sortedTxs.findIndex(
      (tx) => tx.type === 'BUY' || tx.type === 'SELL' || tx.type === 'SWAP'
    );

    if (firstTradeIndex > 0) {
      // Get transfers before first trade
      const preTradeTransfers = sortedTxs
        .slice(0, firstTradeIndex)
        .filter((tx) => tx.type === 'TRANSFER');

      // Check if recipients later sold
      let dumpCount = 0;
      preTradeTransfers.forEach((transfer) => {
        const recipientSold = sortedTxs.find(
          (tx) =>
            tx.source === transfer.toUserAccount &&
            tx.type === 'SELL' &&
            tx.timestamp > transfer.timestamp
        );

        if (recipientSold) {
          dumpCount++;
        }
      });

      if (dumpCount > 3) {
        penalty += 25;
        flags.push(`Airdrop dump pattern: ${dumpCount} recipients sold tokens`);
      } else if (dumpCount > 0) {
        penalty += 10;
        flags.push(`Minor airdrop dump: ${dumpCount} recipients sold`);
      }
    }

    return { penalty: Math.min(penalty, 25), flags };
  }

  /**
   * Checks social signals and metadata quality
   */
  checkSocialSignals(metadata: TokenMetadata): FilterCheckResult {
    let penalty = 0;
    const flags: string[] = [];

    // Check for missing social links
    if (!metadata.twitter && !metadata.telegram) {
      penalty += 10;
      flags.push('No social media links');
    } else if (!metadata.twitter) {
      penalty += 5;
      flags.push('No Twitter/X link');
    }

    // Check for missing website
    if (!metadata.website) {
      penalty += 3;
      flags.push('No website');
    }

    // Check for generic/low-effort description
    const genericTerms = ['moon', 'pump', 'gem', '100x', '1000x', 'next', 'ape', 'degen'];
    const description = metadata.description?.toLowerCase() || '';
    
    const hasGenericTerms = genericTerms.some((term) =>
      description.includes(term)
    );

    if (hasGenericTerms && description.length < 50) {
      penalty += 5;
      flags.push('Generic/low-effort description');
    }

    // Check if name/symbol look suspicious
    const suspiciousPatterns = ['elon', 'musk', 'pepe', 'shiba', 'doge'];
    const name = metadata.name?.toLowerCase() || '';
    const symbol = metadata.symbol?.toLowerCase() || '';
    
    const isCopycat = suspiciousPatterns.some(
      (pattern) => name.includes(pattern) || symbol.includes(pattern)
    );

    if (isCopycat && !metadata.twitter && !metadata.website) {
      penalty += 5;
      flags.push('Possible copycat token');
    }

    return { penalty: Math.min(penalty, 15), flags };
  }

  /**
   * Calculates statistics from holder and transaction data
   */
  calculateStatistics(
    holders: Holder[],
    transactions: Transaction[],
    devHoldings: number
  ): TokenStatistics {
    const totalSupply = holders.reduce((sum, h) => sum + h.amount, 0);
    const uniqueTraders = new Set(transactions.map((tx) => tx.source)).size;
    
    const top10Holdings = holders
      .slice(0, 10)
      .reduce((sum, h) => sum + h.amount, 0);
    const top10Concentration = totalSupply > 0 ? top10Holdings / totalSupply : 0;
    
    const devHoldingsPercentage = totalSupply > 0 ? devHoldings / totalSupply : 0;

    return {
      holderCount: holders.length,
      uniqueTraders,
      top10Concentration,
      devHoldings: devHoldingsPercentage,
    };
  }
}

// Export singleton instance with default thresholds
export const scamFilterEngine = new ScamFilterEngine({
  minScore: parseInt(process.env.MIN_SCORE_THRESHOLD || '60'),
  maxDevHoldings: parseFloat(process.env.MAX_DEV_HOLDINGS || '0.15'),
  minHolders: parseInt(process.env.MIN_HOLDERS || '50'),
});
