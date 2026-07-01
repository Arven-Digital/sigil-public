<p align="center">
  <img src="brand-assets/sigil-symbol.svg" width="80" alt="Sigil Protocol" />
</p>

<h1 align="center">Sigil Protocol</h1>

<p align="center">
  <strong>Security layer for AI-agent wallets</strong>
  <br />
  ERC-4337 smart accounts · Guardian co-signing · policy-first transaction validation
</p>

<p align="center">
  <a href="https://sigil.codes">Website</a> ·
  <a href="https://sigil.codes/docs">Docs</a> ·
  <a href="https://sigil.codes/onboarding">Deploy Wallet</a> ·
  <a href="https://api.sigil.codes/v1/health">API Health</a>
</p>

---

## What is Sigil?

Sigil gives AI agents a wallet they can use without giving them unchecked access to funds.

A Sigil account has:

1. **Owner key** — the human/operator key with emergency authority.
2. **Agent key** — the key an AI agent uses to propose UserOperations.
3. **Guardian co-signer** — Sigil's validation service, which co-signs only after policy checks pass.

The public repository contains the integration surface and verifiable proof artifacts. The hosted API and Guardian service run at `api.sigil.codes`; their production secrets and infrastructure config are not in this repo.

## Live V12 deployments

All six V12 factory deployments were verified by public RPC with `eth_getCode`, `deployFee()`, and `owner()`.

| Chain | Chain ID | Factory | Deploy fee |
|---|---:|---|---:|
| Ethereum | `1` | `0x20f926bd5f416c875a7ec538f499d21d62850f35` | `0.003 ETH` |
| Polygon | `137` | `0x483D6e4e203771485aC75f183b56D5F5cDcbe679` | `10 POL` |
| Avalanche C-Chain | `43114` | `0x86e85de25473b432dabf1b9e8e8ce5145059b85b` | `0.5 AVAX` |
| Base | `8453` | `0x5729291ed4c69936f5b5ace04dee454c6838fd50` | `0.003 ETH` |
| Arbitrum One | `42161` | `0x2f4dd6db7affcf1f34c4d70998983528d834b8f6` | `0.003 ETH` |
| 0G Mainnet | `16661` | `0x8bAD12A489338B533BCA3B19138Cd61caA17405F` | `1 A0GI` |

| Contract role | Address |
|---|---|
| Guardian co-signer | `0xD06fBe90c06703C4b705571113740AfB104e3C67` |
| Factory owner / treasury | `0xEC0D6435fFA48E33cf39c56f21A0cCFB9b50Ad45` |
| ERC-4337 EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |

## Repository contents

| Path | Purpose |
|---|---|
| [`packages/contracts`](packages/contracts) | Solidity smart account and factory contracts plus Foundry tests/artifacts. |
| [`packages/dashboard`](packages/dashboard) | Next.js public site, dashboard, docs, on-chain smoke tests. |
| [`packages/sdk`](packages/sdk) | TypeScript SDK for agent integrations. |
| [`packages/eliza-plugin`](packages/eliza-plugin) | Eliza plugin backed by the SDK. |
| [`packages/mcp`](packages/mcp) | MCP server integration surface. |
| [`packages/skill`](packages/skill) | OpenClaw/agent skill metadata. |
| [`docs`](docs) | Public integration notes and architecture/proof docs. |

Private production source that is intentionally **not** part of this public repo:

- API server internals
- Guardian service internals
- production environment files, keys, tokens, DB dumps, logs, or infrastructure secrets

## Architecture

```text
AI Agent
  │ signs UserOperation with agent key
  ▼
Sigil SDK / Eliza / MCP
  │ authenticates to hosted API
  ▼
Sigil API (hosted)
  │ SIWE/API-key auth, rate limits, audit logging
  ▼
Guardian service (hosted)
  │ deterministic policy checks → simulation → risk scoring
  ▼
SigilAccount V12 (ERC-4337)
  │ executes only with required signatures and policy constraints
  ▼
Target protocol / recipient
```

The Guardian can co-sign approved transactions. It cannot initiate transactions, change ownership, drain funds, or bypass owner-only emergency controls.

## Quick start

### Deploy a wallet

1. Open [sigil.codes/onboarding](https://sigil.codes/onboarding).
2. Connect an EVM wallet and sign in.
3. Choose a supported chain and policy template.
4. Generate the agent key locally and save it securely. It is shown once.
5. Deploy the smart account and fund both the smart account and agent EOA with native gas token.

### SDK

```bash
npm install @sigil-protocol/sdk ethers
```

```ts
import { SigilSDK } from '@sigil-protocol/sdk';

const sigil = new SigilSDK({
  apiUrl: 'https://api.sigil.codes',
  apiKey: 'sgil_your_api_key',
  accountAddress: '0xYourSigilAccount',
  agentPrivateKey: '0xYourAgentPrivateKey',
  chainId: 137,
});

const result = await sigil.evaluateTransaction({
  target: '0xTargetContract',
  value: 0n,
  data: '0x',
});

if (result.verdict === 'APPROVED') {
  console.log('Guardian approved:', result.guardianSignature);
}
```

For HSM/KMS custody, pass a custom signer function as `agentPrivateKey` instead of a raw key string.

### Eliza plugin

```bash
npm install @sigil-protocol/eliza-plugin @sigil-protocol/sdk
```

```ts
import { sigilPlugin } from '@sigil-protocol/eliza-plugin';

const plugin = sigilPlugin({
  apiUrl: 'https://api.sigil.codes',
  apiKey: 'sgil_your_api_key',
  accountAddress: '0xYourSigilAccount',
  agentPrivateKey: '0xYourAgentPrivateKey',
  chainId: 137,
  rpcUrl: 'https://polygon-rpc.com',
});
```

### MCP server

```bash
SIGIL_API_KEY=sgil_... \
SIGIL_ACCOUNT_ADDRESS=0x... \
SIGIL_AGENT_PRIVATE_KEY=0x... \
SIGIL_CHAIN_ID=137 \
npx sigil-mcp
```

## Public proof commands

```bash
pnpm install --frozen-lockfile
pnpm audit --audit-level high
pnpm test
pnpm build
pnpm lint
pnpm proof:public
```

`pnpm proof:public` runs deterministic, no-network public checks that:

- exercise the documented Guardian decision model with approved/rejected cases;
- verify the README does not claim private API/Guardian source lives in the public package list;
- verify the documented V12 factories remain present in the dashboard contract config.

The dashboard test suite also performs live read-only HTTP/RPC checks against public endpoints and on-chain factories.

## Security model

- **Non-custodial:** Sigil never needs the owner key or agent private key.
- **Policy-first:** per-tx, daily, target, selector, token allowance, freeze, and recovery rules are enforced on-chain and by Guardian preflight.
- **Guardian constrained:** Guardian validates and co-signs; it cannot initiate transactions alone.
- **Owner escape hatch:** owner-only emergency controls remain usable if hosted services are unavailable.
- **No secrets in public repo:** examples use placeholders only; CI performs added-line secret scans before release.

See [`docs/security-architecture.md`](docs/security-architecture.md) and [`docs/public-proof.md`](docs/public-proof.md).

## Development

```bash
pnpm install --frozen-lockfile
pnpm test
pnpm build
pnpm lint
```

Node `>=20` and pnpm `10.28.x` are expected.

## License

Proprietary — Arven Digital

---

<p align="center">
  Built by <a href="https://arven.digital">Arven Digital</a>
</p>
