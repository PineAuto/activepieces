import { signAsync } from '@noble/ed25519';
import bs58 from 'bs58';

export interface OrderlyAuth {
  accountId: string;
  orderlyKey: string; // Base58-encoded public key (from Orderly dashboard)
  secretKey: string;  // Base58-encoded private key (from Orderly dashboard)
  testnet: boolean;
}

export type OrderlyHeaders = {
  'Content-Type': string;
  'orderly-timestamp': string;
  'orderly-account-id': string;
  'orderly-key': string;  // Format: "ed25519:{base58_public_key}"
  'orderly-signature': string;  // Base64url-encoded Ed25519 signature
} & Record<string, string>;

export interface OrderlyResponse<T> {
  success: boolean;
  data: T;
  timestamp: number;
}

export interface AccountInfo {
  account_id: string;
  leverage: number;
  // Additional fields from Orderly API
}

export interface HoldingInfo {
  total_collateral_value: number;  // Total collateral in USDC
  free_collateral: number;          // Free collateral available
  total_value: number;              // Total account value
  available_balance: number;        // Available balance for trading
  unsettled_pnl: number;           // Unsettled PnL
}

export interface OrderResponse {
  order_id: string;
  client_order_id?: string;
  status: string;
  symbol?: string;
  side?: 'BUY' | 'SELL';
  order_type?: 'MARKET' | 'LIMIT';
  order_price?: number;
  order_quantity?: number;
  // Additional fields from Orderly API
}

export class OrderlyClient {
  private baseUrl: string;
  private auth: OrderlyAuth;
  private privateKeyBytes: Uint8Array;

  constructor(auth: OrderlyAuth) {
    this.auth = auth;
    this.baseUrl = auth.testnet
      ? 'https://testnet-api.orderly.org'
      : 'https://api.orderly.org';

    // Validate secret key before decoding
    if (!auth.secretKey || typeof auth.secretKey !== 'string' || auth.secretKey.trim() === '') {
      throw new Error('Secret Key is required and must be a valid base58-encoded string');
    }

    // Decode base58-encoded private key to Uint8Array (required by @noble/ed25519)
    try {
      this.privateKeyBytes = bs58.decode(auth.secretKey);
    } catch (error) {
      throw new Error('Invalid Secret Key format. Please ensure it is a valid base58-encoded string from Orderly dashboard.');
    }
  }

  // === PRIVATE METHODS ===

  /**
   * Generate Ed25519 signature for Orderly Network API
   * Message format: timestamp + HTTP_METHOD + pathname + search + body
   * Algorithm: Ed25519 signature → base64url encoding
   *
   * CRITICAL: This uses Ed25519 asymmetric cryptography, NOT HMAC-SHA256
   */
  private async generateSignature(
    timestamp: string,
    method: string,
    url: URL,
    body?: string
  ): Promise<string> {
    const encoder = new TextEncoder();

    // Construct message exactly as Orderly expects
    // Format: timestamp + METHOD + pathname + search + body
    let message = `${timestamp}${method}${url.pathname}${url.search}`;
    if (body) {
      message += body;
    }

    // Generate Ed25519 signature using private key
    const signature = await signAsync(encoder.encode(message), this.privateKeyBytes);

    // Encode signature as base64url (NOT standard base64)
    return Buffer.from(signature).toString('base64url');
  }

  /**
   * Build authentication headers for API request
   */
  private async getHeaders(
    method: string,
    endpoint: string,
    body?: any
  ): Promise<OrderlyHeaders> {
    const timestamp = Date.now().toString();
    const bodyString = body ? JSON.stringify(body) : '';

    // Create URL object for pathname and search extraction
    const url = new URL(endpoint, this.baseUrl);
    const signature = await this.generateSignature(timestamp, method, url, bodyString);

    return {
      'Content-Type': 'application/json',
      'orderly-timestamp': timestamp,
      'orderly-account-id': this.auth.accountId,
      'orderly-key': `ed25519:${this.auth.orderlyKey}`,  // Format: "ed25519:{base58_public_key}"
      'orderly-signature': signature,
    };
  }

