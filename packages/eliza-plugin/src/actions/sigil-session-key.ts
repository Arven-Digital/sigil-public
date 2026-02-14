import type { SigilSDK } from '@sigil-protocol/sdk';
import type { ElizaAction, ElizaRuntime, ElizaMessage, ElizaState } from '../types';
import { friendlyError } from '../utils';

export function sigilCreateSessionKeyAction(sdk: SigilSDK): ElizaAction {
  return {
    name: 'SIGIL_CREATE_SESSION_KEY',
    description: 'Create a time-limited session key for an AI agent with scoped permissions.',
    similes: ['CREATE_SESSION', 'ADD_SESSION_KEY', 'GRANT_TEMP_ACCESS'],
    examples: [
      [
        { user: '{{user1}}', content: { text: 'Create a session key for my trading bot, valid for 4 hours with 1 ETH spend limit' } },
        { user: '{{agent}}', content: { text: '🔑 Creating session key with 4h validity and 1 ETH limit...', action: 'SIGIL_CREATE_SESSION_KEY' } },
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
      try {
        const { key, validUntil, spendLimit, maxTxValue, cooldown, allowAllTargets } = message.content;
        if (!key || !validUntil) {
          callback?.({ text: '❌ Missing required fields: key (address) and validUntil (unix timestamp)' });
          return false;
        }
        const result = await sdk.createSessionKey({
          key,
          validUntil: Number(validUntil),
          spendLimit: spendLimit ?? '0',
          maxTxValue: maxTxValue ?? '0',
          cooldown: cooldown ?? 0,
          allowAllTargets: allowAllTargets ?? true,
        });
        callback?.({
          text: `🔑 Session key created!\n• Session ID: ${result.sessionId}\n• Key: ${result.key}\n• Valid until: ${new Date(result.validUntil * 1000).toISOString()}\n• TX: ${result.txHash}`,
          sessionId: result.sessionId,
          txHash: result.txHash,
        });
        return true;
      } catch (err: any) {
        callback?.({ text: friendlyError(err) });
        return false;
      }
    },
  };
}

export function sigilRevokeSessionKeyAction(sdk: SigilSDK): ElizaAction {
  return {
    name: 'SIGIL_REVOKE_SESSION_KEY',
    description: 'Revoke a session key immediately.',
    similes: ['REVOKE_SESSION', 'REMOVE_SESSION_KEY', 'REVOKE_ACCESS'],
    examples: [
      [
        { user: '{{user1}}', content: { text: 'Revoke session key #1' } },
        { user: '{{agent}}', content: { text: '🚫 Revoking session key...', action: 'SIGIL_REVOKE_SESSION_KEY' } },
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
      try {
        const sessionId = Number(message.content.sessionId ?? message.content.text?.match(/\d+/)?.[0]);
        if (!sessionId) {
          callback?.({ text: '❌ Please specify the session ID to revoke.' });
          return false;
        }
        const txHash = await sdk.revokeSessionKey(sessionId);
        callback?.({
          text: `🚫 Session key #${sessionId} revoked.\nTX: ${txHash}`,
          revoked: true,
        });
        return true;
      } catch (err: any) {
        callback?.({ text: friendlyError(err) });
        return false;
      }
    },
  };
}

export function sigilSessionKeyStatusAction(sdk: SigilSDK): ElizaAction {
  return {
    name: 'SIGIL_SESSION_KEY_STATUS',
    description: 'Check the status of a session key.',
    similes: ['SESSION_STATUS', 'CHECK_SESSION', 'SESSION_INFO'],
    examples: [
      [
        { user: '{{user1}}', content: { text: 'Check session key #1 status' } },
        { user: '{{agent}}', content: { text: '🔍 Checking session key...', action: 'SIGIL_SESSION_KEY_STATUS' } },
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
      try {
        const sessionId = Number(message.content.sessionId ?? message.content.text?.match(/\d+/)?.[0]);
        if (!sessionId) {
          callback?.({ text: '❌ Please specify the session ID.' });
          return false;
        }
        const info = await sdk.getSessionKey(sessionId);
        const status = info.revoked ? '🚫 Revoked' : info.isActive ? '✅ Active' : '⏸️ Inactive';
        callback?.({
          text: `🔑 Session Key #${sessionId}\n• Status: ${status}\n• Key: ${info.key}\n• Valid: ${new Date(info.validAfter * 1000).toISOString()} → ${new Date(info.validUntil * 1000).toISOString()}\n• Spent: ${info.spent} / ${info.spendLimit}\n• Per-TX limit: ${info.maxTxValue}\n• All targets: ${info.allowAllTargets ? 'Yes' : 'No'}`,
          ...info,
        });
        return true;
      } catch (err: any) {
        callback?.({ text: friendlyError(err) });
        return false;
      }
    },
  };
}
