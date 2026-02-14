/**
 * @sigil-protocol/eliza-plugin
 *
 * Eliza AI framework plugin for Sigil Protocol.
 * Enables any Eliza agent to use a Sigil-secured wallet.
 */

export { sigilPlugin, type SigilPluginConfig } from './plugin';
export { sigilSendAction } from './actions/sigil-send';
export { sigilEvaluateAction } from './actions/sigil-evaluate';
export { sigilStatusAction } from './actions/sigil-status';
export { sigilHistoryAction } from './actions/sigil-history';
export { sigilFreezeAction } from './actions/sigil-freeze';
export { sigilUnfreezeAction } from './actions/sigil-unfreeze';
export { sigilTransferTokenAction } from './actions/sigil-transfer-token';
export { sigilBalanceAction } from './actions/sigil-balance';
export { sigilPolicyAction } from './actions/sigil-policy';
export { sigilRotateKeyAction } from './actions/sigil-rotate-key';
export { sigilTransactionEvaluator } from './evaluators/transaction-evaluator';
export { sigilWalletProvider } from './providers/wallet-provider';
export { SigilSDK } from '@sigil-protocol/sdk';
export type { SigilConfig, TransactionParams, EvaluationResult } from '@sigil-protocol/sdk';

import { sigilPlugin } from './plugin';
export default sigilPlugin;
