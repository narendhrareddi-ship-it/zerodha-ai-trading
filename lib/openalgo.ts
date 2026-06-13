// OpenAlgo Broker Bridge - Universal Indian broker integration
// Supports: Zerodha, AngelOne, Dhan, Fyers, Upstox, Shoonya, and 30+ more
// Docs: https://docs.openalgo.in/api-documentation/v1

export interface OpenAlgoConfig {
  apiKey: string;
  host: string;
}

export interface OpenAlgoOrder {
  symbol: string;
  exchange: string;
  action: 'BUY' | 'SELL';
  quantity: number;
  pricetype: 'MARKET' | 'LIMIT' | 'SL' | 'SL-M';
  product: 'MIS' | 'CNC' | 'NRML';
  price?: number;
  trigger_price?: number;
  strategy?: string;
}

export class OpenAlgoClient {
  private apiKey: string;
  private host: string;

  constructor(config: OpenAlgoConfig) {
    this.apiKey = config.apiKey;
    this.host = config.host?.replace?.(/\/$/, '') ?? 'http://127.0.0.1:5000';
  }

  private async request(path: string, method: string = 'GET', body?: any): Promise<any> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    const options: RequestInit = { method, headers };
    if (body && method !== 'GET') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.host}${path}`, options);
    if (!response?.ok) {
      const errorText = await response?.text?.().catch(() => 'API error');
      throw new Error(`OpenAlgo API error (${response?.status}): ${errorText}`);
    }
    return response.json();
  }

  // Order Management
  async placeOrder(order: OpenAlgoOrder): Promise<any> {
    return this.request('/api/v1/placeorder', 'POST', {
      apikey: this.apiKey,
      strategy: order.strategy ?? 'HERMES',
      symbol: order.symbol,
      exchange: order.exchange,
      action: order.action,
      quantity: order.quantity,
      pricetype: order.pricetype,
      product: order.product,
      price: order.price?.toString() ?? '0',
      trigger_price: order.trigger_price?.toString() ?? '0',
    });
  }

  async placeSmartOrder(order: OpenAlgoOrder & { position_size: number }): Promise<any> {
    return this.request('/api/v1/placesmartorder', 'POST', {
      apikey: this.apiKey,
      strategy: order.strategy ?? 'HERMES',
      symbol: order.symbol,
      exchange: order.exchange,
      action: order.action,
      quantity: order.quantity,
      position_size: order.position_size,
      pricetype: order.pricetype,
      product: order.product,
      price: order.price?.toString() ?? '0',
      trigger_price: order.trigger_price?.toString() ?? '0',
    });
  }

  async cancelOrder(orderId: string, strategy?: string): Promise<any> {
    return this.request('/api/v1/cancelorder', 'POST', {
      apikey: this.apiKey,
      strategy: strategy ?? 'HERMES',
      orderid: orderId,
    });
  }

  async cancelAllOrders(strategy?: string): Promise<any> {
    return this.request('/api/v1/cancelallorder', 'POST', {
      apikey: this.apiKey,
      strategy: strategy ?? 'HERMES',
    });
  }

  async closePosition(symbol: string, exchange: string, product: string): Promise<any> {
    return this.request('/api/v1/closeposition', 'POST', {
      apikey: this.apiKey,
      strategy: 'HERMES',
      symbol,
      exchange,
      product,
    });
  }

  // Account & Portfolio
  async getOrderBook(): Promise<any> {
    return this.request('/api/v1/orderbook', 'POST', { apikey: this.apiKey });
  }

  async getTradeBook(): Promise<any> {
    return this.request('/api/v1/tradebook', 'POST', { apikey: this.apiKey });
  }

  async getPositionBook(): Promise<any> {
    return this.request('/api/v1/positionbook', 'POST', { apikey: this.apiKey });
  }

  async getHoldings(): Promise<any> {
    return this.request('/api/v1/holdings', 'POST', { apikey: this.apiKey });
  }

  async getFunds(): Promise<any> {
    return this.request('/api/v1/funds', 'POST', { apikey: this.apiKey });
  }

  // Market Data
  async getQuotes(symbol: string, exchange: string): Promise<any> {
    return this.request('/api/v1/quotes', 'POST', {
      apikey: this.apiKey,
      symbol,
      exchange,
    });
  }

  async getHistory(symbol: string, exchange: string, interval: string, start: string, end: string): Promise<any> {
    return this.request('/api/v1/history', 'POST', {
      apikey: this.apiKey,
      symbol,
      exchange,
      interval,
      start,
      end,
    });
  }

  async getDepth(symbol: string, exchange: string): Promise<any> {
    return this.request('/api/v1/depth', 'POST', {
      apikey: this.apiKey,
      symbol,
      exchange,
    });
  }
}

// Supported brokers list for UI display
export const SUPPORTED_BROKERS = [
  { id: 'zerodha', name: 'Zerodha', logo: '🟢' },
  { id: 'angelone', name: 'Angel One', logo: '🔵' },
  { id: 'dhan', name: 'Dhan', logo: '🟣' },
  { id: 'fyers', name: 'Fyers', logo: '🟡' },
  { id: 'upstox', name: 'Upstox', logo: '🔴' },
  { id: 'shoonya', name: 'Shoonya (Finvasia)', logo: '🟠' },
  { id: '5paisa', name: '5Paisa', logo: '⚪' },
  { id: 'aliceblue', name: 'AliceBlue', logo: '🔷' },
  { id: 'icici', name: 'ICICI Direct', logo: '🟤' },
  { id: 'kotak', name: 'Kotak Securities', logo: '🔶' },
];
