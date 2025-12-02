'use client';

import React from 'react';

interface MetricsDisplayProps {
  marketCap: number;
  holders: number;
  devHoldings: number;
  liquidity?: number;
  volume24h?: number;
}

export function MetricsDisplay({
  marketCap,
  holders,
  devHoldings,
  liquidity,
  volume24h,
}: MetricsDisplayProps) {
  const formatNumber = (num: number, decimals: number = 1): string => {
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

  return (
    <div className="grid grid-cols-3 gap-2 text-sm">
      <div className="flex flex-col">
        <span className="text-gray-500 dark:text-gray-400 text-xs">MC</span>
        <span className="font-semibold text-gray-900 dark:text-white">
          {formatNumber(marketCap)}
        </span>
      </div>
      <div className="flex flex-col">
        <span className="text-gray-500 dark:text-gray-400 text-xs">Holders</span>
        <span className="font-semibold text-gray-900 dark:text-white">{holders}</span>
      </div>
      <div className="flex flex-col">
        <span className="text-gray-500 dark:text-gray-400 text-xs">Dev</span>
        <span className="font-semibold text-gray-900 dark:text-white">
          {formatPercent(devHoldings)}
        </span>
      </div>
      {liquidity !== undefined && liquidity > 0 && (
        <div className="flex flex-col">
          <span className="text-gray-500 dark:text-gray-400 text-xs">Liquidity</span>
          <span className="font-semibold text-gray-900 dark:text-white">
            {formatNumber(liquidity)}
          </span>
        </div>
      )}
      {volume24h !== undefined && volume24h > 0 && (
        <div className="flex flex-col">
          <span className="text-gray-500 dark:text-gray-400 text-xs">24h Vol</span>
          <span className="font-semibold text-gray-900 dark:text-white">
            {formatNumber(volume24h)}
          </span>
        </div>
      )}
    </div>
  );
}
