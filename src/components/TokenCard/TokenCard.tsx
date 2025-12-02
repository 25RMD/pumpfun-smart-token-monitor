'use client';

import React, { useState, useEffect } from 'react';
import { TokenAnalysis } from '@/types';
import { ScoreBadge } from './ScoreBadge';
import { Button } from '@/components/common';
import { Clock, Users, DollarSign, BarChart3, AlertTriangle, ExternalLink, ArrowRightLeft } from 'lucide-react';
import { clsx } from 'clsx';

interface TokenCardProps {
  token: TokenAnalysis;
  onViewDetails: (token: TokenAnalysis) => void;
}

export function TokenCard({ token, onViewDetails }: TokenCardProps) {
  const { metadata, priceData, statistics, analysis } = token;
  const [showAllFlags, setShowAllFlags] = useState(false);
  const [currentTime, setCurrentTime] = useState(() => Date.now());
  
  // Update time periodically
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 30000); // Update every 30 seconds
    return () => clearInterval(interval);
  }, []);
  
  // Format numbers
  const formatCurrency = (val: number) => {
    if (!val || val === 0) return 'N/A';
    if (val >= 1000000) return `$${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `$${(val / 1000).toFixed(1)}K`;
    return `$${val.toFixed(0)}`;
  };

  const formatNumber = (val: number) => {
    if (!val && val !== 0) return 'N/A';
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toString();
  };

  const timeAgo = (timestamp: number) => {
    const seconds = Math.floor((currentTime - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h`;
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-slate-800 bg-[#0f172a] p-5 shadow-lg transition-all hover:border-slate-600 hover:shadow-xl hover:shadow-blue-900/10">
      {/* Hover Gradient Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="relative z-10">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            {metadata.image ? (
              <img 
                src={metadata.image} 
                alt={metadata.name} 
                className="h-10 w-10 rounded-full object-cover ring-2 ring-slate-700"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-sm font-bold text-white shadow-inner">
                {metadata.symbol.slice(0, 2)}
              </div>
            )}
            <div>
              <h3 className="font-bold text-white text-sm leading-tight truncate max-w-[120px]">{metadata.name}</h3>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span className="font-mono text-blue-400">${metadata.symbol}</span>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {timeAgo(token.migrationTimestamp)}
                </span>
              </div>
            </div>
          </div>
          <ScoreBadge score={analysis.score} />
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-800">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
              <DollarSign className="w-3 h-3" />
              Mkt Cap
            </div>
            <p className="font-mono font-semibold text-white">{formatCurrency(priceData.marketCap)}</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-800">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
              <BarChart3 className="w-3 h-3" />
              Liquidity
            </div>
            <p className="font-mono font-semibold text-white">{formatCurrency(priceData.liquidity)}</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-800">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
              <Users className="w-3 h-3" />
              Holders
            </div>
            <p className="font-mono font-semibold text-white">{formatNumber(statistics.holderCount)}</p>
          </div>
          <div className="bg-slate-900/50 rounded-lg p-2 border border-slate-800">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-slate-500 mb-0.5">
              <AlertTriangle className="w-3 h-3" />
              Dev Hold
            </div>
            <p className={clsx(
              "font-mono font-semibold",
              (statistics.devHoldings * 100) > 10 ? "text-rose-400" : "text-emerald-400"
            )}>
              {statistics.devHoldings ? `${(statistics.devHoldings * 100).toFixed(1)}%` : '0%'}
            </p>
          </div>
        </div>

        {/* Flags */}
        {analysis.flags.length > 0 && (
          <div className="mb-4">
            <div className="flex flex-wrap gap-1.5">
              {(showAllFlags ? analysis.flags : analysis.flags.slice(0, 2)).map((flag, i) => (
                <span 
                  key={i} 
                  className="inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20"
                  title={flag}
                >
                  <AlertTriangle className="w-3 h-3" />
                  {flag}
                </span>
              ))}
              {analysis.flags.length > 2 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAllFlags(!showAllFlags);
                  }}
                  className="inline-flex items-center px-2 py-1 rounded text-[10px] font-medium bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition-colors"
                >
                  {showAllFlags ? 'Show less' : `+${analysis.flags.length - 2}`}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button 
            variant="secondary" 
            size="sm" 
            className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700"
            onClick={() => onViewDetails(token)}
          >
            <ExternalLink className="w-3 h-3 mr-2" />
            Details
          </Button>
          <Button 
            variant="primary" 
            size="sm" 
            className="w-full bg-blue-600 hover:bg-blue-500 text-white border-none shadow-lg shadow-blue-900/20"
            onClick={() => window.open(`https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${token.address}`, '_blank')}
          >
            <ArrowRightLeft className="w-3 h-3 mr-2" />
            Trade
          </Button>
        </div>
      </div>
    </div>
  );
}
