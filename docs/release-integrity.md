# Public Release Integrity Gate

`pnpm gate:release` (`scripts/release-integrity.mjs`, wired into CI after
`proof:public`) enforces the mechanical invariants a public release must hold
and surfaces the decisions a human must make before publishing. It is
deterministic and offline, and never publishes, tags, or pushes anything.

## Hard checks (fail CI)

- **Package repository metadata** — every publishable (`private: false`)
  package points its `repository` at `Arven-Digital/sigil-public` with the
  correct `directory`.
- **Publish config** — every scoped (`@sigil-protocol/*`) publishable package
  sets `publishConfig.access: "public"`, so `npm publish` cannot default to
  private or error.
- **SECURITY.md** present at the repo root.
- **Secret-boundary scan** — the tracked tree carries no secret-shaped
  material (OpenAI/GitHub/AWS/Slack keys, PEM private-key blocks, bearer
  tokens, or a 64-hex value assigned to a secret-named variable). Test suites,
  deploy scripts, and `.env.example` are excluded, and the well-known Anvil
  default key is allowlisted. This backs the security posture the README and
  `docs/security-architecture.md` describe.
- **On-chain address drift** — the factory + guardian addresses in
  `packages/dashboard/src/lib/contracts.ts` (the source of truth) all appear
  verbatim in `README.md`, so public docs cannot silently drift from the
  deployed set.

## Release decisions (reported, do NOT block CI)

These require a human/legal sign-off before any publish; the gate refuses to
invent an answer:

- **Licensing.** `README.md` declares the project **"Proprietary — Arven
  Digital"**, but `@sigil-protocol/sdk` declares **`"license": "MIT"`** and
  `@sigil-protocol/mcp` / `@sigil-protocol/eliza-plugin` declare no license at
  all. There is no root `LICENSE` file. Publishing the SDK as MIT would grant
  MIT rights to code the README calls proprietary — a real integrity risk.
  **Before public release, a human must decide the license and make every
  publishable package, the root `LICENSE`, and the README agree.**

## Human-gated (not covered here)

Actual npm publishing, git tagging, and release-branch creation remain manual,
human-approved steps. This gate makes them *safe to perform* by catching the
integrity failures first; it performs none of them.
