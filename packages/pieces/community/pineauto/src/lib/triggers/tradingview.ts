/**
 * TradingView Alert Webhook Trigger
 *
 * This trigger receives trade signals from TradingView alerts via webhook.
 * TradingView users must manually configure the webhook URL in their alert settings.
 *
 * Example TradingView Alert Message (JSON):
 * {
 *   "action": "BUY",
 *   "symbol": "PERP_BTC_USDC",
 *   "orderType": "MARKET",
 *   "quantityMode": "PERCENT",
 *   "quantityValue": 10,
 *   "leverage": 2,
 *   "tpslMode": "PERCENT",
 *   "enableTpSl": true,
 *   "tpValue": 5,
 *   "slValue": 2
 * }
 */

import { createTrigger, TriggerStrategy, Property } from '@activepieces/pieces-framework';
import { MarkdownVariant } from '@activepieces/shared';

export const tradingviewAlert = createTrigger({
  name: 'tradingview_alert',
  displayName: 'TradingView Alert',
  description: 'Receives trade signals from TradingView webhooks. Configure the webhook URL in your TradingView alert settings.',
  type: TriggerStrategy.WEBHOOK,
  props: {
    webhookUrl: Property.MarkDown({
      value: `**Webhook URL:**

Copy this URL to your TradingView alert settings:

\`\`\`text
{{webhookUrl}}
\`\`\``,
      variant: MarkdownVariant.BORDERLESS,
    }),
  },
  sampleData: {
    action: 'BUY',
    symbol: 'PERP_BTC_USDC',
    orderType: 'MARKET',
    quantityMode: 'PERCENT',
    quantityValue: 10,
    leverage: 2,
    tpslMode: 'PERCENT',
    enableTpSl: true,
    tpValue: 5,
    slValue: 2,
    timestamp: '2024-12-26T00:00:00Z',
  },
  async onEnable(context) {
    // Passthrough webhook pattern - TradingView users manually set the URL
    // The webhook URL is available at: context.webhookUrl
    // No server-side webhook registration needed
  },
  async onDisable(context) {
    // No cleanup needed for passthrough webhooks
  },
  async run(context) {
    const payload = context.payload.body as any;

    // Basic validation - ensure required fields are present
    if (!payload || typeof payload !== 'object') {
      throw new Error('Invalid webhook payload: Expected JSON object');
    }

    if (!payload.action || !payload.symbol) {
      throw new Error(
        'Invalid TradingView payload: Missing required fields "action" and "symbol"'
      );
    }

    // Validate action field
    if (payload.action !== 'BUY' && payload.action !== 'SELL') {
      throw new Error(
        `Invalid action "${payload.action}". Must be "BUY" or "SELL"`
      );
    }

    // Return payload as array (Activepieces trigger format)
    return [payload];
  },
});
