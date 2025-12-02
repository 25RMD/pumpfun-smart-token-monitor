'use client';

import React, { useState } from 'react';
import { useTokenStore } from '@/store';
import { useTokenFilter, useTokenMonitor } from '@/hooks';
import { TokenAnalysis } from '@/types';
import { StatsPanel, FilterPanel, TokenFeed } from '@/components/Dashboard';
import { TokenDetailModal } from '@/components/TokenDetail';

export default function Home() {
  const [selectedToken, setSelectedToken] = useState<TokenAnalysis | null>(null);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  
  // Initialize the monitor (connects to WebSocket and loads history)
  const { isLoadingHistory } = useTokenMonitor();

  const { stats, isConnected } = useTokenStore();
  const { filteredTokens, filterSettings, updateFilterSettings, resetFilterSettings } = useTokenFilter();

  return (
    <main className="min-h-screen pb-20">
      {/* Header */}
      <header className="glass sticky top-0 z-50 border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <span className="text-xl">🚀</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white tracking-tight">
                  PumpMonitor
                </h1>
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isConnected ? 'bg-green-400' : 'bg-red-400'}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  </span>
                  <p className="text-xs text-gray-400 font-medium">
                    {isConnected ? 'Live Feed Active' : 'Connecting...'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-4">
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
        <div className="flex items-end justify-between animate-in fade-in slide-in-from-bottom-4 duration-700 delay-100">
          <div>
            <h2 className="text-2xl font-bold text-white mb-2 flex items-center gap-2">
              <span className="text-blue-400">⚡</span> Live Migrations
            </h2>
            <p className="text-gray-400">
              Showing {filteredTokens.length} tokens passing safety filters
              {filterSettings.showAll ? ' (showing all)' : ''}
            </p>
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
