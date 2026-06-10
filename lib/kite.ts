// Zerodha Kite Connect API integration
// NOTE: Kite requires daily login via browser for access_token generation.
// The access_token is stored in DB and used for all API calls during the session.

const KITE_BASE_URL = 'https://api.kite.trade';
const KITE_LOGIN_URL = 'https://kite.zerodha.com/connect/login';

export function getKiteLoginUrl(apiKey: string, redirectUrl?: string): string {
  const baseUrl = `${KITE_LOGIN_URL}?v=3&api_key=${apiKey}`;
  if (redirectUrl) {
    return `${baseUrl}&redirect_url=${encodeURIComponent(redirectUrl)}`;
  }
  return baseUrl;
}

export async function generateSession(requestToken: string, apiKey: string, apiSecret: string): Promise<any> {
  const crypto = require('crypto');
  const checksum = crypto
    .createHash('sha256')
    .update(apiKey + requestToken + apiSecret)
    .digest('hex');

  const response = await fetch(`${KITE_BASE_URL}/session/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      api_key: apiKey,
      request_token: requestToken,
      checksum,
    }),
  });

  if (!response?.ok) {
    const errorText = await response?.text?.().catch(() => 'Unknown error');
    throw new Error(`Kite session error: ${errorText}`);
  }
  return response.json();
}

export class KiteClient {
  private apiKey: string;
  private accessToken: string;

  constructor(accessToken: string, apiKey: string) {
    this.apiKey = apiKey;
    this.accessToken = accessToken;
  }

  private async request(path: string, method: string = 'GET', body?: any): Promise<any> {
    const headers: Record<string, string> = {
      'X-Kite-Version': '3',
      'Authorization': `token ${this.apiKey}:${this.accessToken}`,
    };
    const options: RequestInit = { method, headers };

    if (body && method !== 'GET') {
      headers['Content-Type'] = 'application/x-www-form-urlencoded';
      options.body = new URLSearchParams(body);
    }

    const response = await fetch(`${KITE_BASE_URL}${path}`, options);
    if (!response?.ok) {
      const errorText = await response?.text?.().catch(() => 'API error');
      throw new Error(`Kite API error (${response?.status}): ${errorText}`);
    }
    return response.json();
  }

  async getProfile(): Promise<any> {
    return this.request('/user/profile');
  }

  async getMargins(): Promise<any> {
    return this.request('/user/margins');
  }

  async getPositions(): Promise<any> {
    return this.request('/portfolio/positions');
  }

  async getHoldings(): Promise<any> {
    return this.request('/portfolio/holdings');
  }

  async getOrders(): Promise<any> {
    return this.request('/orders');
  }

  async placeOrder(params: {
    exchange: string;
    tradingsymbol: string;
    transaction_type: string;
    quantity: number;
    product: string;
    order_type: string;
    price?: number;
    trigger_price?: number;
    stoploss?: number;
    squareoff?: number;
    tag?: string;
  }): Promise<any> {
    return this.request('/orders/regular', 'POST', {
      ...params,
      quantity: String(params.quantity),
      price: params.price ? String(params.price) : undefined,
      trigger_price: params.trigger_price ? String(params.trigger_price) : undefined,
      validity: 'DAY',
    });
  }

  async cancelOrder(orderId: string): Promise<any> {
    return this.request(`/orders/regular/${orderId}`, 'DELETE');
  }

  async getQuote(instruments: string[]): Promise<any> {
    const query = instruments?.map?.((i: string) => `i=${encodeURIComponent(i)}`)?.join?.('&') ?? '';
    return this.request(`/quote?${query}`);
  }

  async getLTP(instruments: string[]): Promise<any> {
    const query = instruments?.map?.((i: string) => `i=${encodeURIComponent(i)}`)?.join?.('&') ?? '';
    return this.request(`/quote/ltp?${query}`);
  }

  async getOHLC(instruments: string[]): Promise<any> {
    const query = instruments?.map?.((i: string) => `i=${encodeURIComponent(i)}`)?.join?.('&') ?? '';
    return this.request(`/quote/ohlc?${query}`);
  }

  async getHistoricalData(
    instrumentToken: number,
    interval: string,
    from: string,
    to: string
  ): Promise<any> {
    return this.request(
      `/instruments/historical/${instrumentToken}/${interval}?from=${from}&to=${to}`
    );
  }

  async getInstruments(exchange?: string): Promise<any> {
    const path = exchange ? `/instruments/${exchange}` : '/instruments';
    return this.request(path);
  }
}

// Helper: get user's active Kite session using platform-level API credentials
import { prisma } from '@/lib/db';

export function getPlatformKiteCredentials(): { apiKey: string; apiSecret: string } {
  return {
    apiKey: process.env.KITE_API_KEY ?? '',
    apiSecret: process.env.KITE_API_SECRET ?? '',
  };
}

export async function getUserKiteClient(userId: string): Promise<{ client: KiteClient | null; apiKey: string; apiSecret: string }> {
  const { apiKey, apiSecret } = getPlatformKiteCredentials();

  if (!apiKey) {
    return { client: null, apiKey, apiSecret };
  }

  const token = await prisma.kiteToken.findFirst({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: 'desc' },
  });

  if (!token?.accessToken) {
    return { client: null, apiKey, apiSecret };
  }

  return { client: new KiteClient(token.accessToken, apiKey), apiKey, apiSecret };
}

// Watchlist of popular stocks for scanning
export const WATCHLIST_STOCKS = [
  'NSE:RELIANCE', 'NSE:TCS', 'NSE:HDFCBANK', 'NSE:INFY', 'NSE:ICICIBANK',
  'NSE:SBIN', 'NSE:BHARTIARTL', 'NSE:ITC', 'NSE:KOTAKBANK', 'NSE:LT',
  'NSE:AXISBANK', 'NSE:WIPRO', 'NSE:HCLTECH', 'NSE:TATAMOTORS', 'NSE:TATASTEEL',
  'NSE:BAJFINANCE', 'NSE:MARUTI', 'NSE:SUNPHARMA', 'NSE:NTPC', 'NSE:POWERGRID',
  'NSE:M&M', 'NSE:HINDALCO', 'NSE:JSWSTEEL', 'NSE:TECHM', 'NSE:ADANIENT',
];

export const FNO_STOCKS = [
  'NFO:NIFTY', 'NFO:BANKNIFTY', 'NFO:FINNIFTY',
];
