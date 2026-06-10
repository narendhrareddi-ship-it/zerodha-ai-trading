// Strategy Ensemble Voting System
// Only executes trades when multiple strategies agree on direction
// Dramatically reduces false signals and improves win rate

import { TradeSignal } from './trading-engine';

export interface VotingResult {
  symbol: string;
  direction: 'BUY' | 'SELL';
  strategies: string[];
  avgConfidence: number;
  voteCount: number;
  totalStrategies: number;
  consensus: boolean;
  bestSignal: TradeSignal;
}

/**
 * Aggregate signals by symbol+direction and require minimum consensus
 * @param signals All raw signals from individual strategies
 * @param minVotes Minimum strategies that must agree (default: 2)
 * @returns Filtered signals with consensus only
 */
export function ensembleVote(
  signals: TradeSignal[],
  minVotes: number = 2
): VotingResult[] {
  if (!signals?.length) return [];

  // Group signals by symbol + direction
  const groups: Record<string, TradeSignal[]> = {};
  for (const sig of signals) {
    const key = `${sig.symbol}:${sig.direction}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(sig);
  }

  const results: VotingResult[] = [];

  for (const [key, groupSignals] of Object.entries(groups)) {
    const [symbol, direction] = key.split(':');
    const uniqueStrategies = [...new Set(groupSignals.map(s => s.strategy))];
    const voteCount = uniqueStrategies.length;

    if (voteCount < minVotes) continue;

    // Average confidence weighted by strategy count
    const avgConfidence = groupSignals.reduce((s, g) => s + (g?.confidence ?? 0), 0) / groupSignals.length;

    // Pick the best signal (highest confidence) as the base
    const bestSignal = groupSignals.sort((a, b) => (b?.confidence ?? 0) - (a?.confidence ?? 0))[0];

    // Boost confidence based on consensus strength
    const consensusBoost = Math.min(15, (voteCount - 1) * 5);
    const boostedConfidence = Math.min(98, avgConfidence + consensusBoost);

    results.push({
      symbol: symbol ?? '',
      direction: (direction as 'BUY' | 'SELL') ?? 'BUY',
      strategies: uniqueStrategies,
      avgConfidence: Math.round(boostedConfidence * 10) / 10,
      voteCount,
      totalStrategies: 8,
      consensus: true,
      bestSignal: {
        ...bestSignal,
        confidence: boostedConfidence,
        reason: `[${voteCount} strategies agree] ${bestSignal.reason}`,
      },
    });
  }

  // Sort by vote count then confidence
  return results.sort((a, b) => {
    if (b.voteCount !== a.voteCount) return b.voteCount - a.voteCount;
    return b.avgConfidence - a.avgConfidence;
  });
}

/**
 * Convert voting results back to TradeSignals for execution
 */
export function votingResultsToSignals(results: VotingResult[]): TradeSignal[] {
  return results.map(r => ({
    ...r.bestSignal,
    reason: `[Consensus: ${r.voteCount}/${r.totalStrategies} strategies] ${r.strategies.join(', ')} → ${r.bestSignal.reason}`,
  }));
}
