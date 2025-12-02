'use client';

import React from 'react';
import { FilterSettings } from '@/types';
import { Button } from '@/components/common';

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
  return (
    <div className="relative">
      <Button 
        variant={isOpen ? 'primary' : 'secondary'} 
        onClick={onToggle}
        className="flex items-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
        </svg>
        Filters
      </Button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm md:hidden" 
            onClick={onToggle}
          />
          <div className="absolute right-0 top-full mt-2 w-80 z-50 origin-top-right rounded-2xl border border-white/10 bg-[#0f172a]/95 p-6 shadow-xl backdrop-blur-xl animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Filter Tokens</h2>
              <button 
                onClick={onReset}
                className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
              >
                Reset Default
              </button>
            </div>

            <div className="space-y-6">
              {/* Min Score Slider */}
              <div>
                <div className="mb-2 flex justify-between">
                  <label className="text-sm font-medium text-gray-300">Min Score</label>
                  <span className="text-sm font-bold text-blue-400">{settings.minScore}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.minScore}
                  onChange={(e) => onUpdate({ minScore: parseInt(e.target.value) })}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-blue-500"
                />
                <div className="mt-1 flex justify-between text-xs text-gray-500">
                  <span>0</span>
                  <span>100</span>
                </div>
              </div>

              {/* Max Dev Holdings */}
              <div>
                <div className="mb-2 flex justify-between">
                  <label className="text-sm font-medium text-gray-300">Max Dev Holdings</label>
                  <span className="text-sm font-bold text-blue-400">{(settings.maxDevHoldings * 100).toFixed(0)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.maxDevHoldings * 100}
                  onChange={(e) => onUpdate({ maxDevHoldings: parseInt(e.target.value) / 100 })}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-blue-500"
                />
              </div>

              {/* Min Holders */}
              <div>
                <div className="mb-2 flex justify-between">
                  <label className="text-sm font-medium text-gray-300">Min Holders</label>
                  <span className="text-sm font-bold text-blue-400">{settings.minHolders}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="200"
                  value={settings.minHolders}
                  onChange={(e) => onUpdate({ minHolders: parseInt(e.target.value) })}
                  className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-white/10 accent-blue-500"
                />
              </div>

              {/* Toggles */}
              <div className="space-y-3 pt-4 border-t border-white/10">
                <Toggle 
                  label="Hide Wash Trading" 
                  checked={settings.hideWashTrading} 
                  onChange={(c) => onUpdate({ hideWashTrading: c })} 
                />
                <Toggle 
                  label="Hide Airdrop Schemes" 
                  checked={settings.hideAirdropSchemes} 
                  onChange={(c) => onUpdate({ hideAirdropSchemes: c })} 
                />
                <Toggle 
                  label="Hide Volume Bots" 
                  checked={settings.hideVolumeBots} 
                  onChange={(c) => onUpdate({ hideVolumeBots: c })} 
                />
                
                <div className="pt-3 mt-3 border-t border-white/10">
                  <Toggle 
                    label="Show All (No Filtering)" 
                    checked={settings.showAll} 
                    onChange={(c) => onUpdate({ showAll: c })} 
                    highlight
                  />
                </div>
              </div>
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
      <span className={`text-sm transition-colors ${highlight ? 'font-semibold text-white' : 'text-gray-400 group-hover:text-gray-300'}`}>
        {label}
      </span>
      <div className="relative">
        <input
          type="checkbox"
          className="sr-only"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
        />
        <div className={`block w-10 h-6 rounded-full transition-colors duration-200 ${checked ? 'bg-blue-600' : 'bg-white/10 group-hover:bg-white/20'}`}></div>
        <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`}></div>
      </div>
    </label>
  );
}
