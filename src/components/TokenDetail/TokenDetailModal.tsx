'use client';

import React from 'react';
import { TokenAnalysis } from '@/types';
import { Modal, Button } from '../common';
import { ScoreBadge } from '../TokenCard/ScoreBadge';
import { ScoreBreakdown } from './ScoreBreakdown';
import { FlagsList } from './FlagsList';

interface TokenDetailModalProps {
  token: TokenAnalysis | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TokenDetailModal({
  token,
  isOpen,
  onClose,
}: TokenDetailModalProps) {
  if (!token) return null;

  const formatNumber = (num: number, decimals: number = 2): string => {
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(decimals)}M`;
    }
    if (num >= 1000) {
      return `$${(num / 1000).toFixed(decimals)}k`;
    }
    return `$${num.toFixed(decimals)}`;
  };

  const formatPercent = (num: number): string => {
    return `${(num * 100).toFixed(1)}%`;
  };

  const getTimeSinceMigration = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const handleTrade = () => {
    window.open(
      `https://jup.ag/swap/SOL-${token.address}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(token.address);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="space-y-8">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-5">
            <div className="relative">
              {token.metadata.image ? (
                <img
                  src={token.metadata.image}
                  alt={token.metadata.name}
                  className="w-20 h-20 rounded-2xl object-cover shadow-lg ring-2 ring-white/10"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold shadow-lg ring-2 ring-white/10">
                  {token.metadata.symbol.slice(0, 2)}
                </div>
              )}
              <div className="absolute -bottom-2 -right-2 bg-black/80 backdrop-blur-sm rounded-lg px-2 py-1 border border-white/10 text-xs font-medium text-white">
                ${token.metadata.symbol}
              </div>
            </div>
            
            <div>
              <h2 className="text-3xl font-bold text-white tracking-tight">
                {token.metadata.name}
              </h2>
              <button
                onClick={copyAddress}
                className="group flex items-center gap-2 mt-2 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 transition-all duration-200"
              >
                <span className="text-sm font-mono text-gray-400 group-hover:text-white transition-colors">
                  {token.address.slice(0, 6)}...{token.address.slice(-6)}
                </span>
                <svg
                  className="w-4 h-4 text-gray-500 group-hover:text-blue-400 transition-colors"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </button>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <ScoreBadge score={token.analysis.score} size="lg" showLabel />
            <span className="text-xs text-gray-500 font-medium">Risk Score</span>
          </div>
        </div>

        {/* Score Breakdown */}
        <div className="bg-white/5 rounded-2xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
            <span className="text-blue-400">📊</span> Score Breakdown
          </h3>
          <ScoreBreakdown
            breakdown={token.analysis.breakdown}
            totalScore={token.analysis.score}
          />
        </div>

        {/* Key Metrics */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <span className="text-green-400">📈</span> Key Metrics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricItem
              label="Market Cap"
              value={formatNumber(token.priceData.marketCap)}
              icon="💰"
            />
            <MetricItem
              label="Liquidity"
              value={formatNumber(token.priceData.liquidity)}
              icon="💧"
            />
            <MetricItem
              label="24h Volume"
              value={formatNumber(token.priceData.volume24h)}
              icon="📊"
            />
            <MetricItem
              label="Holders"
              value={token.statistics.holderCount.toString()}
              icon="👥"
            />
            <MetricItem
              label="Dev Holdings"
              value={formatPercent(token.statistics.devHoldings)}
              icon="👨‍💻"
            />
            <MetricItem
              label="Top 10"
              value={formatPercent(token.statistics.top10Concentration)}
              icon="🐳"
            />
            <MetricItem
              label="Unique Traders"
              value={token.statistics.uniqueTraders.toString()}
              icon="🔄"
            />
            <MetricItem
              label="Migrated"
              value={getTimeSinceMigration(token.migrationTimestamp)}
              icon="⏱️"
            />
          </div>
        </div>

        {/* Flags & Warnings */}
        {token.analysis.flags.length > 0 && (
          <div className="bg-red-500/5 rounded-2xl p-6 border border-red-500/20">
            <h3 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
              <span className="text-red-500">⚠️</span> Risk Factors
            </h3>
            <FlagsList flags={token.analysis.flags} />
          </div>
        )}

        {/* Social Links */}
        {(token.metadata.twitter ||
          token.metadata.telegram ||
          token.metadata.website) && (
          <div>
            <h3 className="text-lg font-semibold text-white mb-4">
              🔗 Official Links
            </h3>
            <div className="flex gap-3">
              {token.metadata.twitter && (
                <a
                  href={token.metadata.twitter}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#1DA1F2]/10 text-[#1DA1F2] rounded-xl hover:bg-[#1DA1F2]/20 transition-all duration-200 font-medium border border-[#1DA1F2]/20"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  Twitter
                </a>
              )}
              {token.metadata.telegram && (
                <a
                  href={token.metadata.telegram}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 bg-[#0088cc]/10 text-[#0088cc] rounded-xl hover:bg-[#0088cc]/20 transition-all duration-200 font-medium border border-[#0088cc]/20"
                >
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 11.944 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>
                  Telegram
                </a>
              )}
              {token.metadata.website && (
                <a
                  href={token.metadata.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2.5 bg-purple-500/10 text-purple-400 rounded-xl hover:bg-purple-500/20 transition-all duration-200 font-medium border border-purple-500/20"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
                  Website
                </a>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-4 pt-6 border-t border-white/10">
          <Button 
            variant="secondary" 
            onClick={onClose} 
            className="flex-1 py-4 text-base bg-white/5 hover:bg-white/10 border-white/10"
          >
            Close
          </Button>
          <a
            href={`https://dexscreener.com/solana/${token.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1"
          >
            <Button variant="outline" className="w-full py-4 text-base border-white/20 hover:bg-white/5">
              📊 Chart
            </Button>
          </a>
          <Button 
            variant="primary" 
            onClick={handleTrade} 
            className="flex-[2] py-4 text-base bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 border-none shadow-lg shadow-blue-500/20"
          >
            🚀 Trade on Jupiter
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MetricItem({ label, value, icon }: { label: string; value: string; icon: string }) {
  return (
    <div className="bg-white/5 rounded-xl p-4 border border-white/5 hover:border-white/10 transition-colors">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-lg">{icon}</span>
        <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-lg font-bold text-white tracking-tight">
        {value}
      </p>
    </div>
  );
}
