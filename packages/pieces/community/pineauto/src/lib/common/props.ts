/**
 * Reusable Activepieces property definitions for trading actions
 */

import { Property } from '@activepieces/pieces-framework';

/**
 * Trading symbol property
 */
export const symbolProp = Property.ShortText({
  displayName: 'Trading Symbol',
  description: 'Orderly Network trading symbol (e.g., PERP_BTC_USDC, PERP_ETH_USDC)',
  required: true,
});

/**
 * Trade direction property
 */
export const sideProp = Property.StaticDropdown({
  displayName: 'Trade Direction',
  description: 'Buy (Long) or Sell (Short) position',
  required: true,
  options: {
    options: [
      { label: 'Buy / Long', value: 'BUY' },
      { label: 'Sell / Short', value: 'SELL' },
    ],
  },
});

/**
 * Order type property
 */
export const orderTypeProp = Property.StaticDropdown({
  displayName: 'Order Type',
  description: 'Market order (immediate) or Limit order (at specific price). Defaults to MARKET if not specified.',
  required: false,
  defaultValue: 'MARKET',
  options: {
    options: [
      { label: 'Market Order', value: 'MARKET' },
      { label: 'Limit Order', value: 'LIMIT' },
    ],
  },
});

/**
 * Quantity calculation mode property
 */
export const quantityModeProp = Property.StaticDropdown({
  displayName: 'Quantity Mode',
  description: 'Calculate quantity as percentage of balance or fixed USD amount. Defaults to PERCENT if not specified.',
  required: false,
  defaultValue: 'PERCENT',
  options: {
    options: [
      { label: 'Percent of Balance', value: 'PERCENT' },
      { label: 'Fixed Amount (USD)', value: 'FIXED' },
    ],
  },
});

/**
 * TP/SL calculation mode property
 */
export const tpslModeProp = Property.StaticDropdown({
  displayName: 'TP/SL Mode',
  description: 'Calculate TP/SL as percentage from entry or absolute price levels',
  required: true,
  options: {
    options: [
      { label: 'Percentage from Entry', value: 'PERCENT' },
      { label: 'Absolute Price', value: 'ABSOLUTE' },
    ],
  },
});
