// Token Metadata
export interface TokenMetadata {
  name: string;
  symbol: string;
  description: string;
  creator: string;
  image: string;
  decimals: number;
  supply: string;
  twitter?: string;
  telegram?: string;
  website?: string;
}

// Price and Trading Data
export interface PriceData {
  price: number;
  volume24h: number;
  marketCap: number;
  liquidity: number;
  trades24h: number;
  priceChange24h: number;
}

// Holder Information
export interface Holder {
  address: string;
  amount: number;
  percentage: number;
}

// Transaction Types
export type TransactionType = 'BUY' | 'SELL' | 'TRANSFER' | 'SWAP';

export interface Transaction {
  signature: string;
  timestamp: number;
  type: TransactionType;
  source: string;
  feePayer: string;
  amount: number;
  toUserAccount?: string;
  fromUserAccount?: string;
}

// Token Statistics
export interface TokenStatistics {
  holderCount: number;
  uniqueTraders: number;
  top10Concentration: number;
  devHoldings: number;
}

// Filter Check Result
export interface FilterCheckResult {
  penalty: number;
  flags: string[];
  maxScore?: number;
}

// Analysis Breakdown
export interface AnalysisBreakdown {
  washTrading: FilterCheckResult;
  holders: FilterCheckResult;
  developer: FilterCheckResult;
  volume: FilterCheckResult;
  airdrops: FilterCheckResult;
  social: FilterCheckResult;
}

// Analysis Result
export interface AnalysisResult {
  passed: boolean;
  score: number;
  flags: string[];
  breakdown: AnalysisBreakdown;
}

// Complete Token Analysis
export interface TokenAnalysis {
  address: string;
  metadata: TokenMetadata;
  priceData: PriceData;
  holders: Holder[];
  transactions: Transaction[];
  statistics: TokenStatistics;
  analysis: AnalysisResult;
  migrationTimestamp: number;
  analyzedAt: number;
}

// Migration Event from PumpPortal
export interface MigrationEvent {
  txType: 'migration';
  signature: string;
  mint: string;
  name?: string;
  symbol?: string;
  uri?: string;
  pool?: string;
  timestamp: number;
  marketCap?: number;
  liquidity?: number;
  creator?: string;
}

// Filter Settings
export interface FilterSettings {
  minScore: number;
  maxDevHoldings: number;
  minHolders: number;
  hideWashTrading: boolean;
  hideAirdropSchemes: boolean;
  hideVolumeBots: boolean;
  showAll: boolean;
}

// Stats for Dashboard
export interface MonitorStats {
  monitored: number;
  passed: number;
  filtered: number;
}

// Risk Level
export type RiskLevel = 'SAFE' | 'MODERATE' | 'HIGH_RISK';

export function getRiskLevel(score: number): RiskLevel {
  if (score >= 80) return 'SAFE';
  if (score >= 60) return 'MODERATE';
  return 'HIGH_RISK';
}

export function getRiskColor(score: number): string {
  if (score >= 80) return 'green';
  if (score >= 60) return 'yellow';
  return 'red';
}
