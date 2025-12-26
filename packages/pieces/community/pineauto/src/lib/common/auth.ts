import { PieceAuth, Property } from '@activepieces/pieces-framework';
import { OrderlyClient } from './client';

export const orderlyAuth = PieceAuth.CustomAuth({
  displayName: 'Orderly Network',
  description: 'Connect to Orderly Network perpetual futures trading',
  props: {
    accountId: Property.ShortText({
      displayName: 'Account ID',
      description: 'Your Orderly account ID (e.g., 0x...)',
      required: true,
    }),
    orderlyKey: Property.ShortText({
      displayName: 'Orderly Key',
      description: 'Your Orderly public key (base58-encoded, from Orderly dashboard)',
      required: true,
    }),
    secretKey: PieceAuth.SecretText({
      displayName: 'Secret Key',
      description: 'Your Orderly private key (base58-encoded, kept secure)',
      required: true,
    }),
    testnet: Property.Checkbox({
      displayName: 'Use Testnet',
      description: 'Enable for testnet.orderly.org (recommended for testing)',
      required: false,
      defaultValue: true,
    }),
  },
  validate: async ({ auth }) => {
    try {
      const client = new OrderlyClient({
        ...auth,
        testnet: auth.testnet ?? true,
      });
      await client.getAccountInfo();

      return {
        valid: true,
      };
    } catch (error: any) {
      // Layer 1 Error Handling: Auth validation
      if (error.message.includes('401')) {
        return {
          valid: false,
          error: 'Invalid API credentials. Please check your Account ID, Orderly Key, and Secret Key.'
        };
      }
      if (error.message.includes('timeout')) {
        return {
          valid: false,
          error: 'Connection timeout. Please check your network and try again.'
        };
      }
      if (error.message.includes('base58')) {
        return {
          valid: false,
          error: 'Invalid key format. Keys must be base58-encoded strings from Orderly dashboard.'
        };
      }
      return {
        valid: false,
        error: `Connection failed: ${error.message}`
      };
    }
  },
  required: true,
});
