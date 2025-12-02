'use client';

import React, { useState } from 'react';
import { TokenAnalysis } from '@/types';
import { ScoreBadge } from './ScoreBadge';
import { Button, Badge } from '@/components/common';

interface TokenCardProps {
  token: TokenAnalysis;
  onViewDetails: (token: TokenAnalysis) => void;
}

export function TokenCard({ token, onViewDetails }: TokenCardProps) {
  const { metadata, priceData, statistics, analysis } = token;
  const [showAllFlags, setShowAllFlags] = useState(false);
  
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
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  };

  return (
    <div className="group relative overflow-hidden rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-all hover:shadow-md dark:border-gray-700 dark:bg-gray-800">
      {/* Hover Gradient Effect */}
      <div className="absolute inset-0 bg-gradient-to-br from-blue-50 to-transparent opacity-0 transition-opacity group-hover:opacity-50 dark:from-blue-900/10" />

      <div className="relative z-10">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            {metadata.image ? (
              <img 
                src={metadata.image} 
                alt={metadata.name} 
                className="h-12 w-12 rounded-full object-cover shadow-sm ring-2 ring-gray-100 dark:ring-gray-700"
              />
            ) : (
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-purple-600 text-lg font-bold text-white shadow-sm">
                {metadata.symbol.slice(0, 2)}
              </div>
            )}
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">{metadata.name}</h3>
              <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                <span className="font-medium text-blue-600 dark:text-blue-400">${metadata.symbol}</span>
                <span>•</span>
                <span>{timeAgo(token.migrationTimestamp)}</span>
              </div>
            </div>
          </div>
          <ScoreBadge score={analysis.score} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-4 border-t border-gray-100 py-3 dark:border-gray-700">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Mkt Cap</p>
            <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(priceData.marketCap)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Liquidity</p>
            <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(priceData.liquidity)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">24h Vol</p>
            <p className="font-semibold text-gray-900 dark:text-white">{formatCurrency(priceData.volume24h)}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 border-t border-gray-100 py-3 dark:border-gray-700">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Holders</p>
            <p className="font-semibold text-gray-900 dark:text-white">{formatNumber(statistics.holderCount)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Trades</p>
            <p className="font-semibold text-gray-900 dark:text-white">{formatNumber(priceData.trades24h)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-400">Dev Hold</p>
            <p className={`font-semibold ${(statistics.devHoldings * 100) > 10 ? 'text-red-500' : 'text-gray-900 dark:text-white'}`}>
              {statistics.devHoldings ? `${(statistics.devHoldings * 100).toFixed(1)}%` : 'N/A'}
            </p>
          </div>
        </div>

        {analysis.flags.length > 0 && (
          <div className="mt-3 border-t border-gray-100 dark:border-gray-700 pt-3">
            <div className="flex flex-wrap gap-1.5">
              {(showAllFlags ? analysis.flags : analysis.flags.slice(0, 2)).map((flag, i) => (
                <span 
                  key={i} 
                  className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 whitespace-nowrap"
                  title={flag}
                >
                  ⚠️ {flag}
                </span>
              ))}
              {analysis.flags.length > 2 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowAllFlags(!showAllFlags);
                  }}
                  className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors cursor-pointer"
                >
                  {showAllFlags ? '← Show less' : `+${analysis.flags.length - 2} more`}
                </button>
              )}
            </div>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <Button 
            variant="secondary" 
            size="sm" 
            className="w-full"
            onClick={() => onViewDetails(token)}
          >
            Details
          </Button>
          <Button 
            variant="primary" 
            size="sm" 
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 border-none"
            onClick={() => window.open(`https://raydium.io/swap/?inputCurrency=sol&outputCurrency=${token.address}`, '_blank')}
          >
            Trade
          </Button>
        </div>
      </div>
    </div>
  );
}
