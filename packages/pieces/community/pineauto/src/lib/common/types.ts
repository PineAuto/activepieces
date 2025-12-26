/**
 * TypeScript type definitions for TradingView to Orderly Network integration
 */

/**
 * TradingView webhook signal structure
 * This represents the JSON payload sent from TradingView alerts
 */
export interface TradingViewSignal {
  action: 'BUY' | 'SELL';
  symbol: string;
  orderType: 'MARKET' | 'LIMIT';
  limitPrice?: number;
  quantityMode: 'PERCENT' | 'FIXED';
  quantityValue: number;
  leverage: number;
  tpslMode: 'PERCENT' | 'ABSOLUTE';
  enableTpSl: boolean;
  tpValue?: number;  // Percent (e.g., 5 for 5%) or absolute price
  slValue?: number;  // Percent (e.g., 2 for 2%) or absolute price
  timestamp?: string;
}

/**
 * Calculated order parameters after processing
 */
export interface CalculatedOrder {
  quantity: number;
  entryPrice?: number;
  tpPrice?: number;
  slPrice?: number;
}

/**
 * Trade execution result
 */
export interface TradeResult {
  success: boolean;
  primaryOrder: any;
  tpslOrder?: any;
  leverageSet?: boolean;
  calculatedQuantity?: number;
  entryPrice?: number;
  notification: 'sent' | 'failed' | 'disabled';
  errors?: string[];
}

/**
 * TP/SL calculation result
 */
export interface TpSlPrices {
  tpPrice: number;
  slPrice: number;
}
