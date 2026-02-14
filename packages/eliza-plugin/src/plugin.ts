/**
 * Main plugin entry — creates the Sigil plugin for Eliza framework.
 */

import { SigilSDK, type SigilConfig } from '@sigil-protocol/sdk';
import type { ElizaAction, ElizaEvaluator, ElizaProvider } from './types';
import { sigilSendAction } from './actions/sigil-send';
import { sigilEvaluateAction } from './actions/sigil-evaluate';
import { sigilStatusAction } from './actions/sigil-status';
import { sigilHistoryAction } from './actions/sigil-history';
import { sigilFreezeAction } from './actions/sigil-freeze';
import { sigilUnfreezeAction } from './actions/sigil-unfreeze';
import { sigilTransferTokenAction } from './actions/sigil-transfer-token';
import { sigilBalanceAction } from './actions/sigil-balance';
import { sigilPolicyAction } from './actions/sigil-policy';
import { sigilRotateKeyAction } from './actions/sigil-rotate-key';
import { sigilCreateSessionKeyAction, sigilRevokeSessionKeyAction, sigilSessionKeyStatusAction } from './actions/sigil-session-key';
import { sigilTransactionEvaluator } from './evaluators/transaction-evaluator';
import { sigilWalletProvider } from './providers/wallet-provider';

export interface SigilPluginConfig extends SigilConfig {
  maxRiskScore?: number;
  rpcUrl?: string;
  entryPointAddress?: string;
  bundlerUrl?: string;
  verbose?: boolean;
}

export interface SigilPluginResult {
  name: string;
  description: string;
  actions: ElizaAction[];
  evaluators: ElizaEvaluator[];
  providers: ElizaProvider[];
  getSdk: () => SigilSDK;
}

/**
 * Create the Sigil plugin for Eliza.
 */
export function sigilPlugin(config: SigilPluginConfig): SigilPluginResult {
  const sdk = new SigilSDK(config);
  const maxRisk = config.maxRiskScore ?? 60;

  if (config.rpcUrl) {
    sdk.setProvider(config.rpcUrl, config.entryPointAddress);
  }

  return {
    name: 'sigil-protocol',
    description: 'Secure AI agent wallet with 3-layer transaction validation',
    actions: [
      sigilSendAction(sdk, maxRisk, config.bundlerUrl),
      sigilEvaluateAction(sdk),
      sigilStatusAction(sdk),
      sigilHistoryAction(sdk),
      sigilFreezeAction(sdk),
      sigilUnfreezeAction(sdk),
      sigilTransferTokenAction(sdk, maxRisk, config.bundlerUrl),
      sigilBalanceAction(sdk, config.rpcUrl),
      sigilPolicyAction(sdk),
      sigilRotateKeyAction(sdk),
      sigilCreateSessionKeyAction(sdk),
      sigilRevokeSessionKeyAction(sdk),
      sigilSessionKeyStatusAction(sdk),
    ],
    evaluators: [
      sigilTransactionEvaluator(),
    ],
    providers: [
      sigilWalletProvider(sdk),
    ],
    getSdk: () => sdk,
  };
}
