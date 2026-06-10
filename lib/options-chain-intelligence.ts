// Options Chain Intelligence Engine — Phase 8
// Analyzes NSE option chain data to extract institutional sentiment signals:
// Put-Call Ratio, Max Pain, IV Rank, OI-based support/resistance levels.

export interface OptionsChainData {
  symbol: string;
  expiry: string;
  spotPrice: number;
  putCallRatio: number;          // PCR by OI: > 1.5 bearish, < 0.7 bullish
  putCallRatioVolume: number;    // PCR by volume
  maxPain: number;               // Price where max options expire worthless
  maxPainDistance: number;       // % distance from spot to max pain
  ivRank: number;                // 0-100 (current IV vs 52-week range)
  ivPercentile: number;          // % of past days with lower IV
  callOITotal: number;
  putOITotal: number;
  // Key levels from OI concentration
  highCallOIStrikes: number[];   // Resistance levels (high call OI)
  highPutOIStrikes: number[];    // Support levels (high put OI)
  nearestResistance: number;
  nearestSupport: number;
  // IV skew
  ivSkew: number;                // Put IV - Call IV (positive = fear/bearish)
  // Composite signal
  signal: 'VERY_BULLISH' | 'BULLISH' | 'NEUTRAL' | 'BEARISH' | 'VERY_BEARISH';
  signalScore: number;           // 0-100 (50=neutral)
  description: string;
  timestamp: number;
}

export interface OptionsStrikeData {
  strike: number;
  callOI: number;
  putOI: number;
  callOIChange: number;
  putOIChange: number;
  callIV: number;
  putIV: number;
  callVolume: number;
  putVolume: number;
}

/**
 * Parse NSE option chain API response into structured strike data
 */
export function parseOptionChain(rawData: any, spotPrice: number): OptionsStrikeData[] {
  if (!rawData) return [];

  // Handle NSE API format
  const records = rawData?.records?.data ?? rawData?.filtered?.data ?? rawData?.data ?? [];
  if (!records?.length) return [];

  const strikes: OptionsStrikeData[] = [];

  for (const row of records) {
    const strike = row?.strikePrice ?? row?.strike_price ?? 0;
    if (!strike) continue;

    // CE = Call, PE = Put
    const ce = row?.CE ?? {};
    const pe = row?.PE ?? {};

    strikes.push({
      strike,
      callOI: ce?.openInterest ?? ce?.oi ?? 0,
      putOI: pe?.openInterest ?? pe?.oi ?? 0,
      callOIChange: ce?.changeinOpenInterest ?? ce?.oiChange ?? 0,
      putOIChange: pe?.changeinOpenInterest ?? pe?.oiChange ?? 0,
      callIV: ce?.impliedVolatility ?? ce?.iv ?? 0,
      putIV: pe?.impliedVolatility ?? pe?.iv ?? 0,
      callVolume: ce?.totalTradedVolume ?? ce?.volume ?? 0,
      putVolume: pe?.totalTradedVolume ?? pe?.volume ?? 0,
    });
  }

  return strikes.sort((a, b) => a.strike - b.strike);
}

/**
 * Calculate Put-Call Ratio by Open Interest
 */
export function calculatePCR(strikes: OptionsStrikeData[]): {
  pcrOI: number;
  pcrVolume: number;
  totalCallOI: number;
  totalPutOI: number;
} {
  const totalCallOI = strikes.reduce((s, r) => s + r.callOI, 0);
  const totalPutOI = strikes.reduce((s, r) => s + r.putOI, 0);
  const totalCallVol = strikes.reduce((s, r) => s + r.callVolume, 0);
  const totalPutVol = strikes.reduce((s, r) => s + r.putVolume, 0);

  return {
    pcrOI: totalCallOI > 0 ? totalPutOI / totalCallOI : 1,
    pcrVolume: totalCallVol > 0 ? totalPutVol / totalCallVol : 1,
    totalCallOI,
    totalPutOI,
  };
}

/**
 * Calculate Max Pain — the strike price where total option premium loss is minimized for buyers
 */
export function calculateMaxPain(strikes: OptionsStrikeData[]): number {
  let minLoss = Infinity;
  let maxPainStrike = strikes[Math.floor(strikes.length / 2)]?.strike ?? 0;

  for (const { strike: testStrike } of strikes) {
    let totalLoss = 0;

    for (const { strike, callOI, putOI } of strikes) {
      // Call buyers lose if expiry > strike (calls expire OTM)
      if (testStrike < strike) totalLoss += callOI * (strike - testStrike);
      // Put buyers lose if expiry < strike (puts expire OTM)
      if (testStrike > strike) totalLoss += putOI * (testStrike - strike);
    }

    if (totalLoss < minLoss) {
      minLoss = totalLoss;
      maxPainStrike = testStrike;
    }
  }

  return maxPainStrike;
}

/**
 * Extract high OI strikes as support/resistance levels
 */
export function extractKeyLevels(
  strikes: OptionsStrikeData[],
  spotPrice: number,
  topN: number = 5
): { callWalls: number[]; putWalls: number[] } {
  // Sort strikes by OI (descending) to find walls
  const callWalls = [...strikes]
    .filter(s => s.strike > spotPrice * 0.9) // Near-the-money and above
    .sort((a, b) => b.callOI - a.callOI)
    .slice(0, topN)
    .map(s => s.strike)
    .sort((a, b) => a - b);

  const putWalls = [...strikes]
    .filter(s => s.strike < spotPrice * 1.1) // Near-the-money and below
    .sort((a, b) => b.putOI - a.putOI)
    .slice(0, topN)
    .map(s => s.strike)
    .sort((a, b) => a - b);

  return { callWalls, putWalls };
}

