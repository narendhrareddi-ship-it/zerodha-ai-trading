import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export interface DashboardData {
  botStatus: string;
  dailyPnl: number;
  openPositions: number;
  totalTrades: number;
  winRate: number;
  capital: number;
  maxDailyLoss: number;
  maxPositions: number;
  strategies: StrategyStatus[];
  positions: PositionData[];
  recentTrades: TradeData[];
  logs: LogEntry[];
  pnlHistory: PnlDataPoint[];
}

export interface StrategyStatus {
  name: string;
  enabled: boolean;
  signals: number;
  trades: number;
}

export interface PositionData {
  id: string;
  symbol: string;
  direction: string;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  pnl: number;
  stopLoss: number;
  target: number;
  strategy: string;
  entryTime: string;
}

export interface TradeData {
  id: string;
  symbol: string;
  direction: string;
  quantity: number;
  entryPrice: number;
  exitPrice: number | null;
  pnl: number | null;
  status: string;
  strategy: string;
  entryTime: string;
  exitTime: string | null;
}

export interface LogEntry {
  id: string;
  level: string;
  source: string;
  message: string;
  createdAt: string;
}

export interface PnlDataPoint {
  date: string;
  pnl: number;
  trades: number;
}
