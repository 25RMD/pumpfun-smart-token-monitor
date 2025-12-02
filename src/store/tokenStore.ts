import { create } from 'zustand';
import { TokenAnalysis, FilterSettings, MonitorStats } from '@/types';

interface TokenStore {
  // Token data
  tokens: TokenAnalysis[];
  selectedToken: TokenAnalysis | null;
  
  // Stats
  stats: MonitorStats;
  
  // Filter settings
  filterSettings: FilterSettings;
  
  // Connection status
  isConnected: boolean;
  connectionError: string | null;
  
  // Actions
  addToken: (token: TokenAnalysis) => void;
  setTokens: (tokens: TokenAnalysis[]) => void;
  selectToken: (token: TokenAnalysis | null) => void;
  updateStats: (stats: MonitorStats) => void;
  updateFilterSettings: (settings: Partial<FilterSettings>) => void;
  resetFilterSettings: () => void;
  setConnectionStatus: (connected: boolean, error?: string) => void;
  getFilteredTokens: () => TokenAnalysis[];
}

const defaultFilterSettings: FilterSettings = {
  minScore: 0,
  maxDevHoldings: 1.0,
  minHolders: 0,
  minMarketCap: 0,
  hideWashTrading: false,
  hideAirdropSchemes: false,
  hideVolumeBots: false,
  showAll: true,
  sortBy: 'migration',
  sortDirection: 'desc',
};

export const useTokenStore = create<TokenStore>((set, get) => ({
  // Initial state
  tokens: [],
  selectedToken: null,
  stats: {
    monitored: 0,
    passed: 0,
    filtered: 0,
  },
  filterSettings: defaultFilterSettings,
  isConnected: false,
  connectionError: null,

  // Actions
  addToken: (token) => {
    set((state) => ({
      tokens: [token, ...state.tokens].slice(0, 50), // Keep last 50 tokens
    }));
  },

  setTokens: (tokens) => {
    set({ tokens });
  },

  selectToken: (token) => {
    set({ selectedToken: token });
  },

  updateStats: (stats) => {
    set({ stats });
  },

  updateFilterSettings: (settings) => {
    set((state) => ({
      filterSettings: { ...state.filterSettings, ...settings },
    }));
  },

  resetFilterSettings: () => {
    set({ filterSettings: defaultFilterSettings });
  },

  setConnectionStatus: (connected, error) => {
    set({
      isConnected: connected,
      connectionError: error || null,
    });
  },

  getFilteredTokens: () => {
    const { tokens, filterSettings } = get();

    if (filterSettings.showAll) {
      return tokens;
    }

    return tokens.filter((token) => {
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
  },
}));
