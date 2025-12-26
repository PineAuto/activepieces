/**
 * Pineauto - TradingView to Orderly Network Auto-Trading Integration
 *
 * This piece enables automated trading from TradingView alerts to Orderly Network DEX.
 *
 * Features:
 * - Ed25519 authentication for Orderly Network
 * - TradingView webhook trigger for trade signals
 * - Automated order execution with leverage control
 * - Composite TP/SL orders (Take Profit / Stop Loss)
 * - Telegram notifications
 * - Support for 8 trading scenarios (TP/SL × Quantity × OrderType)
 *
 * @author hoddukzoa
 * @version 1.0.0
 */

import { createPiece } from '@activepieces/pieces-framework';
import { PieceCategory } from '@activepieces/shared';
import { orderlyAuth } from './lib/common/auth';
import { placeTrade } from './lib/actions/place-trade';
import { tradingviewAlert } from './lib/triggers/tradingview';

export const pineauto = createPiece({
  displayName: 'Pineauto',
  description: 'TradingView to Orderly Network auto-trading integration with TP/SL, leverage control, and Telegram notifications',
  auth: orderlyAuth,
  minimumSupportedRelease: '0.36.1',
  logoUrl: 'https://cdn.activepieces.com/pieces/pineauto.png',
  authors: ['hoddukzoa'],
  categories: [PieceCategory.DEVELOPER_TOOLS],
  actions: [placeTrade],
  triggers: [tradingviewAlert],
});
