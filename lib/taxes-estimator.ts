// Indian Market Intraday Transaction Cost & Tax Estimator
// Calculates Brokerage, STT, Exchange transaction charges, GST, SEBI fees, and Stamp Duty.

export interface TaxCalculation {
  brokerage: number;
  stt: number;
  exchangeCharges: number;
  gst: number;
  sebiFees: number;
  stampDuty: number;
  totalTaxes: number;
  netPnl: number;
}

/**
 * Calculates detailed intraday equity taxes and transaction costs for NSE.
 */
export function calculateIntradayTaxes(
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  direction: 'BUY' | 'SELL',
  brokerType: 'kite' | 'fyers' | 'kotak' | 'openalgo' = 'kite'
): TaxCalculation {
  const buyPrice = direction === 'BUY' ? entryPrice : exitPrice;
  const sellPrice = direction === 'BUY' ? exitPrice : entryPrice;

  const buyValue = buyPrice * quantity;
  const sellValue = sellPrice * quantity;
  const totalTurnover = buyValue + sellValue;

  // 1. Brokerage: standard min(₹20, 0.03%) per order, Kotak Neo has zero brokerage
  const maxBrokeragePerOrder = 20;
  const brokerageRate = 0.0003; // 0.03%
  
  let buyBrokerage = Math.min(maxBrokeragePerOrder, buyValue * brokerageRate);
  let sellBrokerage = Math.min(maxBrokeragePerOrder, sellValue * brokerageRate);
  
  if (brokerType === 'kotak') {
    buyBrokerage = 0;
    sellBrokerage = 0;
  }
  const brokerage = buyBrokerage + sellBrokerage;

  // 2. STT (Securities Transaction Tax): 0.025% on the SELL side only for intraday equity
  const stt = sellValue * 0.00025;

  // 3. Exchange transaction charges: NSE rate is 0.00322% of turnover
  const exchangeCharges = totalTurnover * 0.0000322;

  // 4. GST: 18% of (brokerage + exchange transaction charges)
  const gst = (brokerage + exchangeCharges) * 0.18;

  // 5. SEBI turnover fee: 0.0001% of turnover (₹0.1 per ₹1,00,000)
  const sebiFees = totalTurnover * 0.000001;

  // 6. Stamp duty: 0.003% of BUY value only for intraday equity (₹300 per crore)
  const stampDuty = buyValue * 0.00003;

  const totalTaxes = brokerage + stt + exchangeCharges + gst + sebiFees + stampDuty;
  
  // Gross profit
  const grossPnl = direction === 'BUY'
    ? (exitPrice - entryPrice) * quantity
    : (entryPrice - exitPrice) * quantity;

  const netPnl = grossPnl - totalTaxes;

  return {
    brokerage: Math.round(brokerage * 100) / 100,
    stt: Math.round(stt * 100) / 100,
    exchangeCharges: Math.round(exchangeCharges * 100) / 100,
    gst: Math.round(gst * 100) / 100,
    sebiFees: Math.round(sebiFees * 100) / 100,
    stampDuty: Math.round(stampDuty * 100) / 100,
    totalTaxes: Math.round(totalTaxes * 100) / 100,
    netPnl: Math.round(netPnl * 100) / 100,
  };
}
