'use client';

import React from 'react';
import { TokenAnalysis } from '@/types';
import { TokenCard } from '../TokenCard';

interface TokenFeedProps {
  tokens: TokenAnalysis[];
  onSelectToken: (token: TokenAnalysis) => void;
  isLoading?: boolean;
}

export function TokenFeed({ tokens, onSelectToken, isLoading }: TokenFeedProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="flex flex-col items-center gap-6">
          <div className="relative">
            <div className="w-16 h-16 rounded-full border-4 border-blue-500/30 border-t-blue-500 animate-spin" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-blue-500/20 animate-pulse" />
            </div>
          </div>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-white mb-1">Loading Recent Tokens</h3>
            <p className="text-gray-400">Fetching the last 50 graduated tokens...</p>
          </div>
        </div>
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="text-center max-w-md mx-auto px-6">
          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 ring-1 ring-white/10">
            <span className="text-4xl">📡</span>
          </div>
          <h3 className="text-xl font-bold text-white mb-3">
            No Tokens to Display
          </h3>
          <p className="text-gray-400 leading-relaxed">
            Tokens may be filtered by your current settings. Try adjusting the filters or enable &quot;Show All&quot; to see all tokens.
          </p>
          <div className="mt-8 flex justify-center gap-2">
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="w-2 h-2 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {tokens.map((token) => (
        <TokenCard
          key={token.address}
          token={token}
          onViewDetails={() => onSelectToken(token)}
        />
      ))}
    </div>
  );
}
