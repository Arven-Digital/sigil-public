# Sigil Protocol — Full API Reference

Base URL: `https://api.sigil.codes/v1`

## Authentication Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/agent/delegation-info` | EIP-712 domain & types for delegation signing |
| `POST` | `/agent/auth/api-key` | Authenticate with API key → JWT |
| `POST` | `/agent/auth/delegation` | Authenticate with delegation signature → JWT |

**Token:** JWT Bearer, 4h lifetime, audience `sigil-agent`. Re-auth with same credentials when expired.

## Setup Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/agent/setup/wizard` | Interactive setup guide (7 questions, 5 profiles, tips) |
| `POST` | `/agent/setup` | Guided setup → returns ordered contract calls |
| `POST` | `/agent/wallets/deploy` | Get deployment config |
| `POST` | `/agent/wallets/register` | Register deployed wallet in Guardian DB |

## Wallet Management

| Method | Endpoint | Scope | Description |
|--------|----------|-------|-------------|
| `GET` | `/agent/wallets/:addr` | `wallet:read` | Full wallet status (balance, policy, keys, spend) |
| `PUT` | `/agent/wallets/:addr/policy` | `policy:write` | Update spending policy |
| `POST` | `/agent/wallets/:addr/targets` | `targets:write` | Add/remove target whitelist entries |
| `POST` | `/agent/wallets/:addr/functions` | `targets:write` | Add/remove function selector whitelist |
| `POST` | `/agent/wallets/:addr/session-keys` | `session-keys:write` | Create session key |
| `POST` | `/agent/wallets/:addr/token-policies` | `policy:write` | Set per-token approval/transfer limits |

## API Key Management (requires owner SIWE auth, not agent token)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/agent/keys` | Generate new agent API key |
| `GET` | `/agent/keys` | List agent API keys |
| `DELETE` | `/agent/keys/:id` | Revoke an API key |

## Audit

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/audit?account=0x...` | Transaction evaluation history |

## Guardian — 3-Layer Pipeline

### Layer 1: Deterministic Rules
Checks: per-tx value limit, daily velocity limit, target whitelist, function selector whitelist, token approval caps, token daily transfer limits. Instant pass/fail.

### Layer 2: Simulation
Dry-runs the transaction via Tenderly. Checks for: reverts, unexpected ETH/token balance changes, storage slot modifications. Returns `SAFE` or `UNSAFE` with details.

### Layer 3: LLM Risk Scoring
AI (gpt-4o-mini) analyzes the transaction in context of recent history. Scores 0-100. Below 70 = APPROVE, above = REJECT/ESCALATE. Considers: unusual patterns, large deviations from history, known attack vectors.

### Verdicts
- **APPROVE** — All 3 layers passed. Guardian co-signs.
- **REJECT** — Failed one or more layers. Returns `guidance` object: `{ reason, suggestion, layer }`.
- **ESCALATE** — Needs owner approval (high-value or ambiguous).

### Co-Signing Tiers
- **LOW** (below `guardianThreshold`): Agent signs alone
- **MEDIUM** (above `guardianThreshold`): Agent + Guardian co-sign
- **HIGH** (above `ownerThreshold`): Agent + Guardian + Owner all sign

## DeFi Whitelist Bundles

Pre-curated protocol bundles for common DeFi operations:

| Bundle | Protocols | Use Case |
|--------|-----------|----------|
| `avalanche-dex` | Trader Joe, Pangolin | Token swaps |
| `avalanche-lending` | Aave V3, Benqi | Lending/borrowing |
| `avalanche-staking` | Benqi sAVAX, ggAVAX | Liquid staking |
| `avalanche-bridge` | Stargate, LayerZero | Cross-chain bridges |
| `avalanche-stablecoin` | USDC, USDT, DAI | Stablecoin operations |
| `avalanche-nft` | Joepegs, Campfire | NFT marketplace |

Users toggle bundles on the Policy page at `app.sigil.codes/dashboard/policy`.

## Contract Addresses

### Avalanche Mainnet (43114)
- Factory: `0x9f934B9EeAC00ab28d0B37b957fE90471162167B`
- Implementation: `0x123f3644D645778A425ffe0255fD8fD069F36270`

### Avalanche Fuji Testnet (43113)
- Factory: `0x86E85dE25473b432dabf1B9E8e8CE5145059b85b`
- Implementation: `0x93c3b3E4F29Aa8693556FE06282BBda547e6D863`

### Shared
- EntryPoint (v0.7): `0x0000000071727De22E5E9d8BAf0edAc6f37da032`
- Guardian: `0xD06fBe90c06703C4b705571113740AfB104e3C67`

## Smart Account Features

- **ERC-4337** compatible (Account Abstraction)
- **Social Recovery** — N-of-M guardian recovery with 48h delay
- **UUPS Upgradeable** — 24h timelock + guardian co-sign
- **Signature Validation** — ERC-1271 for on-chain signature verification
- **Freeze/Emergency** — Owner can freeze instantly; emergency withdrawals still work when frozen

## Error Handling

All errors return:
```json
{ "error": "error_code", "message": "Human-readable description" }
```

Common codes:
- `unauthorized` — Token expired or invalid
- `forbidden` — Insufficient scope
- `not_found` — Wallet not registered
- `policy_violation` — Transaction exceeds policy limits
- `guardian_rejected` — Failed Guardian evaluation (check `guidance`)
- `rate_limited` — Too many requests (wait and retry)
