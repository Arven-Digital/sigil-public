# Sigil Security Architecture

Sigil is designed for AI agents that need wallet access without unchecked signing authority.

## Actors

| Actor | Holds | Can do | Cannot do |
|---|---|---|---|
| Owner | Human/operator wallet key | deploy, freeze/unfreeze, rotate agent key, emergency withdraw, recover ownership | be bypassed by the agent or Guardian |
| Agent | Agent EOA private key | propose/sign ERC-4337 UserOperations | execute alone, override policy, change owner |
| Guardian | Hosted Sigil co-signer key | co-sign approved UserOperations after validation | initiate transactions, spend alone, change policy/owner |
| SigilAccount V12 | On-chain smart account | enforce signatures, policy, freeze, recovery, upgrades | trust off-chain services blindly |

## Validation path

```text
Agent intent
  ↓
SDK / plugin builds UserOperation
  ↓
Hosted API authenticates request and records audit context
  ↓
Guardian evaluates policy/simulation/risk
  ↓
Guardian co-signs only if approved
  ↓
SigilAccount validates signatures and on-chain constraints
  ↓
EntryPoint executes UserOperation
```

## Layer 1 — deterministic policy

Deterministic checks are intentionally boring:

- account frozen state;
- target allow/block lists;
- function selector allow lists;
- per-transaction value limit;
- daily/weekly velocity limits;
- token allowance policies;
- session-key validity and spend windows.

These checks should be testable without LLMs or network services.

## Layer 2 — transaction simulation

Simulation is a preflight defense against:

- obvious reverts;
- unexpected state changes;
- token drains;
- malicious approval flows;
- incompatible calldata.

If a simulation provider is unavailable, production behavior must be explicit and observable. Silent fallback is not acceptable for security-sensitive paths.

## Layer 3 — risk scoring

Risk scoring considers contextual signals that deterministic policy cannot capture by itself:

- unfamiliar counterparties;
- unusual value relative to policy;
- high-risk selectors;
- known-bad addresses or protocol behavior;
- user/agent history.

The public proof script uses a deterministic stand-in model. It is not the production LLM/risk implementation; it documents the expected decision semantics without exposing private infrastructure.

## On-chain enforcement boundaries

The smart account enforces the final boundary:

- agent transactions require the expected signatures;
- owner controls emergency functions;
- owner-transfer delay and timelock reduce key-compromise blast radius;
- UUPS upgrades are guarded;
- factory deployment fees are capped and visible on-chain.

## Public/private split

This public repo includes contracts, SDK, dashboard, Eliza plugin, MCP integration surface, and public proof docs.

Private production-only materials are intentionally excluded:

- API server internals;
- Guardian service internals;
- production secrets/env files;
- database dumps/logs;
- infrastructure credentials;
- private monitoring configuration.



That split is deliberate. Public proof should show enough for integrators and reviewers to reason about the system without publishing keys or operational attack surface.
