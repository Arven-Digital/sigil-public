<p align="center">
  <img src="brand-assets/sigil-symbol.svg" width="80" alt="Sigil Protocol" />
</p>

<h1 align="center">Sigil Protocol</h1>

<p align="center">
  <strong>Open security protocol for AI agent wallets</strong>
  <br />
  3-layer transaction validation · ERC-4337 smart accounts · Non-custodial
</p>

<p align="center">
  <a href="https://sigil.codes">Website</a> ·
  <a href="https://sigil.codes/docs">Documentation</a> ·
  <a href="https://sigil.codes/onboarding">Deploy Wallet</a> ·
  <a href="https://api.sigil.codes/v1/health">API Status</a>
</p>

---

## What is Sigil?

Sigil Protocol provides a security layer for AI agents that manage crypto wallets. Every transaction your agent attempts passes through a 3-layer validation pipeline before the Guardian co-signs:

1. **Deterministic Rules** — Spending limits, target whitelists, function selectors, velocity checks
2. **Transaction Simulation** — Full dry-run to detect reverts, unexpected state changes, drain attacks
3. **AI Risk Scoring** — LLM analyzes context, history, and target reputation (scores 0–100)

If all three layers pass, the Guardian co-signs. If any layer flags the transaction, it's blocked with guidance on why and how to fix it.

## Live on 4 Chains

| Chain | Chain ID | Factory Address |
|-------|----------|-----------------|
| **Avalanche C-Chain** | 43114 | `0x2f4dd6db7affcf1f34c4d70998983528d834b8f6` |
| **Base** | 8453 | `0x45b20a5F37b9740401a29BD70D636a77B18a510D` |
| **Arbitrum One** | 42161 | `0x20f926bd5f416c875a7ec538f499d21d62850f35` |
| **0G Mainnet** | 16661 | `0x20f926bd5f416c875a7ec538f499d21d62850f35` |

**Guardian Co-Signer:** `0xD06fBe90c06703C4b705571113740AfB104e3C67`
**EntryPoint (ERC-4337 v0.7):** `0x0000000071727De22E5E9d8BAf0edAc6f37da032`

## Architecture

```
┌──────────────────────────────────────────────┐
│                  AI Agent                     │
│  Uses session key to submit transactions      │
└────────────────┬─────────────────────────────┘
                 │ UserOperation
                 ▼
┌──────────────────────────────────────────────┐
│              Sigil API                        │
│  SIWE auth · Rate limiting · Audit logging    │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│           Guardian Service                    │
│  Layer 1: Rules  →  Layer 2: Simulation       │
│  Layer 3: AI Risk Scoring                     │
│  ───────────────────────                      │
│  APPROVE → co-sign    REJECT → guidance       │
└────────────────┬─────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────┐
│        SigilAccount (ERC-4337)               │
│  Owner · Agent Key · Guardian · Session Keys  │
│  Policy Engine · Social Recovery · Upgrades   │
└──────────────────────────────────────────────┘
```

## Packages

