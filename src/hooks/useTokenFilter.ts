'use client';

import { useMemo } from 'react';
import { useTokenStore } from '@/store';
import { TokenAnalysis, SortOption, SortDirection } from '@/types';

function sortTokens(tokens: TokenAnalysis[], sortBy: SortOption, sortDirection: SortDirection): TokenAnalysis[] {
  const sorted = [...tokens].sort((a, b) => {
    let valueA: number;
    let valueB: number;

    switch (sortBy) {
      case 'migration':
        valueA = a.migrationTimestamp;
        valueB = b.migrationTimestamp;
        break;
      case 'marketCap':
        valueA = a.priceData.marketCap;
        valueB = b.priceData.marketCap;
        break;
      case 'volume':
        valueA = a.priceData.volume24h;
        valueB = b.priceData.volume24h;
        break;
      case 'score':
        valueA = a.analysis.score;
        valueB = b.analysis.score;
        break;
      case 'holders':
        valueA = a.statistics.holderCount;
        valueB = b.statistics.holderCount;
        break;
      case 'liquidity':
        valueA = a.priceData.liquidity;
        valueB = b.priceData.liquidity;
        break;
      default:
        valueA = a.migrationTimestamp;
        valueB = b.migrationTimestamp;
    }

    return sortDirection === 'desc' ? valueB - valueA : valueA - valueB;
  });

  return sorted;
}

export function useTokenFilter() {
  const { tokens, filterSettings, updateFilterSettings, resetFilterSettings } = useTokenStore();

  const filteredTokens = useMemo(() => {
    // First, filter the tokens (unless showAll is true)
    let result = tokens;
    
    if (!filterSettings.showAll) {
      result = tokens.filter((token: TokenAnalysis) => {
        // Filter by score
        if (filterSettings.minScore > 0 && token.analysis.score < filterSettings.minScore) {
          return false;
        }

        // Filter by dev holdings
        if (filterSettings.maxDevHoldings < 1 && token.statistics.devHoldings > filterSettings.maxDevHoldings) {
          return false;
        }

        // Filter by holder count
        if (filterSettings.minHolders > 0 && token.statistics.holderCount < filterSettings.minHolders) {
          return false;
        }

        // Filter by market cap
        if (filterSettings.minMarketCap > 0 && token.priceData.marketCap < filterSettings.minMarketCap) {
          return false;
        }

        // Filter by flags
        const flags = token.analysis.flags.map((f) => f.toLowerCase());

        if (filterSettings.hideWashTrading) {
          if (flags.some((f) => f.includes('wash trading') || f.includes('bot-like'))) {
            return false;
          }
        }

        if (filterSettings.hideAirdropSchemes) {
          if (flags.some((f) => f.includes('airdrop'))) {
            return false;
          }
        }

        if (filterSettings.hideVolumeBots) {
          if (flags.some((f) => f.includes('volume manipulation') || f.includes('micro-buy'))) {
            return false;
          }
        }

        return true;
      });
    }

    // Then sort the filtered tokens
    return sortTokens(result, filterSettings.sortBy, filterSettings.sortDirection);
  }, [tokens, filterSettings]);

  return {
    filteredTokens,
    filterSettings,
    updateFilterSettings,
    resetFilterSettings,
    totalTokens: tokens.length,
    filteredCount: tokens.length - filteredTokens.length,
  };
}
