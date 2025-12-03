'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { TokenAnalysis } from '@/types';
import { Modal, Button } from '../common';
import { ScoreBadge } from '../TokenCard/ScoreBadge';
import { ScoreBreakdown } from './ScoreBreakdown';
import { FlagsList } from './FlagsList';
import { 
  Clock, 
  Copy, 
  ExternalLink, 
  BarChart3, 
  Users, 
  Wallet, 
  AlertTriangle, 
  Twitter, 
  Send, 
  Globe,
  DollarSign,
  Droplets,
  Activity,
  PieChart,
  TrendingUp,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Lock,
  Unlock,
  Bot,
  Zap
} from 'lucide-react';

interface TokenDetailModalProps {
  token: TokenAnalysis | null;
  isOpen: boolean;
  onClose: () => void;
}

export function TokenDetailModal({
  token,
  isOpen,
  onClose,
}: TokenDetailModalProps) {
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  // Update time periodically for migration time display
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  // Calculate time since migration
  const timeSinceMigration = useMemo(() => {
    if (!token) return '';
    const diff = currentTime - token.migrationTimestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  }, [token, currentTime]);

  if (!token) return null;

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `$${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(1)}k`;
    return `$${num.toFixed(0)}`;
  };

  const formatPercent = (num: number): string => {
    if (num === 0) return '0%';
    return `${(num * 100).toFixed(1)}%`;
  };

  // Extract consistent values from flags or statistics
  // This ensures the displayed values match what was used for scoring
  const getTop10FromFlags = (): string => {
    const flag = token.analysis.flags.find(f => f.includes('Top 10 hold'));
    if (flag) {
      const match = flag.match(/([\d.]+)%/);
      if (match) return `${match[1]}%`;
    }
    return formatPercent(token.statistics.top10Concentration);
  };

  const getDevHoldingsFromFlags = (): string => {
    const flag = token.analysis.flags.find(f => f.includes('dev holdings'));
    if (flag) {
      const match = flag.match(/([\d.]+)%/);
      if (match) return `${match[1]}%`;
    }
    return formatPercent(token.statistics.devHoldings);
  };

  const getHolderCountFromFlags = (): string => {
    const flag = token.analysis.flags.find(f => f.includes('holder count'));
    if (flag) {
      const match = flag.match(/:\s*(\d+)/);
      if (match) return match[1];
    }
    return token.statistics.holderCount.toString();
  };

  const handleTrade = () => {
    window.open(
      `https://jup.ag/swap/SOL-${token.address}`,
      '_blank',
      'noopener,noreferrer'
    );
  };

  const copyAddress = () => {
    navigator.clipboard.writeText(token.address);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg">
      <div className="space-y-5">
        {/* Compact Header */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {token.metadata.image ? (
              <img
                src={token.metadata.image}
                alt={token.metadata.name}
                className="w-12 h-12 rounded-xl object-cover ring-1 ring-slate-700 shrink-0"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center text-white text-sm font-bold ring-1 ring-slate-700 shrink-0">
                {token.metadata.symbol.slice(0, 2)}
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white truncate">{token.metadata.name}</h2>
                <span className="text-xs text-slate-500 font-medium">${token.metadata.symbol}</span>
              </div>
              <button
                onClick={copyAddress}
                className="group flex items-center gap-1.5 text-xs font-mono text-slate-500 hover:text-blue-400 transition-colors"
              >
                {token.address.slice(0, 8)}...{token.address.slice(-6)}
                <Copy className="w-3 h-3" />
              </button>
            </div>
          </div>
          <ScoreBadge score={token.analysis.score} size="lg" showLabel />
        </div>

        {/* Compact Metrics Grid */}
        <div className="grid grid-cols-4 gap-2">
          <MetricItem label="MCap" value={formatNumber(token.priceData.marketCap)} icon={DollarSign} />
          <MetricItem label="Liq" value={formatNumber(token.priceData.liquidity)} icon={Droplets} />
          <MetricItem label="Vol 24h" value={formatNumber(token.priceData.volume24h)} icon={Activity} />
          <MetricItem label="Holders" value={getHolderCountFromFlags()} icon={Users} />
          <MetricItem label="Dev" value={getDevHoldingsFromFlags()} icon={Wallet} />
          <MetricItem label="Top 10" value={getTop10FromFlags()} icon={PieChart} />
          <MetricItem label="Txns 24h" value={token.statistics.uniqueTraders > 0 ? token.statistics.uniqueTraders.toString() : token.priceData.trades24h.toString()} icon={TrendingUp} />
          <MetricItem label="Age" value={timeSinceMigration} icon={Clock} />
        </div>

        {/* Security Status */}
        {token.security && (
          <div className="bg-slate-900/50 rounded-xl p-4 border border-slate-800">
            <h3 className="text-xs font-bold text-slate-400 mb-3 flex items-center gap-2 uppercase tracking-wider">
              <Shield className="w-3.5 h-3.5 text-blue-400" />
              Security Status
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <SecurityBadge
                label="Mint Auth"
                isOk={token.security.mintAuthorityRevoked}
                okText="Revoked"
                badText="Active"
                icon={token.security.mintAuthorityRevoked ? ShieldCheck : ShieldAlert}
              />
              <SecurityBadge
                label="Freeze Auth"
                isOk={token.security.freezeAuthorityRevoked}
                okText="Revoked"
                badText="Active"
                icon={token.security.freezeAuthorityRevoked ? ShieldCheck : ShieldAlert}
              />
              <SecurityBadge
                label="LP Lock"
                isOk={token.security.lpLocked}
                okText="Locked"
                badText="Unlocked"
                icon={token.security.lpLocked ? Lock : Unlock}
              />
              <SecurityBadge
                label="Rug Risk"
                isOk={!token.security.isRugpullRisk}
                okText="Low"
                badText="High"
                icon={token.security.isRugpullRisk ? AlertTriangle : ShieldCheck}
              />
            </div>
            {/* Launch Analysis */}
            {token.launchAnalysis && (token.launchAnalysis.bundledBuys > 0 || token.launchAnalysis.sniperCount > 5) && (
              <div className="mt-3 pt-3 border-t border-slate-800 flex flex-wrap gap-2">
                {token.launchAnalysis.bundledBuys > 0 && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 text-amber-400 text-xs rounded-md border border-amber-500/20">
                    <Bot className="w-3 h-3" />
                    {token.launchAnalysis.bundledBuys} bundled buys
                  </span>
                )}
                {token.launchAnalysis.sniperCount > 5 && (
                  <span className="flex items-center gap-1 px-2 py-1 bg-rose-500/10 text-rose-400 text-xs rounded-md border border-rose-500/20">
                    <Zap className="w-3 h-3" />
                    {token.launchAnalysis.sniperCount} snipers
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Score Breakdown - Collapsible */}
        <details className="group">
          <summary className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-wider cursor-pointer hover:text-white transition-colors">
            <Activity className="w-3.5 h-3.5 text-blue-400" />
            Score Breakdown
            <span className="text-slate-600 group-open:rotate-180 transition-transform">▼</span>
          </summary>
          <div className="mt-3 bg-slate-900/50 rounded-xl p-4 border border-slate-800">
            <ScoreBreakdown breakdown={token.analysis.breakdown} totalScore={token.analysis.score} />
          </div>
        </details>

        {/* Flags & Warnings - Compact */}
        {token.analysis.flags.length > 0 && (
          <div className="bg-rose-500/5 rounded-xl p-4 border border-rose-500/10">
            <h3 className="text-xs font-bold text-rose-400 mb-3 flex items-center gap-2 uppercase tracking-wider">
              <AlertTriangle className="w-3.5 h-3.5" />
              Risk Factors ({token.analysis.flags.length})
            </h3>
            <FlagsList flags={token.analysis.flags} />
          </div>
        )}

        {/* Social Links - Inline */}
        {(token.metadata.twitter || token.metadata.telegram || token.metadata.website) && (
          <div className="flex gap-2 flex-wrap">
            {token.metadata.twitter && (
              <a href={token.metadata.twitter} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1DA1F2]/10 text-[#1DA1F2] rounded-lg hover:bg-[#1DA1F2]/20 transition-all text-xs font-medium border border-[#1DA1F2]/20">
                <Twitter className="w-3.5 h-3.5" /> Twitter
              </a>
            )}
            {token.metadata.telegram && (
              <a href={token.metadata.telegram} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0088cc]/10 text-[#0088cc] rounded-lg hover:bg-[#0088cc]/20 transition-all text-xs font-medium border border-[#0088cc]/20">
                <Send className="w-3.5 h-3.5" /> Telegram
              </a>
            )}
            {token.metadata.website && (
              <a href={token.metadata.website} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/10 text-purple-400 rounded-lg hover:bg-purple-500/20 transition-all text-xs font-medium border border-purple-500/20">
                <Globe className="w-3.5 h-3.5" /> Website
              </a>
            )}
          </div>
        )}

        {/* Actions - Compact */}
        <div className="flex gap-3 pt-4 border-t border-slate-800">
          <Button variant="secondary" onClick={onClose} className="flex-1 py-2 text-xs bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300">
            Close
          </Button>
          <a href={`https://dexscreener.com/solana/${token.address}`} target="_blank" rel="noopener noreferrer" className="flex-1">
            <Button variant="outline" className="w-full py-2 text-xs border-slate-700 hover:bg-slate-800 text-slate-300">
              <BarChart3 className="w-3.5 h-3.5 mr-1.5" /> Chart
            </Button>
          </a>
          <Button variant="primary" onClick={handleTrade} className="flex-2 py-2 text-xs bg-blue-600 hover:bg-blue-500 border-none shadow-lg shadow-blue-900/20 text-white">
            <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> Trade
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function MetricItem({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="bg-slate-900/50 rounded-lg p-2.5 border border-slate-800 hover:border-slate-700 transition-colors group">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-slate-600 group-hover:text-blue-400 transition-colors" />
        <p className="text-[9px] font-bold text-slate-600 uppercase tracking-wider">{label}</p>
      </div>
      <p className="text-sm font-mono font-bold text-white truncate">{value}</p>
    </div>
  );
}

function SecurityBadge({ 
  label, 
  isOk, 
  okText, 
  badText, 
  icon: Icon 
}: { 
  label: string; 
  isOk: boolean; 
  okText: string; 
  badText: string;
  icon: React.ElementType;
}) {
  return (
    <div className={`rounded-lg p-2 border ${isOk ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-rose-500/5 border-rose-500/20'}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <Icon className={`w-3 h-3 ${isOk ? 'text-emerald-400' : 'text-rose-400'}`} />
        <span className="text-[9px] font-bold text-slate-500 uppercase">{label}</span>
      </div>
      <span className={`text-xs font-bold ${isOk ? 'text-emerald-400' : 'text-rose-400'}`}>
        {isOk ? okText : badText}
      </span>
    </div>
  );
}
