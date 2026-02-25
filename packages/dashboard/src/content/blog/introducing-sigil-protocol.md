---
title: "Introducing Sigil Protocol — Agent Wallets, On a Leash"
date: "2026-02-14"
excerpt: "Sigil Protocol brings 3-layer Guardian validation to AI agent wallets. Live on Avalanche, Base, Arbitrum, Polygon, and 0G — with integrations for OpenClaw, Eliza, SDK, and MCP."
author: "Sigil Team"
tags: ["announcement", "Sigil Protocol", "launch"]
---

# Introducing Sigil Protocol — Agent Wallets, On a Leash

Today we're publicly introducing Sigil Protocol: a 3-layer security pipeline for AI agent wallets, live on five EVM chains.

Sigil gives autonomous AI agents smart accounts with Guardian validation. Every transaction your agent submits passes through deterministic rules, transaction simulation, and AI risk scoring — all before a single wei moves. If any layer flags the transaction, it's blocked.

No subscriptions. Non-custodial. Open source.

## The Problem We're Solving

AI agents are increasingly managing real money — trading, providing liquidity, minting, bridging. But the standard approach of handing an agent a raw private key is fundamentally broken. There's no spending limit, no oversight, no kill switch.

We built Sigil because we needed it ourselves. We wanted agents that could operate autonomously without unlimited, irrevocable access to funds.

## How the 3-Layer Pipeline Works

Every transaction your agent submits goes through three sequential validation layers:

### Layer 1: Deterministic Rules

Fast, free, absolute. The policy engine checks every transaction against your configured rules:

- Spending limits (per-tx and daily)
- Target contract whitelist
- Function selector whitelist
- Token allowance policies
- Velocity checks

If a transaction violates any rule, it's rejected immediately. No simulation needed, no API calls.

### Layer 2: Transaction Simulation

Transactions that pass Layer 1 are dry-run against the current chain state. This catches:

- Reverts and edge-case failures
- Unexpected token approvals or transfers
- Sandwich attack setups
- Value drain beyond expected amounts

Simulation adds ~200ms and costs approximately $0.002 per transaction.

### Layer 3: AI Risk Scoring

The final layer uses an LLM to analyze the transaction in its full context — target reputation, historical patterns, calldata analysis. It produces a risk score from 1 to 100.

If the score exceeds your configured threshold, the transaction is blocked. This layer catches the subtle, contextual risks that deterministic rules and simulation can miss.

Total validation time: ~700ms. Total cost: ~$0.003 per transaction, absorbed by the protocol.

## Live on 5 Chains

Sigil is deployed and operational on:

- **Avalanche** — 0.2 AVAX deployment fee
- **Base** — 0.00006 ETH deployment fee
- **Arbitrum** — 0.00006 ETH deployment fee
- **Polygon** — 10 POL deployment fee (ideal for Polymarket agents)
- **0G Mainnet** — 2.0 A0GI deployment fee

All chains use the same smart contract architecture with chain-specific optimizations. Deploy on one chain in about 60 seconds.

### Polymarket Integration

Polygon deployment unlocks prediction market use cases. Deploy a Sigil wallet, whitelist verified Polymarket contracts (CTF Exchange, Conditional Tokens), and let your agent trade with guardrails — bet limits, daily caps, and an emergency kill switch.

## Integration Options

We've built Sigil to drop into whatever stack you're already using:

### OpenClaw Skill (Verified on ClawdHub)

```
clawdhub install sigil-security
```

One command gives your OpenClaw agent full access to Sigil — deploy accounts, evaluate transactions, manage session keys, configure policies. The skill is [verified on ClawdHub](https://clawhub.ai/skills/sigil-security).

### Eliza Plugin

```
npm install @sigil-protocol/eliza
```

13 actions, a transaction evaluator, and a wallet provider. Plug into any Eliza agent and start validating transactions immediately.

### TypeScript SDK

```typescript
import { SigilSDK } from '@sigil-protocol/sdk';

const sigil = new SigilSDK({ chainId: 43114 });
const result = await sigil.evaluate(transaction);
```

Full programmatic access to everything — session keys, recovery, upgrades, policies, multicall.

### MCP Server

Model Context Protocol tools for any AI agent framework. Connect via stdio or HTTP and access all Sigil operations through standardized tool interfaces.

### REST API

```
POST https://api.sigil.codes/v1/evaluate
```

For frameworks that don't have a native plugin yet, the REST API gives you full access to evaluation and account management.

## What's Included

Every deployment includes:

- **ERC-4337 smart account** with Guardian co-signer
- **Session key management** — issue, rotate, revoke
- **5 strategy templates** — Conservative to Aggressive
- **Emergency freeze & withdrawal** — owner-only on-chain controls
- **Social recovery** — N-of-M guardian recovery with configurable delay
- **UUPS upgradability** — 24h timelock + guardian co-sign
- **Full API/SDK access** — no feature gating, no tiers

One-time deployment fee. No monthly subscriptions. Validation costs absorbed by the protocol — you only pay gas.

## Non-Custodial by Design

This is worth emphasizing: Sigil never touches your keys.

The Guardian validates transactions — it doesn't control wallets. It can only co-sign transactions that pass all three security layers. It cannot initiate transactions, move funds, or act unilaterally.

If our servers went offline tomorrow, your wallet still works. You retain full owner control through on-chain functions — freeze, withdraw, rotate keys, recover.

## Open Source

The smart contracts, SDK, and Eliza plugin are open source:

**[github.com/Arven-Digital/sigil-public](https://github.com/Arven-Digital/sigil-public)**

We believe security infrastructure should be auditable. Read the code, verify the contracts, run your own tests.

## Getting Started

Deploying a Sigil-secured wallet takes about 60 seconds:

1. **Connect** your wallet (MetaMask, WalletConnect, or any EVM wallet)
2. **Choose** a strategy template and target chain
3. **Deploy** — your smart account is created via CREATE2
4. **Issue a session key** for your agent
5. **Done** — Guardian starts validating immediately

[Deploy your first wallet →](/onboarding)

Or if you prefer code:

```
clawdhub install sigil-security
```

---

*Sigil Protocol is built by [Arven Digital](https://arven.digital). Follow [@xsigil](https://x.com/xsigil) for updates.*
