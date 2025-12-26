/**
 * Constants for Orderly Network trading
 */

/**
 * Common Orderly Network perpetual trading symbols
 */
export const ORDERLY_SYMBOLS = [
  'PERP_BTC_USDC',
  'PERP_ETH_USDC',
  'PERP_NEAR_USDC',
  'PERP_SOL_USDC',
  'PERP_ARB_USDC',
  'PERP_OP_USDC',
] as const;

/**
 * Default leverage multiplier (no leverage)
 */
export const DEFAULT_LEVERAGE = 1;

/**
 * Minimum order size in USD
 */
export const MIN_ORDER_SIZE_USD = 10;

/**
 * WebSocket connection timeout in milliseconds
 */
export const WEBSOCKET_TIMEOUT_MS = 5000;

/**
 * Maximum leverage allowed by Orderly Network
 */
export const MAX_LEVERAGE = 50;

/**
 * Minimum leverage allowed by Orderly Network
 */
export const MIN_LEVERAGE = 1;
