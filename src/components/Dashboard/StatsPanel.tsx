'use client';

import React from 'react';
import { MonitorStats } from '@/types';

export interface StatsPanelProps {
  stats: MonitorStats;
  isConnected?: boolean;
}

export function StatsPanel({ stats, isConnected = true }: StatsPanelProps) {
  const items = [
    { 
      label: 'Monitored', 
      value: stats.monitored, 
      color: 'text-blue-600 dark:text-blue-400',
      bg: 'bg-blue-50 dark:bg-blue-900/20'
    },
    { 
      label: 'Passed', 
      value: stats.passed, 
      color: 'text-emerald-600 dark:text-emerald-400',
      bg: 'bg-emerald-50 dark:bg-emerald-900/20'
    },
    { 
      label: 'Filtered', 
      value: stats.filtered, 
      color: 'text-rose-600 dark:text-rose-400',
      bg: 'bg-rose-50 dark:bg-rose-900/20'
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {items.map((item) => (
        <div 
          key={item.label} 
          className={`${item.bg} rounded-xl p-4 border border-transparent transition-all hover:scale-105`}
        >
          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
            {item.label}
          </p>
          <p className={`mt-1 text-2xl font-bold ${item.color}`}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
