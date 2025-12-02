'use client';

import React, { useState } from 'react';
import { FilterSettings } from '@/types';
import { Filter, RotateCcw, Check, SlidersHorizontal } from 'lucide-react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface FilterPanelProps {
  settings: FilterSettings;
  onUpdate: (settings: Partial<FilterSettings>) => void;
  onReset: () => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function FilterPanel({
  settings,
  onUpdate,
  onReset,
  isOpen,
  onToggle,
}: FilterPanelProps) {
  // Local state for editing filters before applying
  const [localSettings, setLocalSettings] = useState<FilterSettings>(settings);
  const [hasChanges, setHasChanges] = useState(false);
  const [lastOpenState, setLastOpenState] = useState(isOpen);

  // Reset local settings when panel opens
  if (isOpen && !lastOpenState) {
    setLocalSettings(settings);
    setHasChanges(false);
  }
  if (isOpen !== lastOpenState) {
    setLastOpenState(isOpen);
  }

  // Update local setting and track changes
  const updateLocal = (partial: Partial<FilterSettings>) => {
    setLocalSettings(prev => ({ ...prev, ...partial }));
    setHasChanges(true);
  };

  // Apply filters to the store
  const applyFilters = () => {
    onUpdate(localSettings);
    setHasChanges(false);
    onToggle(); // Close on apply
  };

  // Reset to defaults
  const handleReset = () => {
    onReset();
    setHasChanges(false);
  };

  // Calculate active filters count
  const activeCount = [
    localSettings.minScore > 0,
    localSettings.maxDevHoldings < 1,
    localSettings.minHolders > 0,
    localSettings.minMarketCap > 0,
    localSettings.hideWashTrading,
    localSettings.hideAirdropSchemes,
    localSettings.hideVolumeBots,
    !localSettings.showAll,
  ].filter(Boolean).length;

  return (
    <div className="relative">
      <button 
        onClick={onToggle}
        className={twMerge(
          "flex items-center gap-2 px-4 py-2 rounded-lg border transition-all duration-200",
          isOpen 
            ? "bg-blue-500/10 border-blue-500/50 text-blue-400" 
            : "bg-slate-800/50 border-slate-700 text-slate-300 hover:bg-slate-800 hover:border-slate-600"
        )}
      >
        <SlidersHorizontal className="w-4 h-4" />
        <span className="text-sm font-medium">Filters</span>
        {activeCount > 0 && (
          <span className="flex items-center justify-center w-5 h-5 text-[10px] font-bold bg-blue-500 text-white rounded-full">
            {activeCount}
          </span>
        )}
      </button>

      {isOpen && (
        <>
          {/* Click-outside overlay for all screen sizes */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={onToggle}
          />
          <div className="absolute right-0 top-full mt-2 w-72 z-50 origin-top-right rounded-xl border border-slate-700 bg-[#0f172a] p-0 shadow-2xl shadow-black/50 animate-in fade-in slide-in-from-top-2 duration-200 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-slate-800 bg-slate-900/50">
              <h2 className="text-sm font-semibold text-white flex items-center gap-2">
                <Filter className="w-4 h-4 text-blue-400" />
                Filters
              </h2>
              <button 
                onClick={handleReset}
                className="text-xs font-medium text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                title="Reset to defaults"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>

            <div className="p-4 space-y-5 max-h-[60vh] overflow-y-auto custom-scrollbar">
              {/* Enable Filters Toggle */}
              <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700">
                <Toggle 
                  label="Enable Filters" 
                  checked={!localSettings.showAll} 
                  onChange={(c) => updateLocal({ showAll: !c })} 
                  highlight
                />
                <p className="text-[9px] text-slate-500 mt-1.5">
                  Filter tokens by criteria below
                </p>
              </div>

              {/* Filter Options */}
              <div className={clsx(
                "space-y-4 transition-opacity duration-200",
                localSettings.showAll ? "opacity-40 pointer-events-none" : "opacity-100"
              )}>
                {/* Min Score Slider */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Min Score</label>
                    <span className={clsx(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded",
                      localSettings.minScore > 80 ? "bg-emerald-500/20 text-emerald-400" :
                      localSettings.minScore > 50 ? "bg-blue-500/20 text-blue-400" :
                      "bg-slate-700 text-slate-300"
                    )}>
                      {localSettings.minScore}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={localSettings.minScore}
                    onChange={(e) => updateLocal({ minScore: parseInt(e.target.value) })}
                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Max Dev Holdings */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Max Dev %</label>
                    <span className={clsx(
                      "text-[10px] font-bold px-1.5 py-0.5 rounded",
                      localSettings.maxDevHoldings < 0.1 ? "bg-emerald-500/20 text-emerald-400" :
                      localSettings.maxDevHoldings < 0.2 ? "bg-amber-500/20 text-amber-400" :
                      "bg-rose-500/20 text-rose-400"
                    )}>
                      {(localSettings.maxDevHoldings * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={localSettings.maxDevHoldings * 100}
                    onChange={(e) => updateLocal({ maxDevHoldings: parseInt(e.target.value) / 100 })}
                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Min Holders */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Min Holders</label>
                    <span className="text-[10px] font-bold text-slate-200 bg-slate-700 px-1.5 py-0.5 rounded">
                      {localSettings.minHolders}+
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="500"
                    step="10"
                    value={localSettings.minHolders}
                    onChange={(e) => updateLocal({ minHolders: parseInt(e.target.value) })}
                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Min Market Cap */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Min MCap</label>
                    <span className="text-[10px] font-bold text-slate-200 bg-slate-700 px-1.5 py-0.5 rounded">
                      {localSettings.minMarketCap >= 1000000 
                        ? `$${(localSettings.minMarketCap / 1000000).toFixed(1)}M`
                        : localSettings.minMarketCap >= 1000
                          ? `$${(localSettings.minMarketCap / 1000).toFixed(0)}K`
                          : `$${localSettings.minMarketCap}`
                      }
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1000000"
                    step="5000"
                    value={localSettings.minMarketCap || 0}
                    onChange={(e) => updateLocal({ minMarketCap: parseInt(e.target.value) })}
                    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>

                {/* Risk Toggles */}
                <div className="space-y-2 pt-3 border-t border-slate-800">
                  <Toggle label="Hide Wash Trading" checked={localSettings.hideWashTrading} onChange={(c) => updateLocal({ hideWashTrading: c })} />
                  <Toggle label="Hide Airdrops" checked={localSettings.hideAirdropSchemes} onChange={(c) => updateLocal({ hideAirdropSchemes: c })} />
                  <Toggle label="Hide Volume Bots" checked={localSettings.hideVolumeBots} onChange={(c) => updateLocal({ hideVolumeBots: c })} />
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-3 border-t border-slate-800 bg-slate-900/50 flex gap-2">
              <button
                onClick={onToggle}
                className="flex-1 py-2 px-3 rounded-lg font-medium text-xs text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={applyFilters}
                disabled={!hasChanges}
                className={clsx(
                  "flex-1 py-2 px-3 rounded-lg font-semibold text-xs transition-all duration-200 flex items-center justify-center gap-1.5",
                  hasChanges
                    ? "bg-blue-600 text-white hover:bg-blue-500"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                )}
              >
                <Check className="w-3.5 h-3.5" />
                Apply
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function Toggle({ label, checked, onChange, highlight }: { label: string, checked: boolean, onChange: (checked: boolean) => void, highlight?: boolean }) {
  return (
    <label className="flex cursor-pointer items-center justify-between group select-none">
      <span className={clsx(
        "text-xs transition-colors",
        highlight ? "font-medium text-white" : "text-slate-400 group-hover:text-slate-300"
      )}>
        {label}
      </span>
      <div className="relative">
        <input type="checkbox" className="sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <div className={clsx(
          "block w-8 h-5 rounded-full transition-colors duration-200",
          checked ? "bg-blue-600" : "bg-slate-700 group-hover:bg-slate-600"
        )}></div>
        <div className={clsx(
          "absolute left-0.5 top-0.5 bg-white w-4 h-4 rounded-full transition-transform duration-200",
          checked ? "translate-x-3" : "translate-x-0"
        )}></div>
      </div>
    </label>
  );
}
