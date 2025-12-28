/**
 * Place Trade Action
 *
 * Unified trading action that handles all 8 combinatorial scenarios:
 * - TP/SL (Yes/No) × Quantity (Percent/Fixed) × Order Type (Limit/Market)
 *
 * Features:
 * - Dynamic leverage setting via Orderly API
 * - Composite TP/SL orders (single API call)
 * - WebSocket real-time market price
 * - Telegram notifications
 * - Both PERCENT and ABSOLUTE TP/SL modes
 */

import { createAction, Property } from '@activepieces/pieces-framework';
import { orderlyAuth } from '../common/auth';
import { OrderlyClient } from '../common/client';
import {
  symbolProp,
  sideProp,
  orderTypeProp,
  quantityModeProp,
  tpslModeProp,
} from '../common/props';
import {
  calculateTpSlPrices,
  calculateQuantity,
  sendTelegramMessage,
  validateTpSlPrices,
  convertNotionalToAssetQuantity,
  roundToStepSize,
  validatePostRoundingNotional,
  formatQuantityToStepSize,
  getDecimalPlaces,
} from '../common/utils';
import { MIN_ORDER_SIZE_USD } from '../common/constants';

export const placeTrade = createAction({
  auth: orderlyAuth,
  name: 'place_trade',
  displayName: 'Place Trade from Signal',
  description: 'Execute trade on Orderly Network with optional TP/SL and leverage control. Handles all trading scenarios from TradingView signals.',

  props: {
    // === BASIC TRADE PARAMETERS ===

    symbol: symbolProp,

    side: sideProp,

    orderType: orderTypeProp,

    limitPrice: Property.Number({
      displayName: 'Limit Price',
      description: 'Required for limit orders. The exact price at which to execute the trade.',
      required: false,
    }),

    // === QUANTITY PARAMETERS ===

    quantityMode: quantityModeProp,

    quantityValue: Property.Number({
      displayName: 'Quantity Value',
      description: 'For PERCENT mode: percentage of balance (1-100). For FIXED mode: USD amount. Defaults to 10% if not specified.',
      required: false,
      defaultValue: 10,
    }),

    // === LEVERAGE PARAMETERS ===

    leverage: Property.Number({
      displayName: 'Leverage',
      description: 'Leverage multiplier (1-50). Defaults to 1x (no leverage) if not specified.',
      required: false,
      defaultValue: 1,
    }),

    // === TP/SL PARAMETERS ===

    enableTpSl: Property.Checkbox({
      displayName: 'Enable Take Profit / Stop Loss',
      description: 'Automatically place TP/SL orders after entry',
      required: false,
      defaultValue: false,
    }),

    tpslMode: Property.StaticDropdown({
      displayName: 'TP/SL Mode',
      description: 'Calculate TP/SL as percentage from entry or absolute price levels',
      required: false,
      options: {
        disabled: false,
        options: [
          { label: 'Percentage from Entry', value: 'PERCENT' },
          { label: 'Absolute Price', value: 'ABSOLUTE' },
        ],
      },
    }),

    tpValue: Property.Number({
      displayName: 'Take Profit Value',
      description: 'For PERCENT mode: percentage (e.g., 5 = 5% profit). For ABSOLUTE mode: exact price level.',
      required: false,
    }),

    slValue: Property.Number({
      displayName: 'Stop Loss Value',
      description: 'For PERCENT mode: percentage (e.g., 2 = 2% loss). For ABSOLUTE mode: exact price level.',
      required: false,
    }),

    // === NOTIFICATION PARAMETERS ===

    enableTelegram: Property.Checkbox({
      displayName: 'Send Telegram Notification',
      description: 'Send trade execution details to Telegram',
      required: false,
      defaultValue: false,
    }),

    telegramBotToken: Property.ShortText({
      displayName: 'Telegram Bot Token',
      description: 'Get from @BotFather on Telegram',
      required: false,
    }),

    telegramChatId: Property.ShortText({
      displayName: 'Telegram Chat ID',
      description: 'Your Telegram chat ID (can be user ID or channel ID)',
      required: false,
    }),
  },

  async run(context) {
    const props = context.propsValue;
    const client = new OrderlyClient(context.auth.props as any);

    // ========================================
    // STEP 0: APPLY DEFAULTS FOR OPTIONAL PARAMETERS
    // ========================================

    // Apply defaults when parameters are missing from TradingView payload
    const orderType = props.orderType ?? 'MARKET';
    const quantityMode = props.quantityMode ?? 'PERCENT';
    const quantityValue = props.quantityValue ?? 10;
    const leverage = props.leverage ?? 1;

    // Update props reference for rest of function
    const finalProps = {
      ...props,
      orderType,
      quantityMode,
      quantityValue,
      leverage,
    };

    // Track errors for comprehensive error reporting
    const errors: string[] = [];

    // ========================================
    // STEP 1: VALIDATE INPUTS
    // ========================================

    // Validate limit order requirements
    if (finalProps.orderType === 'LIMIT' && !props.limitPrice) {
      throw new Error('Limit price is required for limit orders');
    }

    // Validate TP/SL requirements
    if (props.enableTpSl) {
      if (!props.tpslMode) {
        throw new Error('TP/SL mode is required when TP/SL is enabled');
      }
      if (!props.tpValue || !props.slValue) {
        throw new Error('Both Take Profit and Stop Loss values are required when TP/SL is enabled');
      }
      if (props.tpValue <= 0 || props.slValue <= 0) {
        throw new Error('TP/SL values must be positive numbers');
      }
    }

    // Validate quantity
    if (finalProps.quantityValue <= 0) {
      throw new Error('Quantity value must be positive');
    }
    if (finalProps.quantityMode === 'PERCENT' && finalProps.quantityValue > 100) {
      throw new Error('Percentage quantity cannot exceed 100%');
    }

    // Validate leverage
    if (finalProps.leverage < 1 || finalProps.leverage > 50) {
      throw new Error('Leverage must be between 1 and 50');
    }

    // Validate Telegram settings
    if (props.enableTelegram && (!props.telegramBotToken || !props.telegramChatId)) {
      throw new Error('Telegram bot token and chat ID are required when Telegram notifications are enabled');
    }

    // ========================================
    // STEP 2: SET LEVERAGE
    // ========================================

    let leverageSet = false;
    let actualLeverage: number | null = null;

    try {
      // Set leverage for the symbol
      await client.setLeverage(props.symbol, finalProps.leverage);

      // Verify leverage was set correctly by querying current leverage
      const leverageInfo = await client.getLeverage(props.symbol);
      actualLeverage = leverageInfo.leverage || leverageInfo.data?.leverage;

      // Check if actual leverage matches requested leverage
      if (actualLeverage !== finalProps.leverage) {
        throw new Error(
          `Leverage mismatch: Requested ${finalProps.leverage}x, ` +
          `but actual leverage is ${actualLeverage}x`
        );
      }

      leverageSet = true;
      console.log(`✅ Leverage set successfully: ${actualLeverage}x for ${props.symbol}`);

    } catch (error: any) {
      // Throw error instead of warning - leverage setting is critical
      throw new Error(
        `Failed to set leverage to ${finalProps.leverage}x for ${props.symbol}: ${error.message}`
      );
    }

    // ========================================
    // STEP 3: CALCULATE QUANTITY
    // ========================================

    let orderQuantity: number;
    try {
      if (finalProps.quantityMode === 'PERCENT') {
        // Get account balance for percentage calculation
        const holdingResponse = await client.getHolding();

        // Extract balance from Orderly API response structure
        // Response format: {success, data: {holding: [{token, holding, frozen, ...}]}}
        let balance = 0;

        try {
          // Navigate to holding array
          const holdingArray = holdingResponse?.data?.holding || holdingResponse?.holding;

          if (!holdingArray || !Array.isArray(holdingArray) || holdingArray.length === 0) {
            throw new Error(
              `Invalid holding response structure. Response: ${JSON.stringify(holdingResponse)}`
            );
          }

          // Find USDC holding (preferred) or use first available token
          const usdcHolding = holdingArray.find((h: any) => h.token === 'USDC');
          const holding = usdcHolding || holdingArray[0];

          if (!holding || typeof holding.holding !== 'number') {
            throw new Error(
              `No valid holding found in response. Holdings: ${JSON.stringify(holdingArray)}`
            );
          }

          balance = holding.holding;

          console.log(`🔍 Balance extraction:
  - Token: ${holding.token}
  - Available: ${balance} ${holding.token}
  - Frozen: ${holding.frozen || 0}
  - Total holdings in account: ${holdingArray.length}`);

        } catch (extractionError: any) {
          throw new Error(
            `Failed to extract balance from API response: ${extractionError.message}. ` +
            `Raw response: ${JSON.stringify(holdingResponse)}`
          );
        }

        if (balance <= 0) {
          throw new Error(
            `Account balance is zero or unavailable. ` +
            `Extracted balance: ${balance}. ` +
            `Response: ${JSON.stringify(holdingResponse)}`
          );
        }

        orderQuantity = calculateQuantity('PERCENT', finalProps.quantityValue, balance);
      } else {
        // Fixed USD amount
        orderQuantity = calculateQuantity('FIXED', finalProps.quantityValue);
      }

      // ========================================
      // STEP 3.3: VALIDATE MINIMUM ORDER SIZE (ENHANCED)
      // ========================================

      // Check minimum with buffer to account for step size rounding
      const preRoundingBuffer = MIN_ORDER_SIZE_USD * 0.10; // 10% buffer
      const safeMinimum = MIN_ORDER_SIZE_USD + preRoundingBuffer;

      if (orderQuantity < MIN_ORDER_SIZE_USD) {
        throw new Error(
          `Order quantity ($${orderQuantity.toFixed(2)}) is below minimum order size ($${MIN_ORDER_SIZE_USD}). ` +
          `Recommended minimum: $${safeMinimum.toFixed(2)} to account for step size rounding.`
        );
      }

      // Warning for orders near minimum (may fail after rounding)
      if (orderQuantity < safeMinimum) {
        console.warn(`⚠️ Order near minimum threshold - may fail after rounding:
  - Order value: $${orderQuantity.toFixed(2)}
  - Minimum required: $${MIN_ORDER_SIZE_USD.toFixed(2)}
  - Recommended minimum: $${safeMinimum.toFixed(2)}
  - Buffer for safety: $${preRoundingBuffer.toFixed(2)}`);
      }
    } catch (error: any) {
      throw new Error(`Failed to calculate quantity: ${error.message}`);
    }

    // ========================================
    // STEP 3.5: GET ENTRY PRICE (MOVED UP)
    // ========================================

    let entryPrice: number;
    try {
      if (finalProps.orderType === 'MARKET') {
        // Get real-time market price via WebSocket/HTTP
        entryPrice = await client.getMarketPrice(props.symbol);
      } else {
        // Use specified limit price
        entryPrice = props.limitPrice!;
      }
    } catch (error: any) {
      throw new Error(`Failed to get entry price: ${error.message}`);
    }

    // ========================================
    // STEP 3.6: CONVERT USD NOTIONAL TO ASSET QUANTITY
    // ========================================

    const orderQuantityUSD = orderQuantity;  // Save USD value for logging
    const orderQuantityAsset = convertNotionalToAssetQuantity(orderQuantityUSD, entryPrice);

    console.log(`💰 Order sizing:
  - USD notional: $${orderQuantityUSD.toFixed(2)}
  - Entry price: $${entryPrice.toFixed(2)}
  - Asset quantity: ${orderQuantityAsset.toFixed(8)}`);

    // ========================================
    // STEP 3.7: ROUND TO STEP SIZE
    // ========================================

    let baseTickSize: number;
    let roundedQuantity: number;

    try {
      // Get symbol configuration including step size
      const symbolInfo = await client.getSymbolInfo(props.symbol);
      baseTickSize = symbolInfo.base_tick;

      // Round quantity to comply with step size
      roundedQuantity = roundToStepSize(orderQuantityAsset, baseTickSize);

      // Validate we still meet minimum order size after rounding
      if (roundedQuantity < symbolInfo.base_min) {
        throw new Error(
          `After rounding to step size (${baseTickSize}), order quantity (${roundedQuantity}) ` +
          `is below minimum (${symbolInfo.base_min}). Consider increasing order size.`
        );
      }

      console.log(`📐 Step size compliance:
  - Raw quantity: ${orderQuantityAsset.toFixed(8)}
  - Step size: ${baseTickSize}
  - Rounded quantity: ${roundedQuantity.toFixed(8)}
  - Minimum allowed: ${symbolInfo.base_min}`);

    } catch (error: any) {
      throw new Error(`Failed to apply step size rounding: ${error.message}`);
    }

    // Update variable for use in order placement
    const finalOrderQuantity = roundedQuantity;

    // ========================================
    // STEP 3.8: VALIDATE POST-ROUNDING ORDER VALUE
    // ========================================

    // After step size rounding, verify USD value still meets minimum
    // This prevents API rejection when floor rounding reduces order value below threshold

    const postRoundingValidation = validatePostRoundingNotional(
      finalOrderQuantity,
      entryPrice,
      MIN_ORDER_SIZE_USD,
      baseTickSize
    );

    if (!postRoundingValidation.isValid) {
      throw new Error(
        `Order validation failed: After rounding to step size (${baseTickSize}), ` +
        `order value fell below minimum.\n\n` +
        `Details:\n` +
        `- Your specified amount: $${orderQuantityUSD.toFixed(2)}\n` +
        `- After step size rounding: $${postRoundingValidation.actualNotional.toFixed(2)}\n` +
        `- Minimum required: $${postRoundingValidation.minRequired.toFixed(2)}\n` +
        `- Shortfall: $${postRoundingValidation.shortfall!.toFixed(2)}\n\n` +
        `Recommendation: Increase order size to at least $${postRoundingValidation.suggestedMinUsd!.toFixed(2)} ` +
        `to ensure it remains above minimum after rounding.\n\n` +
        `Technical Details:\n` +
        `- Raw quantity: ${orderQuantityAsset.toFixed(8)} ${props.symbol}\n` +
        `- Rounded quantity: ${finalOrderQuantity.toFixed(8)} ${props.symbol}\n` +
        `- Step size: ${baseTickSize}\n` +
        `- Current price: $${entryPrice.toFixed(2)}\n` +
        `- Value lost to rounding: $${(orderQuantityUSD - postRoundingValidation.actualNotional).toFixed(2)}`
      );
    }

    // Log successful validation for transparency
    console.log(`✅ Post-rounding validation passed:
  - Rounded quantity: ${finalOrderQuantity.toFixed(8)} ${props.symbol}
  - Post-rounding value: $${postRoundingValidation.actualNotional.toFixed(2)}
  - Minimum required: $${MIN_ORDER_SIZE_USD.toFixed(2)}`);

    // ========================================
    // STEP 4: CALCULATE TP/SL PRICES
    // ========================================

    let tpPrice: number | undefined;
    let slPrice: number | undefined;

    if (props.enableTpSl) {
      try {
        const tpslPrices = calculateTpSlPrices(
          entryPrice,
          props.side as 'BUY' | 'SELL',
          props.tpslMode as 'PERCENT' | 'ABSOLUTE',
          props.tpValue!,
          props.slValue!
        );

        tpPrice = tpslPrices.tpPrice;
        slPrice = tpslPrices.slPrice;

        // Validate TP/SL logic
        validateTpSlPrices(entryPrice, tpPrice, slPrice, props.side as 'BUY' | 'SELL');
      } catch (error: any) {
        throw new Error(`Failed to calculate TP/SL: ${error.message}`);
      }
    }

    // ========================================
    // STEP 6: PLACE PRIMARY ORDER
    // ========================================

    let orderResponse: any;
    let orderId: string;

    // Format quantity to exact step size precision as STRING
    // Prevents JavaScript floating-point precision errors (0.00228 → 0.00228000000000001)
    const formattedQuantity = formatQuantityToStepSize(finalOrderQuantity, baseTickSize);

    console.log(`🔢 Precision formatting:
  - Raw quantity: ${finalOrderQuantity}
  - Step size: ${baseTickSize}
  - Formatted: "${formattedQuantity}" (string)
  - Decimal places: ${getDecimalPlaces(baseTickSize)}`);

    try {
      orderResponse = await client.placeOrder({
        symbol: props.symbol,
        side: props.side as 'BUY' | 'SELL',
        order_type: finalProps.orderType as 'MARKET' | 'LIMIT',
        order_price: finalProps.orderType === 'LIMIT' ? props.limitPrice : undefined,
        order_quantity: formattedQuantity,  // STRING type for API precision
        client_order_id: `tv-${Date.now()}`,
      });

      // Extract order_id from response - handle multiple possible structures
      // Format 1: {success, order_id} (top-level)
      // Format 2: {success, data: {order_id}} (nested)
      orderId = orderResponse?.order_id || orderResponse?.data?.order_id;

      if (!orderId) {
        throw new Error(
          `Order placement failed: No order ID found in response. ` +
          `Response structure: ${JSON.stringify(orderResponse)}`
        );
      }

      console.log(`✅ Order placed successfully:
  - Order ID: ${orderId}
  - Symbol: ${props.symbol}
  - Side: ${props.side}
  - Quantity: ${finalOrderQuantity}
  - Type: ${finalProps.orderType}`);

    } catch (error: any) {
      throw new Error(`Failed to place primary order: ${error.message}`);
    }

    // ========================================
    // STEP 7: PLACE TP/SL ORDER (Composite)
    // ========================================

    let tpslResponse: any = null;

    if (props.enableTpSl && orderId) {
      try {
        tpslResponse = await client.placeAlgoOrder({
          symbol: props.symbol,
          algo_type: 'TP_SL',
          quantity: finalOrderQuantity.toString(),
          trigger_price_type: 'MARK_PRICE',
          child_orders: [
            {
              symbol: props.symbol,
              algo_type: 'TAKE_PROFIT',
              side: props.side === 'BUY' ? 'SELL' : 'BUY',
              type: 'MARKET',
              trigger_price: tpPrice!,
              reduce_only: true,
            },
            {
              symbol: props.symbol,
              algo_type: 'STOP_LOSS',
              side: props.side === 'BUY' ? 'SELL' : 'BUY',
              type: 'MARKET',
              trigger_price: slPrice!,
              reduce_only: true,
            },
          ],
        });
      } catch (error: any) {
        // TP/SL failure is not critical - primary order succeeded
        errors.push(`TP/SL placement failed: ${error.message}`);
        console.error(`Failed to place TP/SL order: ${error.message}`);
      }
    }

    // ========================================
    // STEP 8: SEND TELEGRAM NOTIFICATION
    // ========================================

    let notificationStatus: 'sent' | 'failed' | 'disabled' = 'disabled';

    if (props.enableTelegram && props.telegramBotToken && props.telegramChatId) {
      try {
        const message = `
🔔 <b>Trade Executed on Orderly Network</b>

<b>Symbol:</b> ${props.symbol}
<b>Side:</b> ${props.side}
<b>Type:</b> ${finalProps.orderType}
<b>Quantity:</b> ${orderQuantity.toFixed(2)} USD
<b>Entry Price:</b> ${entryPrice.toFixed(4)}
<b>Leverage:</b> ${finalProps.leverage}x
<b>Order ID:</b> ${orderId}

${props.enableTpSl
  ? `<b>Take Profit:</b> ${tpPrice?.toFixed(4)}
<b>Stop Loss:</b> ${slPrice?.toFixed(4)}
<b>TP/SL Status:</b> ${tpslResponse ? '✅ Set' : '❌ Failed'}`
  : '<b>TP/SL:</b> Not configured'
}

${errors.length > 0 ? `\n⚠️ <b>Warnings:</b>\n${errors.join('\n')}` : ''}

<i>Executed via Pineauto - TradingView Integration</i>
        `.trim();

        await sendTelegramMessage(
          props.telegramBotToken,
          props.telegramChatId,
          message
        );

        notificationStatus = 'sent';
      } catch (error: any) {
        notificationStatus = 'failed';
        errors.push(`Telegram notification failed: ${error.message}`);
        console.error(`Failed to send Telegram notification: ${error.message}`);
      }
    }

    // ========================================
    // STEP 9: RETURN RESULT
    // ========================================

    return {
      success: true,
      primaryOrder: orderResponse,
      tpslOrder: tpslResponse,
      leverageSet,
      calculatedQuantityUSD: orderQuantityUSD,
      calculatedQuantityAsset: orderQuantityAsset,
      roundedQuantity: finalOrderQuantity,
      stepSize: baseTickSize,
      postRoundingValue: finalOrderQuantity * entryPrice,
      roundingLoss: orderQuantityUSD - (finalOrderQuantity * entryPrice),
      entryPrice,
      tpPrice,
      slPrice,
      notification: notificationStatus,
      errors: errors.length > 0 ? errors : undefined,
    };
  },
});
