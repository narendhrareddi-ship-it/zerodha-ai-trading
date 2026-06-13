// Fyers API v3 Client - Direct broker integration
// Docs: https://myapi.fyers.in/docsv3
// Free execution API + ₹0 subscription for personal use

const FYERS_BASE = 'https://api-t1.fyers.in/api/v3';
const FYERS_DATA_BASE = 'https://api-t1.fyers.in/data';

export interface FyersConfig {
  appId: string;       // client_id from Fyers API Dashboard
  accessToken: string; // access token obtained after OAuth
}

export interface FyersOrder {
  symbol: string;        // e.g., 'NSE:RELIANCE-EQ'
  qty: number;
  type: 1 | 2 | 3 | 4;  // 1=Limit, 2=Market, 3=SL, 4=SL-M
  side: 1 | -1;          // 1=Buy, -1=Sell
  productType: 'INTRADAY' | 'CNC' | 'MARGIN' | 'CO' | 'BO';
  limitPrice?: number;
  stopPrice?: number;
  validity?: 'DAY' | 'IOC';
  offlineOrder?: boolean;
}

export class FyersClient {
  private appId: string;
  private token: string;

  constructor(config: FyersConfig) {
    this.appId = config.appId;
    this.token = config.accessToken;
  }

  private get authHeader(): string {
    return `${this.appId}:${this.token}`;
  }

  private async request(url: string, method: string = 'GET', body?: any): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': this.authHeader,
    };

    const options: RequestInit = { method, headers };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(3000), // 3-second timeout
    });
    if (!response?.ok) {
      const text = await response?.text?.().catch(() => 'Fyers API error');
      throw new Error(`Fyers API error (${response?.status}): ${text}`);
    }
    return response.json();
  }

  // Profile & Funds
  async getProfile(): Promise<any> {
    return this.request(`${FYERS_BASE}/profile`);
  }

  async getFunds(): Promise<any> {
    return this.request(`${FYERS_BASE}/funds`);
  }

  // Order Management
  async placeOrder(order: FyersOrder): Promise<any> {
    return this.request(`${FYERS_BASE}/orders/sync`, 'POST', {
      symbol: order.symbol,
      qty: order.qty,
      type: order.type,
      side: order.side,
      productType: order.productType,
      limitPrice: order.limitPrice ?? 0,
      stopPrice: order.stopPrice ?? 0,
      validity: order.validity ?? 'DAY',
      disclosedQty: 0,
      offlineOrder: order.offlineOrder ?? false,
    });
  }

  async modifyOrder(orderId: string, updates: Partial<FyersOrder>): Promise<any> {
    return this.request(`${FYERS_BASE}/orders/${orderId}`, 'PATCH', updates);
  }

  async cancelOrder(orderId: string): Promise<any> {
    return this.request(`${FYERS_BASE}/orders/${orderId}`, 'DELETE');
  }

  async getOrders(): Promise<any> {
    return this.request(`${FYERS_BASE}/orders`);
  }

  // Positions & Holdings
  async getPositions(): Promise<any> {
    return this.request(`${FYERS_BASE}/positions`);
  }

  async getHoldings(): Promise<any> {
    return this.request(`${FYERS_BASE}/holdings`);
  }

  // Market Data
  async getQuotes(symbols: string[]): Promise<any> {
    const symbolStr = symbols.join(',');
    return this.request(`${FYERS_DATA_BASE}/quotes/?symbols=${encodeURIComponent(symbolStr)}`);
  }

  async getMarketDepth(symbol: string): Promise<any> {
    return this.request(`${FYERS_DATA_BASE}/depth/?symbol=${encodeURIComponent(symbol)}&ohlcv_flag=1`);
  }

  async getHistoricalData(symbol: string, resolution: string, from: number, to: number): Promise<any> {
    return this.request(
      `${FYERS_DATA_BASE}/history/?symbol=${encodeURIComponent(symbol)}&resolution=${resolution}&date_format=1&range_from=${from}&range_to=${to}&cont_flag=1`
    );
  }

  // Exit all positions
  async exitAllPositions(): Promise<any> {
    return this.request(`${FYERS_BASE}/positions`, 'DELETE');
  }

  // Trade book
  async getTradeBook(): Promise<any> {
    return this.request(`${FYERS_BASE}/tradebook`);
  }

  // Convert Zerodha-style symbol to Fyers format
  static formatSymbol(symbol: string, exchange: string = 'NSE'): string {
    // Convert "NSE:RELIANCE" → "NSE:RELIANCE-EQ"
    const cleanSymbol = symbol.replace(/^NSE:/, '').replace(/^BSE:/, '');
    return `${exchange}:${cleanSymbol}-EQ`;
  }
}

// Generate Fyers login URL for OAuth
export function getFyersLoginUrl(appId: string, redirectUri: string): string {
  return `https://api-t1.fyers.in/api/v3/generate-authcode?client_id=${appId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=zerodhaai`;
}
