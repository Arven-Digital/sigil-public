/**
 * Eliza framework compatible types for Sigil plugin.
 *
 * These mirror the ElizaOS action/evaluator/provider interfaces
 * so the plugin works as a drop-in.
 */

import type { SigilConfig } from '@sigil-protocol/sdk';

export interface SigilPluginConfig extends SigilConfig {
  /** Auto-reject transactions above this risk score (0-100) */
  maxRiskScore?: number;
  /** RPC URL for on-chain operations (nonce, balance) */
  rpcUrl?: string;
  /** EntryPoint contract address override */
  entryPointAddress?: string;
  /** Bundler RPC URL for UserOp submission */
  bundlerUrl?: string;
  /** Log all evaluations */
  verbose?: boolean;
}

/** Eliza-compatible message */
export interface ElizaMessage {
  content: { text: string; [key: string]: any };
  userId?: string;
  roomId?: string;
}

/** Eliza-compatible memory */
export interface ElizaMemory {
  content: { text: string; [key: string]: any };
}

/** Eliza-compatible state */
export interface ElizaState {
  [key: string]: any;
}

/** Eliza-compatible runtime */
export interface ElizaRuntime {
  getSetting: (key: string) => string | undefined;
  composeState: (message: ElizaMessage) => Promise<ElizaState>;
  [key: string]: any;
}

/** Eliza action handler signature */
export type ElizaHandler = (
  runtime: ElizaRuntime,
  message: ElizaMessage,
  state?: ElizaState,
  options?: Record<string, any>,
  callback?: (response: { text: string; [key: string]: any }) => void
) => Promise<boolean>;

/** Eliza action validate signature */
export type ElizaValidate = (
  runtime: ElizaRuntime,
  message: ElizaMessage
) => Promise<boolean>;

/** Eliza-compatible action */
export interface ElizaAction {
  name: string;
  description: string;
  similes: string[];
  examples: Array<Array<{ user: string; content: { text: string; action?: string } }>>;
  validate: ElizaValidate;
  handler: ElizaHandler;
}

/** Eliza-compatible evaluator */
export interface ElizaEvaluator {
  name: string;
  description: string;
  similes: string[];
  examples: Array<Array<{ user: string; content: { text: string } }>>;
  validate: ElizaValidate;
  handler: ElizaHandler;
}

/** Eliza-compatible provider */
export interface ElizaProvider {
  name: string;
  description: string;
  get: (runtime: ElizaRuntime, message: ElizaMessage, state?: ElizaState) => Promise<string>;
}