  /**
   * Generic API request with error handling and retry logic
   *
   * IMPORTANT: This method is now async because getHeaders() uses Ed25519 signing
   */
  private async request<T>(
    method: string,
    endpoint: string,
    body?: any,
    retries = 3
  ): Promise<T> {
    // CHANGED: await getHeaders() because Ed25519 signing is async
    const headers = await this.getHeaders(method, endpoint, body);
    const url = `${this.baseUrl}${endpoint}`;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(10000), // 10s timeout
        });

        // Layer 2 Error Handling: HTTP status codes
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));

          // Handle specific status codes
          if (response.status === 401) {
            throw new Error('Authentication failed. Please check your credentials.');
          }
          if (response.status === 429) {
            // Rate limit - retry with exponential backoff
            if (attempt < retries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt)));
              continue;
            }
            throw new Error('Rate limit exceeded. Please try again later.');
          }
          if (response.status >= 500) {
            // Server error - retry
            if (attempt < retries) {
              await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
              continue;
            }
            throw new Error('Orderly Network server error. Please try again.');
          }

          throw new Error(
            `API Error ${response.status}: ${errorData.message || response.statusText}`
          );
        }

        const data = await response.json();
        return data as T;

      } catch (error: any) {
        // Handle network errors
        if (error.name === 'AbortError') {
          if (attempt < retries) {
            continue;
          }
          throw new Error('Request timeout. Please check your network connection.');
        }

        // Re-throw API errors
        if (attempt >= retries) {
          throw error;
        }
      }
    }

    throw new Error('Maximum retries exceeded');
  }

  // === PUBLIC METHODS ===

  /**
   * Get account information (used for validation)
   */
  async getAccountInfo(): Promise<AccountInfo> {
    return this.request<AccountInfo>('GET', '/v1/client/info');
  }

  /**
   * Get account holding information (balance, collateral, etc.)
   */
  async getHolding(): Promise<any> {
    const response = await this.request<any>('GET', '/v1/client/holding');
    console.log('🔍 Raw holding response:', JSON.stringify(response, null, 2));
    return response;
  }

  /**
   * Place a simple market or limit order
   */
  async placeOrder(orderData: {
    symbol: string;
    side: 'BUY' | 'SELL';
    order_type: 'MARKET' | 'LIMIT';
    order_price?: number;
    order_quantity: number;
    client_order_id?: string;
  }): Promise<OrderResponse> {
    return this.request<OrderResponse>('POST', '/v1/order', orderData);
  }

  /**
   * Place an algo order (TP/SL)
   * Supports individual STOP_LOSS/TAKE_PROFIT orders and composite TP_SL orders
   */
  async placeAlgoOrder(orderData: {
    symbol: string;
    side?: 'BUY' | 'SELL';  // Optional for TP_SL
    algo_type: 'STOP_LOSS' | 'TAKE_PROFIT' | 'TP_SL';  // Added TP_SL support
    trigger_price?: number;  // Optional for TP_SL
    order_quantity?: number;  // Optional for TP_SL
    quantity?: string;  // For TP_SL composite orders
    trigger_price_type?: 'MARK_PRICE';  // For TP_SL composite orders
    child_orders?: Array<{
      symbol: string;
      algo_type: 'TAKE_PROFIT' | 'STOP_LOSS';
      side: 'BUY' | 'SELL';
      type: 'MARKET' | 'LIMIT';
      trigger_price: number;
      reduce_only: boolean;
    }>;
  }): Promise<OrderResponse> {
    return this.request<OrderResponse>('POST', '/v1/algo/order', orderData);
  }

  /**
   * Cancel an order by ID
   */
  async cancelOrder(orderId: string): Promise<{ success: boolean }> {
    return this.request('DELETE', `/v1/order/${orderId}`);
  }

  /**
   * Get current positions
   */
  async getPositions(): Promise<any[]> {
    return this.request('GET', '/v1/positions');
  }

  /**
   * Get order status
   */
  async getOrder(orderId: string): Promise<OrderResponse> {
    return this.request('GET', `/v1/order/${orderId}`);
  }

  /**
   * Set leverage for a trading pair
   * @param symbol - Trading symbol (e.g., 'PERP_BTC_USDC')
   * @param leverage - Leverage multiplier (1-50)
   */
  async setLeverage(symbol: string, leverage: number): Promise<any> {
    return this.request('POST', '/v1/client/leverage', {
      symbol,
      leverage,
    });
  }

  /**
   * Get maximum allowed leverage for a symbol
   * @param symbol - Trading symbol (e.g., 'PERP_BTC_USDC')
   * @returns Object containing max_leverage field
   */
  async getMaxLeverage(symbol: string): Promise<{ max_leverage: number }> {
    return this.request('GET', `/v1/public/info/${symbol}`);
  }

  /**
   * Get symbol configuration including step sizes and limits
   * @param symbol - Trading symbol (e.g., 'PERP_BTC_USDC')
   * @returns Full symbol configuration with base_tick, base_min, base_max, etc.
   */
  async getSymbolInfo(symbol: string): Promise<{
    symbol: string;
    base_tick: number;      // Step size for order quantity
    base_min: number;       // Minimum order quantity
    base_max: number;       // Maximum order quantity
    quote_tick: number;     // Price step size
    min_notional: number;   // Minimum notional value
  }> {
    const response = await this.request<any>('GET', `/v1/public/info/${symbol}`);

    // Handle both {success, data} and direct response formats
    const data = response?.data || response;

    return {
      symbol: data.symbol,
      base_tick: parseFloat(data.base_tick.toString()),
      base_min: parseFloat(data.base_min.toString()),
      base_max: parseFloat(data.base_max.toString()),
      quote_tick: parseFloat(data.quote_tick.toString()),
      min_notional: parseFloat(data.min_notional.toString()),
    };
  }

  /**
   * Get current market price for a symbol
   * Uses WebSocket for real-time price with HTTP fallback
   * @param symbol - Trading symbol (e.g., 'PERP_BTC_USDC')
   * @returns Current mark price
   */
  async getMarketPrice(symbol: string): Promise<number> {
    try {
      // Correct endpoint: /v1/public/futures/{symbol}
      const marketData = await this.request<any>('GET', `/v1/public/futures/${symbol}`);

      console.log('🔍 Market data response:', JSON.stringify(marketData, null, 2));

      // Try multiple possible field locations
      const markPrice =
        marketData?.data?.mark_price ||
        marketData?.mark_price ||
        null;

      if (!markPrice) {
        throw new Error(`No mark_price found in response for ${symbol}`);
      }

      return parseFloat(markPrice.toString());
    } catch (error: any) {
      throw new Error(`Failed to get market price for ${symbol}: ${error.message}`);
    }
  }
}
