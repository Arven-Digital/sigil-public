import { ethers } from 'ethers';
import type { SigilSDK } from '@sigil-protocol/sdk';
import type { ElizaAction, ElizaRuntime, ElizaMessage, ElizaState } from '../types';
import { parseAddress, weiToEth, friendlyError } from '../utils';

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

export function sigilBalanceAction(sdk: SigilSDK, rpcUrl?: string): ElizaAction {
  return {
    name: 'SIGIL_BALANCE',
    description: 'Check ETH and token balances for the Sigil wallet.',
    similes: ['CHECK_BALANCE', 'WALLET_BALANCE', 'HOW_MUCH_ETH', 'TOKEN_BALANCE'],
    examples: [
      [
        { user: '{{user1}}', content: { text: 'What\'s my wallet balance?' } },
        { user: '{{agent}}', content: { text: 'Let me check your Sigil wallet balance.', action: 'SIGIL_BALANCE' } },
      ],
      [
        { user: '{{user1}}', content: { text: 'Check balance of token 0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48' } },
        { user: '{{agent}}', content: { text: 'Checking your token balance.', action: 'SIGIL_BALANCE' } },
      ],
    ],
    validate: async () => true,
    handler: async (
      _runtime: ElizaRuntime,
      message: ElizaMessage,
      _state?: ElizaState,
      _options?: Record<string, any>,
      callback?: (response: { text: string; [key: string]: any }) => void
    ) => {
      if (!rpcUrl) {
        callback?.({ text: '⚙️ RPC provider not configured. Set rpcUrl in plugin config to check balances.' });
        return false;
      }

      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const account = await sdk.getAccount();
        const address = account.address;

        // ETH balance
        const ethBalance = await provider.getBalance(address);
        let text = `💰 Sigil Wallet Balance\nAddress: ${address}\n\nETH: ${weiToEth(ethBalance.toString())} ETH`;

        // Check for token address in message
        const tokenAddress = parseAddress(message.content.text);
        if (tokenAddress) {
          try {
            const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
            const [balance, symbol, decimals] = await Promise.all([
              token.balanceOf(address),
              token.symbol().catch(() => 'TOKEN'),
              token.decimals().catch(() => 18),
            ]);
            const formatted = ethers.formatUnits(balance, decimals);
            text += `\n${symbol}: ${formatted}`;
          } catch {
            text += `\n⚠️ Could not read token at ${tokenAddress}`;
          }
        }

        callback?.({ text, address, ethBalance: ethBalance.toString() });
        return true;
      } catch (err: any) {
        callback?.({ text: friendlyError(err) });
        return false;
      }
    },
  };
}
