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
  volume1h?: number;
  volume5m?: number;
  volumeH1?: number;
  marketCap: number;
  marketCapSource?: string;
  marketCapConfidence?: 'high' | 'medium' | 'low';
  liquidity: number;
  trades24h: number;
  buys24h: number;
  sells24h: number;
  buys1h?: number;
  sells1h?: number;
  buysH1?: number;
  sellsH1?: number;
  buys5m?: number;
  sells5m?: number;
  priceChange24h: number;
  priceChange1h?: number;
  priceChangeH1?: number;
  priceChange5m?: number;
  pairCreatedAt?: number;
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

// Token Security Info
export interface TokenSecurity {
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
  lpLocked: boolean;
  lpLockPercentage: number;
  lpLockDuration: number; // days
  isRugpullRisk: boolean;
  topHoldersAreContracts: boolean;
}

// Sniper/Bundle Detection
export interface LaunchAnalysis {
  bundledBuys: number; // buys in same block as creation
  sniperCount: number; // wallets that bought in first few blocks
  firstBuyerHoldings: number; // % held by first N buyers
  avgFirstBuySize: number;
  creatorBoughtBack: boolean;
}

// Token Statistics
export interface TokenStatistics {
  holderCount: number;
  uniqueTraders: number;
  top10Concentration: number;
  devHoldings: number;
  tokenAge?: number; // hours since creation
  buyPressure?: number; // ratio of buys to total txs
  liquidityRatio?: number; // liquidity / marketCap
  volumeToLiquidityRatio?: number; // volume24h / liquidity
  // Extended statistics
  buySellRatio?: number;
  liquidityToMcapRatio?: number;
  volumeToMcapRatio?: number;
  avgTradeSize?: number;
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
  tokenAge: FilterCheckResult;
  buyPressure: FilterCheckResult;
  liquidity: FilterCheckResult;
  security: FilterCheckResult;
  snipers: FilterCheckResult;
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
  security: TokenSecurity;
  launchAnalysis: LaunchAnalysis;
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

// Sort Options
export type SortOption = 'migration' | 'marketCap' | 'volume' | 'score' | 'holders' | 'liquidity';
export type SortDirection = 'asc' | 'desc';

// Filter Settings
export interface FilterSettings {
  minScore: number;
  maxDevHoldings: number;
  minHolders: number;
  minMarketCap: number;
  hideWashTrading: boolean;
  hideAirdropSchemes: boolean;
  hideVolumeBots: boolean;
  showAll: boolean;
  sortBy: SortOption;
  sortDirection: SortDirection;
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
