'use client';

import { useMemo } from 'react';
import { useTokenStore } from '@/store';
import { TokenAnalysis } from '@/types';

export function useTokenFilter() {
  const { tokens, filterSettings, updateFilterSettings, resetFilterSettings } = useTokenStore();

  const filteredTokens = useMemo(() => {
    if (filterSettings.showAll) {
      return tokens;
    }

    return tokens.filter((token: TokenAnalysis) => {
      // Filter by score
      if (token.analysis.score < filterSettings.minScore) {
        return false;
      }

      // Filter by dev holdings
      if (token.statistics.devHoldings > filterSettings.maxDevHoldings) {
        return false;
      }

      // Filter by holder count
      if (token.statistics.holderCount < filterSettings.minHolders) {
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
        if (
          flags.some(
            (f) => f.includes('volume manipulation') || f.includes('micro-buy')
          )
        ) {
          return false;
        }
      }

      return true;
    });
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
