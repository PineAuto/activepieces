/**
 * Helper utility functions for trading calculations and notifications
 */

import { TpSlPrices } from './types';

/**
 * Calculate Take Profit and Stop Loss prices based on entry price and mode
 *
 * @param entryPrice - The entry price of the trade
 * @param side - Trade direction (BUY or SELL)
 * @param mode - Calculation mode (PERCENT or ABSOLUTE)
 * @param tpValue - Take profit value (percentage or absolute price)
 * @param slValue - Stop loss value (percentage or absolute price)
 * @returns Object containing calculated TP and SL prices
 *
 * @example
 * // BUY with percentage mode (5% TP, 2% SL)
 * calculateTpSlPrices(100, 'BUY', 'PERCENT', 5, 2)
 * // Returns: { tpPrice: 105, slPrice: 98 }
 *
 * @example
 * // SELL with absolute mode
 * calculateTpSlPrices(100, 'SELL', 'ABSOLUTE', 95, 105)
 * // Returns: { tpPrice: 95, slPrice: 105 }
 */
export function calculateTpSlPrices(
  entryPrice: number,
  side: 'BUY' | 'SELL',
  mode: 'PERCENT' | 'ABSOLUTE',
  tpValue: number,
  slValue: number
): TpSlPrices {
  if (mode === 'PERCENT') {
    // Percentage-based calculation
    if (side === 'BUY') {
      // For LONG: TP above entry, SL below entry
      return {
        tpPrice: entryPrice * (1 + tpValue / 100),
        slPrice: entryPrice * (1 - slValue / 100),
      };
    } else {
      // For SHORT: TP below entry, SL above entry
      return {
        tpPrice: entryPrice * (1 - tpValue / 100),
        slPrice: entryPrice * (1 + slValue / 100),
      };
    }
  } else {
    // Absolute price mode - use exact values
    return {
      tpPrice: tpValue,
      slPrice: slValue,
    };
  }
}

/**
 * Calculate position quantity based on mode (percentage of balance or fixed amount)
 *
 * @param mode - Calculation mode (PERCENT or FIXED)
 * @param value - Value (percentage 1-100 or fixed USD amount)
 * @param balance - Account balance (required for PERCENT mode)
 * @returns Calculated quantity in USD
 *
 * @example
 * // 10% of $1000 balance
 * calculateQuantity('PERCENT', 10, 1000)
 * // Returns: 100
 *
 * @example
 * // Fixed $500 amount
 * calculateQuantity('FIXED', 500)
 * // Returns: 500
 */
export function calculateQuantity(
  mode: 'PERCENT' | 'FIXED',
  value: number,
  balance?: number
): number {
  if (mode === 'PERCENT') {
    if (!balance || balance <= 0) {
      throw new Error('Valid balance is required for percentage-based quantity calculation');
    }
    if (value <= 0 || value > 100) {
      throw new Error('Percentage value must be between 0 and 100');
    }
    return (balance * value) / 100;
  } else {
    // FIXED mode
    if (value <= 0) {
      throw new Error('Fixed quantity value must be greater than 0');
    }
    return value;
  }
}

/**
 * Send notification message via Telegram
 *
 * @param botToken - Telegram bot token
 * @param chatId - Telegram chat ID
 * @param message - Message to send
 * @throws Error if Telegram API request fails
 *
 * @example
 * await sendTelegramMessage(
 *   'bot123456:ABC-DEF1234',
 *   '123456789',
 *   'Trade executed: BUY PERP_BTC_USDC'
 * )
 */
