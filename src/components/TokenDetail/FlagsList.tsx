'use client';

import React from 'react';
import { Badge } from '../common/Badge';
import { 
  Users, 
  RefreshCw, 
  Bot, 
  Code, 
  Fish, 
  BarChart, 
  Gift, 
  Smartphone, 
  Copy,
  AlertTriangle,
  ShieldCheck,
  ShieldAlert,
  Lock
} from 'lucide-react';
import { clsx } from 'clsx';

interface FlagsListProps {
  flags: string[];
}

export function FlagsList({ flags }: FlagsListProps) {
  if (flags.length === 0) {
    return (
      <div className="text-center py-4 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
        <ShieldCheck className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
        <p className="text-emerald-400 text-sm font-medium">
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

  const getFlagIcon = (flag: string) => {
    const lowerFlag = flag.toLowerCase();
    if (lowerFlag.includes('holder')) return Users;
    if (lowerFlag.includes('wash') || lowerFlag.includes('trading')) return RefreshCw;
    if (lowerFlag.includes('bot')) return Bot;
    if (lowerFlag.includes('dev')) return Code;
    if (lowerFlag.includes('whale')) return Fish;
    if (lowerFlag.includes('volume')) return BarChart;
    if (lowerFlag.includes('airdrop')) return Gift;
    if (lowerFlag.includes('social')) return Smartphone;
    if (lowerFlag.includes('copycat')) return Copy;
    if (lowerFlag.includes('liquidity') || lowerFlag.includes('lp')) return Lock;
    if (lowerFlag.includes('honeypot')) return ShieldAlert;
    return AlertTriangle;
  };

  return (
    <div className="space-y-1.5">
      {flags.map((flag, index) => {
        const Icon = getFlagIcon(flag);
        const variant = getFlagVariant(flag);
        
        return (
          <div
            key={index}
            className={clsx(
              "flex items-center gap-2 p-2 rounded-lg border transition-colors",
              variant === 'danger' && "bg-rose-500/10 border-rose-500/20 text-rose-200",
              variant === 'warning' && "bg-amber-500/10 border-amber-500/20 text-amber-200",
              variant === 'info' && "bg-blue-500/10 border-blue-500/20 text-blue-200"
            )}
          >
            <Icon className={clsx(
              "w-4 h-4 shrink-0",
              variant === 'danger' && "text-rose-400",
              variant === 'warning' && "text-amber-400",
              variant === 'info' && "text-blue-400"
            )} />
            <span className="flex-1 text-xs font-medium leading-tight">
              {flag}
            </span>
            <Badge variant={variant} size="sm">
              {variant === 'danger'
                ? 'High'
                : variant === 'warning'
                ? 'Med'
                : 'Low'}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}