| Package | Description |
|---------|-------------|
| [`packages/contracts`](packages/contracts) | Solidity smart contracts (Foundry, deployed on 4 chains) |
| [`packages/sdk`](packages/sdk) | TypeScript SDK for agents |
| [`packages/eliza-plugin`](packages/eliza-plugin) | Eliza AI framework plugin (13 actions) |
| [`packages/mcp`](packages/mcp) | MCP (Model Context Protocol) server |
| [`packages/skill`](packages/skill) | [OpenClaw](https://openclaw.ai) agent skill — install via ClawdHub |
| [`packages/dashboard`](packages/dashboard) | Next.js dashboard + landing page (sigil.codes) |

> **Note:** The Guardian service and API backend are hosted infrastructure and not included in this repository. All client libraries communicate with the Guardian via `https://api.sigil.codes`.

## Quick Start

### Deploy via Dashboard

1. Visit [sigil.codes/onboarding](https://sigil.codes/onboarding)
2. Connect wallet → Sign In with Ethereum
3. Choose strategy template (Conservative / Moderate / Aggressive / DeFi Agent / NFT Agent)
4. Select chain → Generate agent key → Deploy
5. Fund your Sigil account with native tokens

### Integrate with SDK

```typescript
import { SigilSDK } from '@sigil-protocol/sdk';

const sigil = new SigilSDK({
  apiUrl: 'https://api.sigil.codes',
  accountAddress: '0xYourSigilAccount',
  agentKey: '0xAgentPrivateKey',
  chainId: 43114,
});

const result = await sigil.evaluateTransaction({
  to: '0xTarget',
  value: '100000000000000000',
  data: '0x',
});

if (result.verdict === 'APPROVED') {
  console.log('Guardian approved:', result.guardianSignature);
}
```

### Integrate with OpenClaw

Install the Sigil skill from [ClawdHub](https://clawdhub.com):

```bash
clawdhub install sigil-wallet
```

Your OpenClaw agent instantly gets secure wallet management — deploy accounts, evaluate transactions, manage session keys, freeze/unfreeze, and more. All through the 3-layer Guardian pipeline.

### Integrate with Eliza

```typescript
import { sigilPlugin } from '@sigil-protocol/eliza';

const plugin = sigilPlugin({
  apiUrl: 'https://api.sigil.codes',
  accountAddress: '0xYourSigilAccount',
  rpcUrl: 'https://api.avax.network/ext/bc/C/rpc',
});
```

### MCP Server

```bash
SIGIL_API_KEY=sgil_... SIGIL_ACCOUNT_ADDRESS=0x... npx sigil-mcp
```

## API Reference

Base URL: `https://api.sigil.codes/v1`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/auth/nonce` | Get SIWE nonce |
| `POST` | `/v1/auth/siwe` | SIWE sign-in |
| `POST` | `/v1/accounts` | Register account |
| `GET` | `/v1/accounts/:addr` | Get account info |
| `POST` | `/v1/evaluate` | Evaluate transaction |
| `PUT` | `/v1/accounts/:addr/policy` | Update policy |
| `POST` | `/v1/accounts/:addr/freeze` | Freeze account |
| `GET` | `/v1/transactions` | List transactions |
| `GET` | `/v1/audit` | Audit log |
| `GET` | `/v1/bundles` | DeFi whitelist bundles |

See [full API documentation](https://sigil.codes/docs) for complete reference.

## Security

- **Non-custodial** — Your keys never touch our servers
- **Guardian validates, never initiates** — Cannot move funds or act alone
- **Owner override** — Emergency freeze, withdraw, key rotation all work without Sigil servers
- **Extensively audited** — Multiple rounds of internal security audits + formal verification (Halmos/Z3)
- **558 contract tests** across 32 test suites, 0 failures

## Pricing

One-time deployment fee per chain. No subscriptions.

| Chain | Deploy Fee | Token |
|-------|-----------|-------|
| Avalanche | 0.2 AVAX | ~$1.80 |
| Base | 0.00006 ETH | ~$0.18 |
| Arbitrum | 0.00006 ETH | ~$0.18 |
| 0G Mainnet | 2.0 A0GI | ~$1.80 |

Transaction validation (~$0.003/tx) is absorbed by the protocol.

## Development

```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run development
pnpm dev
```

### Project Structure

```
sigil-protocol/
├── packages/
│   ├── contracts/    # Solidity smart contracts (Foundry)
│   ├── sdk/          # TypeScript SDK
│   ├── eliza-plugin/ # Eliza framework plugin
│   ├── mcp/          # MCP server
│   ├── skill/        # OpenClaw agent skill
│   └── dashboard/    # Next.js frontend (sigil.codes)
├── docs/             # Architecture & research docs
└── brand-assets/     # Logo, colors, fonts
```

## License

Proprietary — Arven Digital

---

<p align="center">
  Built by <a href="https://arven.digital">Arven Digital</a>
</p>
