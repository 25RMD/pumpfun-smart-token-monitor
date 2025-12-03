'use client';

import React from 'react';
import { AnalysisBreakdown } from '@/types';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { clsx } from 'clsx';

interface ScoreBreakdownProps {
  breakdown: AnalysisBreakdown;
  totalScore: number;
}

export function ScoreBreakdown({ breakdown, totalScore }: ScoreBreakdownProps) {
  const items = [
    // Security Checks (Most Important)
    {
      label: '🔒 Security',
      penalty: breakdown.security?.penalty || 0,
      maxPenalty: breakdown.security?.maxScore || 25,
      flags: breakdown.security?.flags || [],
    },
    {
      label: '💧 Liquidity Health',
      penalty: breakdown.liquidity?.penalty || 0,
      maxPenalty: breakdown.liquidity?.maxScore || 20,
      flags: breakdown.liquidity?.flags || [],
    },
    {
      label: '🎯 Sniper Activity',
      penalty: breakdown.snipers?.penalty || 0,
      maxPenalty: breakdown.snipers?.maxScore || 20,
      flags: breakdown.snipers?.flags || [],
    },
    // Distribution & Holdings
    {
      label: 'Holder Distribution',
      penalty: breakdown.holders.penalty,
      maxPenalty: breakdown.holders.maxScore || 25,
      flags: breakdown.holders.flags,
    },
    {
      label: 'Developer Holdings',
      penalty: breakdown.developer.penalty,
      maxPenalty: breakdown.developer.maxScore || 15,
      flags: breakdown.developer.flags,
    },
    // Trading Analysis
    {
      label: '📈 Buy/Sell Pressure',
      penalty: breakdown.buyPressure?.penalty || 0,
      maxPenalty: breakdown.buyPressure?.maxScore || 15,
      flags: breakdown.buyPressure?.flags || [],
    },
    {
      label: 'Wash Trading',
      penalty: breakdown.washTrading.penalty,
      maxPenalty: breakdown.washTrading.maxScore || 20,
      flags: breakdown.washTrading.flags,
    },
    {
      label: 'Volume Analysis',
      penalty: breakdown.volume.penalty,
      maxPenalty: breakdown.volume.maxScore || 20,
      flags: breakdown.volume.flags,
    },
    // Other Checks
    {
      label: '⏰ Token Age',
      penalty: breakdown.tokenAge?.penalty || 0,
      maxPenalty: breakdown.tokenAge?.maxScore || 15,
      flags: breakdown.tokenAge?.flags || [],
    },
    {
      label: 'Airdrop Detection',
      penalty: breakdown.airdrops.penalty,
      maxPenalty: breakdown.airdrops.maxScore || 15,
      flags: breakdown.airdrops.flags,
    },
    {
      label: 'Social Signals',
      penalty: breakdown.social.penalty,
      maxPenalty: breakdown.social.maxScore || 10,
      flags: breakdown.social.flags,
    },
  ].filter(item => item.maxPenalty > 0); // Only show checks with penalties

  return (
    <div className="space-y-3">
      {items.map((item) => {
        const score = item.maxPenalty - item.penalty;
        const percentage = (score / item.maxPenalty) * 100;
        const isPerfect = item.penalty === 0;
        const isWarning = item.penalty > 0 && item.penalty < item.maxPenalty / 2;

        return (
          <div key={item.label} className="space-y-1">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {isPerfect ? (
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                ) : isWarning ? (
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-rose-500" />
                )}
                <span className="text-xs font-medium text-slate-300">
                  {item.label}
                </span>
              </div>
              <span
                className={clsx(
                  "text-xs font-mono font-bold",
                  isPerfect ? "text-emerald-400" :
                  isWarning ? "text-amber-400" :
                  "text-rose-400"
                )}
              >
                {item.penalty > 0 ? `-${item.penalty}` : `+${item.maxPenalty}`}
              </span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-800 rounded-full h-1 overflow-hidden">
              <div
                className={clsx(
                  "h-full rounded-full transition-all duration-500 ease-out",
                  isPerfect ? "bg-emerald-500" :
                  isWarning ? "bg-amber-500" :
                  "bg-rose-500"
                )}
                style={{ width: `${percentage}%` }}
              />
            </div>

            {/* Flags */}
            {item.flags.length > 0 && (
              <div className="text-[10px] text-slate-500 pl-5 font-medium leading-tight">
                {item.flags.join(', ')}
              </div>
            )}
          </div>
        );
      })}

      {/* Total Score */}
      <div className="pt-3 mt-1 border-t border-slate-800">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
            Total Score
          </span>
          <span
            className={clsx(
              "text-lg font-bold font-mono",
              totalScore >= 80 ? "text-emerald-400" :
              totalScore >= 60 ? "text-amber-400" :
              "text-rose-400"
            )}
          >
            {totalScore}/100
          </span>
        </div>
        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
          <div
            className={clsx(
              "h-full rounded-full transition-all duration-700 ease-out",
              totalScore >= 80 ? "bg-emerald-500" :
              totalScore >= 60 ? "bg-amber-500" :
              "bg-rose-500"
            )}
            style={{ width: `${totalScore}%` }}
          />
        </div>
      </div>
    </div>
  );
}
