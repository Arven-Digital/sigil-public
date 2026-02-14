import { ethers } from 'ethers';
import type { SigilSDK } from '@sigil-protocol/sdk';
import type { ElizaAction, ElizaRuntime, ElizaMessage, ElizaState } from '../types';
import { parseAddress, parseEthAmount, ethToWei, friendlyError } from '../utils';

export function sigilSendAction(sdk: SigilSDK, maxRisk: number, bundlerUrl?: string): ElizaAction {
  return {
    name: 'SIGIL_SEND',
    description: 'Send ETH through the Sigil-secured wallet. Transaction goes through 3-layer security validation before execution.',
    similes: ['SEND_ETH', 'TRANSFER_ETH', 'PAY_ETH', 'SEND_ETHER', 'SIGIL_TRANSFER'],
    examples: [
      [
        { user: '{{user1}}', content: { text: 'Send 0.1 ETH to 0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28' } },
        { user: '{{agent}}', content: { text: 'I\'ll send 0.1 ETH to that address through Sigil.', action: 'SIGIL_SEND' } },
      ],
      [
        { user: '{{user1}}', content: { text: 'Pay 0x1234567890abcdef1234567890abcdef12345678 1 ETH' } },
        { user: '{{agent}}', content: { text: 'Processing 1 ETH transfer through Sigil security.', action: 'SIGIL_SEND' } },
      ],
    ],
    validate: async (_runtime: ElizaRuntime, message: ElizaMessage) => {
      const text = message.content.text;
      return !!parseAddress(text) && !!parseEthAmount(text);
    },
    handler: async (
      _runtime: ElizaRuntime,
      message: ElizaMessage,
      _state?: ElizaState,
      _options?: Record<string, any>,
      callback?: (response: { text: string; [key: string]: any }) => void
    ) => {
      const text = message.content.text;
      const target = parseAddress(text);
      const amount = parseEthAmount(text);

      if (!target || !amount) {
        callback?.({ text: '❌ Please provide both a target address and an ETH amount.' });
        return false;
      }

      // L2 fix: Strict input validation before passing to SDK
      if (!/^0x[0-9a-fA-F]{40}$/.test(target)) {
        callback?.({ text: '❌ Invalid Ethereum address format.' });
        return false;
      }
      if (isNaN(Number(amount)) || Number(amount) <= 0) {
        callback?.({ text: '❌ Invalid ETH amount — must be a positive number.' });
        return false;
      }

      // M4 fix: Require explicit confirmation for high-value transactions
      const HIGH_VALUE_THRESHOLD = 0.5; // ETH
      if (Number(amount) >= HIGH_VALUE_THRESHOLD) {
        // Check if this is a confirmed follow-up (look for confirmation keywords)
        const confirmKeywords = ['yes', 'confirm', 'approve', 'proceed', 'do it', 'send it'];
        const isConfirmation = confirmKeywords.some(k => text.toLowerCase().includes(k));
        if (!isConfirmation) {
          callback?.({
            text: `⚠️ High-value transaction: **${amount} ETH** to \`${target}\`.\n\nPlease confirm by saying "yes, send it" to proceed.`,
          });
          return false;
        }
      }

      try {
        const weiValue = ethToWei(amount);
        const result = await sdk.evaluate({ target, value: weiValue });

        if (result.verdict === 'REJECTED') {
          callback?.({
            text: `🚫 Transaction rejected: ${result.rejectionReason ?? 'Policy violation'}\nRisk score: ${result.riskScore}/100`,
            verdict: 'REJECTED',
            riskScore: result.riskScore,
          });
          return false;
        }

        if (result.riskScore > maxRisk) {
          callback?.({
            text: `⚠️ Risk score ${result.riskScore} exceeds threshold ${maxRisk}. Transaction blocked.`,
            verdict: 'RISK_TOO_HIGH',
            riskScore: result.riskScore,
          });
          return false;
        }

        // Build and submit UserOp
        const userOp = await sdk.buildUserOp({ target, value: weiValue });

        if (bundlerUrl) {
          // Submit to bundler
          const bundlerResult = await submitToBundler(bundlerUrl, userOp, result.guardianSignature);
          callback?.({
            text: `✅ Transaction submitted!\nAmount: ${amount} ETH → ${target}\nRisk score: ${result.riskScore}/100\nUserOp hash: ${bundlerResult.userOpHash}`,
            verdict: 'APPROVED',
            riskScore: result.riskScore,
            userOpHash: bundlerResult.userOpHash,
          });
        } else {
          callback?.({
            text: `✅ Transaction approved and signed!\nAmount: ${amount} ETH → ${target}\nRisk score: ${result.riskScore}/100\n⚠️ No bundler configured — UserOp ready for external submission.`,
            verdict: 'APPROVED',
            riskScore: result.riskScore,
            userOp,
            guardianSignature: !!result.guardianSignature,
          });
        }

        return true;
      } catch (err: any) {
        callback?.({ text: friendlyError(err) });
        return false;
      }
    },
  };
}

async function submitToBundler(
  bundlerUrl: string,
  userOp: any,
  guardianSignature?: string
): Promise<{ userOpHash: string }> {
  // Combine agent + guardian signatures for multi-sig validation
  const combinedSig = guardianSignature
    ? ethers.concat([userOp.signature, guardianSignature])
    : userOp.signature;

  const response = await fetch(bundlerUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_sendUserOperation',
      params: [
        { ...userOp, signature: combinedSig },
        '0x0000000071727De22E5E9d8BAf0edAc6f37da032', // EntryPoint v0.7
      ],
    }),
  });

  const data = await response.json() as any;
  if (data.error) {
    throw new Error(`Bundler error: ${data.error.message}`);
  }
  return { userOpHash: data.result };
}