export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  message: string
): Promise<void> {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Telegram API error: ${errorData.description || response.statusText}`
      );
    }
  } catch (error: any) {
    throw new Error(`Failed to send Telegram message: ${error.message}`);
  }
}

/**
 * Validate TP/SL prices are logically correct
 *
 * @param entryPrice - Entry price
 * @param tpPrice - Take profit price
 * @param slPrice - Stop loss price
 * @param side - Trade direction
 * @throws Error if prices are invalid
 */
export function validateTpSlPrices(
  entryPrice: number,
  tpPrice: number,
  slPrice: number,
  side: 'BUY' | 'SELL'
): void {
  if (side === 'BUY') {
    // For LONG: TP should be above entry, SL should be below entry
    if (tpPrice <= entryPrice) {
      throw new Error(`Invalid TP: For BUY orders, take profit (${tpPrice}) must be above entry price (${entryPrice})`);
    }
    if (slPrice >= entryPrice) {
      throw new Error(`Invalid SL: For BUY orders, stop loss (${slPrice}) must be below entry price (${entryPrice})`);
    }
  } else {
    // For SHORT: TP should be below entry, SL should be above entry
    if (tpPrice >= entryPrice) {
      throw new Error(`Invalid TP: For SELL orders, take profit (${tpPrice}) must be below entry price (${entryPrice})`);
    }
    if (slPrice <= entryPrice) {
      throw new Error(`Invalid SL: For SELL orders, stop loss (${slPrice}) must be above entry price (${entryPrice})`);
    }
  }
}

/**
 * Convert USD notional value to base asset quantity
 *
 * Orderly API expects order_quantity in base asset units (BTC, ETH, etc.), not USD.
 * This function converts a USD notional value to the corresponding asset quantity.
 *
 * @param notionalValue - USD amount to trade
 * @param markPrice - Current mark price of the asset
 * @returns Base asset quantity (e.g., BTC amount)
 *
 * @example
 * // $100 worth of BTC at $88,938 mark price
 * convertNotionalToAssetQuantity(100, 88938)
 * // Returns: 0.001124 BTC
 *
 * @example
 * // $50 worth of BTC at $90,000 mark price
 * convertNotionalToAssetQuantity(50, 90000)
 * // Returns: 0.000556 BTC
 */
export function convertNotionalToAssetQuantity(
  notionalValue: number,
  markPrice: number
): number {
  if (markPrice <= 0) {
    throw new Error('Mark price must be greater than 0');
  }
  if (notionalValue <= 0) {
    throw new Error('Notional value must be greater than 0');
  }

  return notionalValue / markPrice;
}

/**
 * Round order quantity to comply with exchange step size requirements
 *
 * Uses floor rounding to ensure order size never exceeds user's intended amount.
 * All exchanges require order quantities to be exact multiples of step size.
 *
 * @param quantity - Calculated order quantity in base asset units
 * @param stepSize - The base_tick (step size) from symbol configuration
 * @returns Rounded quantity that complies with step size
 *
 * @example
 * // Step size 0.001, quantity 0.00011271
 * roundToStepSize(0.00011271, 0.001)
 * // Returns: 0.000 (floor to nearest step)
 *
 * @example
 * // Step size 0.001, quantity 0.0024567
 * roundToStepSize(0.0024567, 0.001)
 * // Returns: 0.002 (2 steps)
 */
export function roundToStepSize(
  quantity: number,
  stepSize: number
): number {
  if (stepSize <= 0) {
    throw new Error('Step size must be greater than 0');
  }
  if (quantity <= 0) {
    throw new Error('Quantity must be greater than 0');
  }

  // Calculate how many steps fit in the quantity
  const steps = Math.floor(quantity / stepSize);

  // Return quantity rounded to nearest step
  return steps * stepSize;
}

/**
 * Validates that post-rounding order value meets minimum requirements
 *
 * After step size rounding, the USD value of an order can drop below the exchange minimum.
 * This function validates the post-rounding value and provides detailed guidance.
 *
 * @param roundedQuantity - Asset quantity after step size rounding
 * @param entryPrice - Current market price
 * @param minNotional - Minimum order value in USD
 * @param stepSize - Step size for calculating buffer
 * @returns Validation result with error details if invalid
 *
 * @example
 * // Order below minimum after rounding
 * validatePostRoundingNotional(0.00011, 86775.90, 10, 0.00001)
 * // Returns: { isValid: false, actualNotional: 9.55, minRequired: 10, shortfall: 0.45, suggestedMinUsd: 11.74 }
 *
 * @example
 * // Order meets minimum after rounding
 * validatePostRoundingNotional(0.00012, 86775.90, 10, 0.00001)
 * // Returns: { isValid: true, actualNotional: 10.41, minRequired: 10 }
 */
export interface NotionalValidationResult {
  isValid: boolean;
  actualNotional: number;
  minRequired: number;
  shortfall?: number;
  suggestedMinUsd?: number;
}

export function validatePostRoundingNotional(
  roundedQuantity: number,
  entryPrice: number,
  minNotional: number,
  stepSize: number
): NotionalValidationResult {
  const actualNotional = roundedQuantity * entryPrice;

  if (actualNotional >= minNotional) {
    return {
      isValid: true,
      actualNotional,
      minRequired: minNotional,
    };
  }

  // Calculate shortfall and suggested minimum with safety buffer
  const shortfall = minNotional - actualNotional;
  const stepValue = stepSize * entryPrice;
  const suggestedMinUsd = minNotional + (stepValue * 2); // 2-step buffer

  return {
    isValid: false,
    actualNotional,
    minRequired: minNotional,
    shortfall,
    suggestedMinUsd,
  };
}
