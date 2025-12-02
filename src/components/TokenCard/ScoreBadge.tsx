'use client';

import React from 'react';
import { getRiskColor, getRiskLevel } from '@/types';

export interface ScoreBadgeProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export function ScoreBadge({ score, size = 'md', showLabel = true }: ScoreBadgeProps) {
  const color = getRiskColor(score);
  const level = getRiskLevel(score);
  
  const sizeClasses = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-12 h-12 text-sm',
    lg: 'w-16 h-16 text-base',
  };

  const colorClasses: Record<string, string> = {
    green: 'text-emerald-500 border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20',
    yellow: 'text-amber-500 border-amber-500 bg-amber-50 dark:bg-amber-900/20',
    red: 'text-rose-500 border-rose-500 bg-rose-50 dark:bg-rose-900/20',
  };

  return (
    <div className="relative flex flex-col items-center justify-center">
      <div className={`relative flex items-center justify-center rounded-full border-2 ${colorClasses[color] || colorClasses.red} ${sizeClasses[size]} font-bold shadow-sm`}>
        {score}
      </div>
      {size !== 'sm' && showLabel && (
        <span className={`mt-1 text-[10px] font-bold uppercase tracking-wider ${
          color === 'green' ? 'text-emerald-600 dark:text-emerald-400' : 
          color === 'yellow' ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'
        }`}>
          {level.replace('_', ' ')}
        </span>
      )}
    </div>
  );
}