/**
 * Calculate IV skew (Put IV - Call IV at equivalent strikes)
 */
export function calculateIVSkew(strikes: OptionsStrikeData[], spotPrice: number): number {
  const atm = strikes.reduce((best, s) =>
    Math.abs(s.strike - spotPrice) < Math.abs(best.strike - spotPrice) ? s : best
  );

  const otmPut = strikes.find(s => s.strike < spotPrice * 0.97);
  const otmCall = strikes.find(s => s.strike > spotPrice * 1.03);

  const putIV = otmPut?.putIV ?? atm?.putIV ?? 0;
  const callIV = otmCall?.callIV ?? atm?.callIV ?? 0;

  return putIV - callIV; // Positive = puts more expensive = fear/bearish skew
}

/**
 * Compute composite options intelligence for a symbol
 */
export function analyzeOptionsChain(
  symbol: string,
  rawData: any,
  spotPrice: number,
  expiry: string = ''
): OptionsChainData {
  const strikes = parseOptionChain(rawData, spotPrice);

  if (!strikes.length) {
    return createNeutralOptions(symbol, spotPrice, expiry);
  }

  const { pcrOI, pcrVolume, totalCallOI, totalPutOI } = calculatePCR(strikes);
  const maxPain = calculateMaxPain(strikes);
  const maxPainDistance = spotPrice > 0 ? ((maxPain - spotPrice) / spotPrice) * 100 : 0;
  const { callWalls, putWalls } = extractKeyLevels(strikes, spotPrice);
  const ivSkew = calculateIVSkew(strikes, spotPrice);

  // IV Rank (simplified — use skew and ATM IV as proxy)
  const atmStrike = strikes.reduce((best, s) =>
    Math.abs(s.strike - spotPrice) < Math.abs(best.strike - spotPrice) ? s : best
  );
  const atmIV = ((atmStrike?.callIV ?? 0) + (atmStrike?.putIV ?? 0)) / 2;
  const ivRank = Math.min(100, atmIV * 2); // Approximate rank

  // Nearest support and resistance
  const nearestResistance = callWalls.find(s => s > spotPrice) ?? spotPrice * 1.02;
  const nearestSupport = [...putWalls].reverse().find(s => s < spotPrice) ?? spotPrice * 0.98;

  // Composite signal score
  let signalScore = 50;

  // PCR signal: < 0.7 bullish, > 1.5 bearish
  if (pcrOI < 0.7) signalScore += 20;
  else if (pcrOI < 1.0) signalScore += 10;
  else if (pcrOI > 1.5) signalScore -= 20;
  else if (pcrOI > 1.2) signalScore -= 10;

  // Max pain: if spot is below max pain, price tends to move up (and vice versa)
  if (maxPainDistance > 1) signalScore += 10;
  else if (maxPainDistance < -1) signalScore -= 10;

  // IV skew: high positive skew = fear = bearish
  if (ivSkew > 5) signalScore -= 10;
  else if (ivSkew < -3) signalScore += 8;

  signalScore = Math.min(100, Math.max(0, signalScore));

  let signal: OptionsChainData['signal'];
  if (signalScore >= 75) signal = 'VERY_BULLISH';
  else if (signalScore >= 60) signal = 'BULLISH';
  else if (signalScore >= 40) signal = 'NEUTRAL';
  else if (signalScore >= 25) signal = 'BEARISH';
  else signal = 'VERY_BEARISH';

  const description = [
    `PCR: ${pcrOI.toFixed(2)} (${pcrOI < 0.7 ? 'Bullish' : pcrOI > 1.5 ? 'Bearish' : 'Neutral'})`,
    `Max Pain: ₹${maxPain.toFixed(0)} (${maxPainDistance > 0 ? '+' : ''}${maxPainDistance.toFixed(1)}%)`,
    `Resistance: ₹${nearestResistance.toFixed(0)} | Support: ₹${nearestSupport.toFixed(0)}`,
    `IV Skew: ${ivSkew.toFixed(1)}`,
  ].join(' | ');

  return {
    symbol, expiry, spotPrice,
    putCallRatio: Math.round(pcrOI * 100) / 100,
    putCallRatioVolume: Math.round(pcrVolume * 100) / 100,
    maxPain,
    maxPainDistance: Math.round(maxPainDistance * 100) / 100,
    ivRank,
    ivPercentile: ivRank,
    callOITotal: totalCallOI,
    putOITotal: totalPutOI,
    highCallOIStrikes: callWalls,
    highPutOIStrikes: putWalls,
    nearestResistance,
    nearestSupport,
    ivSkew: Math.round(ivSkew * 10) / 10,
    signal,
    signalScore: Math.round(signalScore),
    description,
    timestamp: Date.now(),
  };
}

function createNeutralOptions(symbol: string, spotPrice: number, expiry: string): OptionsChainData {
  return {
    symbol, expiry, spotPrice,
    putCallRatio: 1, putCallRatioVolume: 1,
    maxPain: spotPrice, maxPainDistance: 0,
    ivRank: 50, ivPercentile: 50,
    callOITotal: 0, putOITotal: 0,
    highCallOIStrikes: [], highPutOIStrikes: [],
    nearestResistance: spotPrice * 1.02,
    nearestSupport: spotPrice * 0.98,
    ivSkew: 0,
    signal: 'NEUTRAL', signalScore: 50,
    description: 'Option chain data unavailable',
    timestamp: Date.now(),
  };
}
