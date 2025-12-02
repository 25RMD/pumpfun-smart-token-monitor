'use client';

import React from 'react';
import { MonitorStats } from '@/types';
import { Activity, CheckCircle, FilterX } from 'lucide-react';
import { clsx } from 'clsx';

export interface StatsPanelProps {
  stats: MonitorStats;
  isConnected?: boolean;
}

export function StatsPanel({ stats, isConnected = true }: StatsPanelProps) {
  const items = [
    { 
      label: 'Monitored', 
      value: stats.monitored, 
      icon: Activity,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10 border-blue-500/20'
    },
    { 
      label: 'Passed', 
      value: stats.passed, 
      icon: CheckCircle,
      color: 'text-emerald-400',
      bg: 'bg-emerald-500/10 border-emerald-500/20'
    },
    { 
      label: 'Filtered', 
      value: stats.filtered, 
      icon: FilterX,
      color: 'text-rose-400',
      bg: 'bg-rose-500/10 border-rose-500/20'
    },
  ];

  return (
    <div className="grid grid-cols-3 gap-4">
      {items.map((item) => (
        <div 
          key={item.label} 
          className={clsx(
            "relative overflow-hidden rounded-xl p-4 border transition-all hover:scale-[1.02]",
            item.bg
          )}
        >
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {item.label}
            </p>
            <item.icon className={clsx("w-4 h-4 opacity-50", item.color)} />
          </div>
          <p className={clsx("text-2xl font-mono font-bold", item.color)}>
            {item.value}
          </p>
        </div>
      ))}
    </div>
  );
}
