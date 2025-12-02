'use client';

import React from 'react';
import { Badge } from '../common/Badge';

interface FlagsListProps {
  flags: string[];
}

export function FlagsList({ flags }: FlagsListProps) {
  if (flags.length === 0) {
    return (
      <div className="text-center py-4">
        <span className="text-2xl mb-2 block">✅</span>
        <p className="text-gray-500 dark:text-gray-400">
          No warnings detected
        </p>
      </div>
    );
  }

  const getFlagVariant = (flag: string): 'danger' | 'warning' | 'info' => {
    const lowerFlag = flag.toLowerCase();
    if (
      lowerFlag.includes('high') ||
      lowerFlag.includes('wash') ||
      lowerFlag.includes('bot') ||
      lowerFlag.includes('dump')
    ) {
      return 'danger';
    }
    if (
      lowerFlag.includes('moderate') ||
      lowerFlag.includes('low') ||
      lowerFlag.includes('suspicious')
    ) {
      return 'warning';
    }
    return 'info';
  };

  const getFlagIcon = (flag: string): string => {
    const lowerFlag = flag.toLowerCase();
    if (lowerFlag.includes('holder')) return '👥';
    if (lowerFlag.includes('wash') || lowerFlag.includes('trading')) return '🔄';
    if (lowerFlag.includes('bot')) return '🤖';
    if (lowerFlag.includes('dev')) return '👨‍💻';
    if (lowerFlag.includes('whale')) return '🐋';
    if (lowerFlag.includes('volume')) return '📊';
    if (lowerFlag.includes('airdrop')) return '🎁';
    if (lowerFlag.includes('social')) return '📱';
    if (lowerFlag.includes('copycat')) return '🐱';
    return '⚠️';
  };

  return (
    <div className="space-y-2">
      {flags.map((flag, index) => (
        <div
          key={index}
          className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg"
        >
          <span className="text-xl">{getFlagIcon(flag)}</span>
          <span className="flex-1 text-sm text-gray-700 dark:text-gray-300">
            {flag}
          </span>
          <Badge variant={getFlagVariant(flag)} size="sm">
            {getFlagVariant(flag) === 'danger'
              ? 'High Risk'
              : getFlagVariant(flag) === 'warning'
              ? 'Caution'
              : 'Info'}
          </Badge>
        </div>
      ))}
    </div>
  );
}
