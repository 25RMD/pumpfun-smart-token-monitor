'use client';

import React, { useState } from 'react';
import { useTokenStore } from '@/store';
import { useTokenFilter, useTokenMonitor } from '@/hooks';
import { TokenAnalysis, SortOption } from '@/types';
import { StatsPanel, FilterPanel, TokenFeed } from '@/components/Dashboard';
import { TokenDetailModal } from '@/components/TokenDetail';
import { Activity, Zap, Wifi, WifiOff, ArrowUpDown, Clock, DollarSign, BarChart3, Shield, Users, Droplets, ChevronDown, ArrowUp, ArrowDown } from 'lucide-react';
import { clsx } from 'clsx';

const SORT_OPTIONS: { value: SortOption; label: string; icon: React.ElementType }[] = [
  { value: 'migration', label: 'Latest', icon: Clock },
  { value: 'marketCap', label: 'Market Cap', icon: DollarSign },
  { value: 'volume', label: 'Volume', icon: BarChart3 },
  { value: 'score', label: 'Score', icon: Shield },
  { value: 'holders', label: 'Holders', icon: Users },
  { value: 'liquidity', label: 'Liquidity', icon: Droplets },
];

export default function Home() {
  const [selectedToken, setSelectedToken] = useState<TokenAnalysis | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isSortOpen, setIsSortOpen] = useState(false);
  
  // Initialize the monitor (connects to WebSocket and loads history)
  const { isLoadingHistory } = useTokenMonitor();

  const { stats, isConnected } = useTokenStore();
  const { filteredTokens, filterSettings, updateFilterSettings, resetFilterSettings } = useTokenFilter();

  const currentSort = SORT_OPTIONS.find(o => o.value === filterSettings.sortBy) || SORT_OPTIONS[0];
  const CurrentSortIcon = currentSort.icon;

  return (
    <main className="min-h-screen pb-20 bg-[#020617]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-[#020617]/80 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <Activity className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-white tracking-tight leading-none">
                  PumpMonitor
                </h1>
                <div className="flex items-center gap-1.5 mt-0.5">
                  {isConnected ? (
                    <Wifi className="w-3 h-3 text-emerald-500" />
                  ) : (
                    <WifiOff className="w-3 h-3 text-rose-500" />
                  )}
                  <p className={clsx(
                    "text-[10px] font-medium uppercase tracking-wider",
                    isConnected ? "text-emerald-500" : "text-rose-500"
                  )}>
                    {isConnected ? 'System Online' : 'Reconnecting'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Quick Sort Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setIsSortOpen(!isSortOpen)}
                  className={clsx(
                    "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200",
                    isSortOpen 
                      ? "bg-blue-500/10 border-blue-500/50 text-blue-400"
                      : "bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-600"
                  )}
                >
                  <CurrentSortIcon className="w-4 h-4" />
                  <span className="text-sm font-medium hidden sm:inline">{currentSort.label}</span>
                  {filterSettings.sortDirection === 'desc' ? (
                    <ArrowDown className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowUp className="w-3.5 h-3.5" />
                  )}
                </button>

                {isSortOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-40" 
                      onClick={() => setIsSortOpen(false)}
                    />
                    <div className="absolute right-0 top-full mt-2 w-48 z-50 origin-top-right rounded-lg border border-slate-700 bg-[#0f172a] shadow-2xl shadow-black/50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
                      {SORT_OPTIONS.map((option) => {
                        const Icon = option.icon;
                        const isSelected = filterSettings.sortBy === option.value;
                        return (
                          <button
                            key={option.value}
                            onClick={() => {
                              if (isSelected) {
                                // Toggle direction if same option
                                updateFilterSettings({ 
                                  sortDirection: filterSettings.sortDirection === 'desc' ? 'asc' : 'desc' 
                                });
                              } else {
                                updateFilterSettings({ sortBy: option.value, sortDirection: 'desc' });
                              }
                              setIsSortOpen(false);
                            }}
                            className={clsx(
                              "w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors",
                              isSelected
                                ? "bg-blue-500/10 text-blue-400"
                                : "text-slate-400 hover:bg-slate-800 hover:text-white"
                            )}
                          >
                            <Icon className="w-4 h-4" />
                            <span className="flex-1 text-left">{option.label}</span>
                            {isSelected && (
                              filterSettings.sortDirection === 'desc' 
                                ? <ArrowDown className="w-3.5 h-3.5" />
                                : <ArrowUp className="w-3.5 h-3.5" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>

              <FilterPanel
                settings={filterSettings}
                onUpdate={updateFilterSettings}
                onReset={resetFilterSettings}
                isOpen={isFilterOpen}
                onToggle={() => setIsFilterOpen(!isFilterOpen)}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Stats */}
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-700">
          <StatsPanel stats={stats} isConnected={isConnected} />
        </div>

        {/* Token Feed Header */}
        <div className="flex items-end justify-between animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100 border-b border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-400 fill-amber-400" />
              Live Migrations
            </h2>
            <p className="text-sm text-slate-400">
              Monitoring real-time graduations from Pump.fun to Raydium
            </p>
          </div>
          <div className="text-right">
             <span className="text-2xl font-bold text-white">{filteredTokens.length}</span>
             <span className="text-sm text-slate-500 ml-2">active tokens</span>
          </div>
        </div>

        {/* Token Grid */}
        <TokenFeed
          tokens={filteredTokens}
          onSelectToken={setSelectedToken}
          isLoading={isLoadingHistory && filteredTokens.length === 0}
        />
      </div>

      {/* Token Detail Modal */}
      <TokenDetailModal
        token={selectedToken}
        isOpen={!!selectedToken}
        onClose={() => setSelectedToken(null)}
      />
    </main>
  );
}
