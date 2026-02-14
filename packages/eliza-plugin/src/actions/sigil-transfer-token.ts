import { ethers } from 'ethers';
import type { SigilSDK } from '@sigil-protocol/sdk';
import type { ElizaAction, ElizaRuntime, ElizaMessage, ElizaState } from '../types';
import { parseAddress, friendlyError } from '../utils';

const ERC20_ABI = ['function transfer(address to, uint256 amount) returns (bool)'];

export function sigilTransferTokenAction(sdk: SigilSDK, maxRisk: number, bundlerUrl?: string): ElizaAction {
  return {
    name: 'SIGIL_TRANSFER_TOKEN',
    description: 'Transfer ERC20 tokens through the Sigil-secured wallet.',
    similes: ['SEND_TOKEN', 'TRANSFER_TOKEN', 'SEND_USDC', 'SEND_USDT', 'SEND_DAI', 'TOKEN_TRANSFER'],
    examples: [
      [
        { user: '{{user1}}', content: { text: 'Send 100 USDC to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28 token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' } },
        { user: '{{agent}}', content: { text: 'Transferring 100 USDC through Sigil.', action: 'SIGIL_TRANSFER_TOKEN' } },
      ],
    ],
    validate: async (_runtime: ElizaRuntime, message: ElizaMessage) => {
      const text = message.content.text;
      // Need at least one address and an amount
      const addresses = text.match(/0x[0-9a-fA-F]{40}/g);
      return !!addresses && addresses.length >= 1 && /\d+/.test(text);
    },
    handler: async (
      _runtime: ElizaRuntime,
      message: ElizaMessage,
      _state?: ElizaState,
      _options?: Record<string, any>,
      callback?: (response: { text: string; [key: string]: any }) => void
    ) => {
      try {
        const text = message.content.text;

        // Extract params from message content or text
        const tokenAddress = message.content.tokenAddress as string | undefined;
        const toAddress = message.content.to as string | undefined;
        const amount = message.content.amount as string | undefined;
        const decimals = (message.content.decimals as number) ?? 18;

        // Try parsing from text if not in structured content
        const addresses = text.match(/0x[0-9a-fA-F]{40}/g) ?? [];
        const amountMatch = text.match(/(\d+\.?\d*)/);

        const resolvedToken = tokenAddress ?? addresses[1] ?? addresses[0];
        const resolvedTo = toAddress ?? addresses[0];
        const resolvedAmount = amount ?? amountMatch?.[1];

        if (!resolvedToken || !resolvedTo || !resolvedAmount) {
          callback?.({
            text: '❌ Please provide: recipient address, token address, and amount.\nExample: "Send 100 USDC to 0x... token 0x..."',
          });
          return false;
        }

        // Encode ERC20 transfer calldata
        const iface = new ethers.Interface(ERC20_ABI);
        const parsedAmount = ethers.parseUnits(resolvedAmount, decimals);
        const calldata = iface.encodeFunctionData('transfer', [resolvedTo, parsedAmount]);

        // Evaluate through Sigil (target is token contract, value is 0, data is transfer calldata)
        const result = await sdk.evaluate({
          target: resolvedToken,
          value: '0',
          data: calldata,
        });

        if (result.verdict === 'REJECTED') {
          callback?.({
            text: `🚫 Token transfer rejected: ${result.rejectionReason ?? 'Policy violation'}\nRisk score: ${result.riskScore}/100`,
          });
          return false;
        }

        if (result.riskScore > maxRisk) {
          callback?.({
            text: `⚠️ Risk score ${result.riskScore} exceeds threshold ${maxRisk}. Transfer blocked.`,
          });
          return false;
        }

        // Build UserOp
        const userOp = await sdk.buildUserOp({
          target: resolvedToken,
          value: '0',
          data: calldata,
        });

        callback?.({
          text: `✅ Token transfer approved!\nToken: ${resolvedToken}\nTo: ${resolvedTo}\nAmount: ${resolvedAmount}\nRisk score: ${result.riskScore}/100${!bundlerUrl ? '\n⚠️ No bundler configured — UserOp ready for external submission.' : ''}`,
          verdict: 'APPROVED',
          riskScore: result.riskScore,
          userOp,
        });
        return true;
      } catch (err: any) {
        callback?.({ text: friendlyError(err) });
        return false;
      }
    },
  };
}
