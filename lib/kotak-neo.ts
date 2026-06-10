// Kotak Neo Trade API v2 Client - Direct broker integration
// Docs: https://github.com/Kotak-Neo/Kotak-neo-api-v2
// Free API access + zero brokerage on API orders

const NEO_BASE = 'https://gw-napi.kotaksecurities.com';

export interface KotakNeoConfig {
  consumerKey: string;
  accessToken: string;  // session token obtained after TOTP login
  sessionToken?: string;
}

export interface KotakNeoOrder {
  symbol: string;
  exchange: 'nse_cm' | 'bse_cm' | 'nse_fo' | 'bse_fo' | 'mcx_fo';
  transactionType: 'B' | 'S';  // Buy or Sell
  orderType: 'L' | 'MKT' | 'SL' | 'SL-M';
  quantity: number;
  price?: number;
  triggerPrice?: number;
  product: 'NRML' | 'CNC' | 'MIS' | 'CO' | 'BO';
  validity?: 'DAY' | 'IOC' | 'GTC';
}

export class KotakNeoClient {
  private consumerKey: string;
  private token: string;
  private sessionToken: string;

  constructor(config: KotakNeoConfig) {
    this.consumerKey = config.consumerKey;
    this.token = config.accessToken;
    this.sessionToken = config.sessionToken ?? '';
  }

  private async request(path: string, method: string = 'GET', body?: any): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
      'consumerKey': this.consumerKey,
      'Sid': this.sessionToken,
      'Auth': this.token,
    };

    const options: RequestInit = { method, headers };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${NEO_BASE}${path}`, options);
    if (!response?.ok) {
      const text = await response?.text?.().catch(() => 'Kotak API error');
      throw new Error(`Kotak Neo API error (${response?.status}): ${text}`);
    }
    return response.json();
  }

  // Order Management
  async placeOrder(order: KotakNeoOrder): Promise<any> {
    return this.request('/Orders/2.0/quick/order/rule/ms/place', 'POST', {
      es: order.exchange,
      ts: order.symbol,
      tt: order.transactionType,
      ot: order.orderType,
      qt: order.quantity.toString(),
      pr: (order.price ?? 0).toString(),
      tp: (order.triggerPrice ?? 0).toString(),
      pt: order.product,
      vd: order.validity ?? 'DAY',
      dq: '0',
      mp: '0',
      pc: '0',
      am: 'NO',
    });
  }

  async modifyOrder(orderId: string, updates: Partial<KotakNeoOrder>): Promise<any> {
    return this.request('/Orders/2.0/quick/order/rule/ms/modify', 'POST', {
      no: orderId,
      qt: updates.quantity?.toString(),
      pr: updates.price?.toString() ?? '0',
      tp: updates.triggerPrice?.toString() ?? '0',
      vd: updates.validity ?? 'DAY',
    });
  }

  async cancelOrder(orderId: string): Promise<any> {
    return this.request('/Orders/2.0/quick/order/rule/ms/cancel', 'POST', {
      on: orderId,
    });
  }

  // Order Book & Trade Book
  async getOrderBook(): Promise<any> {
    return this.request('/Orders/2.0/quick/user/orders');
  }

  async getTradeBook(): Promise<any> {
    return this.request('/Orders/2.0/quick/user/trades');
  }

  // Positions & Holdings
  async getPositions(): Promise<any> {
    return this.request('/Orders/2.0/quick/user/positions');
  }

  async getHoldings(): Promise<any> {
    return this.request('/Portfolio/1.0/portfolio/v2/holdings');
  }

  // Funds / Limits
  async getFunds(): Promise<any> {
    return this.request('/Orders/2.0/quick/user/limits');
  }

  // Market Data
  async getQuotes(instrumentTokens: string[]): Promise<any> {
    return this.request('/quotes', 'POST', {
      inst_tokens: instrumentTokens,
    });
  }

  // Convert Zerodha-style symbol to Kotak Neo format
  static formatSymbol(symbol: string): string {
    return symbol.replace(/^NSE:/, '').replace(/^BSE:/, '');
  }
}

// Supported exchange segments for Kotak Neo
export const KOTAK_EXCHANGES = [
  { id: 'nse_cm', name: 'NSE Cash' },
  { id: 'bse_cm', name: 'BSE Cash' },
  { id: 'nse_fo', name: 'NSE F&O' },
  { id: 'bse_fo', name: 'BSE F&O' },
  { id: 'mcx_fo', name: 'MCX Futures' },
];
