'use client';

import React from 'react';
import { AnalysisBreakdown } from '@/types';

interface ScoreBreakdownProps {
  breakdown: AnalysisBreakdown;
  totalScore: number;
}

export function ScoreBreakdown({ breakdown, totalScore }: ScoreBreakdownProps) {
  const items = [
    {
      label: 'Holder Distribution',
      penalty: breakdown.holders.penalty,
      maxPenalty: breakdown.holders.maxScore || 35,
      flags: breakdown.holders.flags,
    },
    {
      label: 'Wash Trading Check',
      penalty: breakdown.washTrading.penalty,
      maxPenalty: breakdown.washTrading.maxScore || 30,
      flags: breakdown.washTrading.flags,
    },
    {
      label: 'Developer Holdings',
      penalty: breakdown.developer.penalty,
      maxPenalty: breakdown.developer.maxScore || 20,
      flags: breakdown.developer.flags,
    },
    {
      label: 'Volume Analysis',
      penalty: breakdown.volume.penalty,
      maxPenalty: breakdown.volume.maxScore || 35,
      flags: breakdown.volume.flags,
    },
    {
      label: 'Airdrop Detection',
      penalty: breakdown.airdrops.penalty,
      maxPenalty: breakdown.airdrops.maxScore || 25,
      flags: breakdown.airdrops.flags,
    },
    {
      label: 'Social Signals',
      penalty: breakdown.social.penalty,
      maxPenalty: breakdown.social.maxScore || 15,
      flags: breakdown.social.flags,
    },
  ];

  return (
    <div className="space-y-4">
      {items.map((item) => {
        const score = item.maxPenalty - item.penalty;
        const percentage = (score / item.maxPenalty) * 100;
        const isPerfect = item.penalty === 0;
        const isWarning = item.penalty > 0 && item.penalty < item.maxPenalty / 2;
        const isDanger = item.penalty >= item.maxPenalty / 2;

        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {isPerfect ? '✅' : isWarning ? '⚠️' : '❌'}
                </span>
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {item.label}
                </span>
              </div>
              <span
                className={`text-sm font-semibold ${
                  isPerfect
                    ? 'text-green-600 dark:text-green-400'
                    : isWarning
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-red-600 dark:text-red-400'
                }`}
              >
                {item.penalty > 0 ? `-${item.penalty}` : `+${item.maxPenalty}`}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
              <div
                className={`h-2 rounded-full transition-all duration-300 ${
                  isPerfect
                    ? 'bg-green-500'
                    : isWarning
                    ? 'bg-yellow-500'
                    : 'bg-red-500'
                }`}
                style={{ width: `${percentage}%` }}
              />
            </div>

            {/* Flags */}
            {item.flags.length > 0 && (
              <div className="text-xs text-gray-500 dark:text-gray-400 pl-7">
                {item.flags.join(', ')}
              </div>
            )}
          </div>
        );
      })}

      {/* Total Score */}
      <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <span className="text-base font-semibold text-gray-900 dark:text-white">
            Total Score
          </span>
          <span
            className={`text-2xl font-bold ${
              totalScore >= 80
                ? 'text-green-600 dark:text-green-400'
                : totalScore >= 60
                ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-red-600 dark:text-red-400'
            }`}
          >
            {totalScore}/100
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-3 mt-2">
          <div
            className={`h-3 rounded-full transition-all duration-500 ${
              totalScore >= 80
                ? 'bg-green-500'
                : totalScore >= 60
                ? 'bg-yellow-500'
                : 'bg-red-500'
            }`}
            style={{ width: `${totalScore}%` }}
          />
        </div>
      </div>
    </div>
  );
}
