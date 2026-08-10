#!/usr/bin/env node
// Secret scanner for the Sigil private monorepo.
//
// Fails CI when a commit introduces a plaintext credential: a real EVM private
// key, a Sigil/vendor API key, a PEM key, or a service-role JWT. It deliberately
// tolerates the things that legitimately look key-shaped in this repo — keccak
// topics, bytecode/manifest hashes, storage slots, salts, well-known Anvil test
// keys, and the documented public honeypot key — so a green run means "no NEW
// secret", not "no 64-hex string anywhere".
//
// Scope: scans git-tracked files in the working tree (the PR's tree). It does
// NOT rewrite history; keys already committed in past history still require
// rotation + a history scrub, tracked separately.
//
// Suppress a single deliberate line with a trailing `secret-scan-allow` comment.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();

// ── Files we never scan ─────────────────────────────────────────────────────
const SKIP_DIRS = ['node_modules/', 'dist/', 'build/', '.next/', 'coverage/', 'out/', '.turbo/', 'lib/'];
const SKIP_EXT = new Set([
  '.lock', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.svg', '.pdf',
  '.woff', '.woff2', '.ttf', '.eot', '.wasm', '.gz', '.zip', '.mp4', '.node',
]);
const SKIP_FILES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock', 'foundry.lock']);
const MAX_BYTES = 2 * 1024 * 1024; // skip files > 2MB (build artifacts / vendored blobs)

// ── Allowlisted values (public / test-only, never secret) ───────────────────
const ALLOW_VALUES = new Set([
  // Anvil / Hardhat well-known deterministic test keys (accounts 0-9). Public by design.
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  // Documented public honeypot / bug-bounty key (packages/skill/SKILL.md).
  '0x177fbce08840d4b9a32d8e4f33b93ed817262ac2e208f96449e5ea4570006c5b',
]);

// Placeholder / low-entropy patterns that are obviously not real secrets.
const PLACEHOLDER_HEX = [
  /^0x0+$/i,                                  // all zeros
  /1234567890(1234567890)+/,                  // sequential filler
  /^0x(dead|beef|cafe|babe|feed|face)+/i,     // deadbeef-style
];

function isPlaceholderHex(hex) {
  const lower = hex.toLowerCase();
  if (ALLOW_VALUES.has(lower)) return true;
  const body = lower.slice(2);
  const zeros = (body.match(/0/g) || []).length;
  if (zeros >= 40) return true;                        // e.g. 0xa11ce0000...0001
  if (new Set(body).size < 6) return true;             // too few distinct nibbles
  return PLACEHOLDER_HEX.some((re) => re.test(lower));
}

// ── Detection rules ─────────────────────────────────────────────────────────
// Line-context that indicates a hex literal is meant as a KEY, not a hash.
const KEY_CONTEXT = /(priv(ate)?[_ ]?key|\bpriv\b|\bpk\b|secret|mnemonic|\bseed\b|from_key|signingkey|new\s+(ethers\.)?wallet\s*\(|_key\s*[:=])/i;
// Line-context that means a 64-hex literal is a benign hash/slot/salt — overrides KEY_CONTEXT.
const HASH_CONTEXT = /(topic|keccak|\bslot\b|bytecode|codehash|\bhash\b|\bsalt\b|digest|\broot\b|selector|domain[_ ]?separator|merkle|commitment|proof)/i;

const HEX64 = /0x[0-9a-fA-F]{64}\b/g;

// Context-free, high-confidence vendor credential patterns.
const TOKEN_RULES = [
  { name: 'sigil-api-key', re: /\bsgil_[A-Za-z0-9]{32,}\b/g },
  { name: 'openai-key', re: /\bsk-(proj-)?[A-Za-z0-9]{20,}\b/g },
  { name: 'anthropic-key', re: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g },
  { name: 'github-pat', re: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/g },
  { name: 'github-fine-grained-pat', re: /\bgithub_pat_[A-Za-z0-9_]{50,}\b/g },
  { name: 'aws-access-key-id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'google-api-key', re: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'stripe-secret-key', re: /\b[rs]k_live_[A-Za-z0-9]{20,}\b/g },
  { name: 'pem-private-key', re: /-----BEGIN (RSA |EC |OPENSSH |PGP |DSA )?PRIVATE KEY-----/g },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
];

function redact(s) {
  if (s.length <= 12) return s.slice(0, 3) + '…';
  return `${s.slice(0, 6)}…${s.slice(-4)} (${s.length} chars)`;
}

function listTrackedFiles() {
  const out = execSync('git ls-files -z', { cwd: root, maxBuffer: 64 * 1024 * 1024 });
  return out.toString('utf8').split('\0').filter(Boolean);
}

function shouldSkip(file) {
  if (SKIP_FILES.has(path.basename(file))) return true;
  if (SKIP_EXT.has(path.extname(file).toLowerCase())) return true;
  if (SKIP_DIRS.some((d) => file.includes(d))) return true;
  return false;
}

const findings = [];

for (const file of listTrackedFiles()) {
  if (shouldSkip(file)) continue;
  const abs = path.join(root, file);
  let stat;
  try { stat = fs.statSync(abs); } catch { continue; }
  if (!stat.isFile() || stat.size > MAX_BYTES) continue;

  let body;
  try { body = fs.readFileSync(abs, 'utf8'); } catch { continue; }
  if (body.includes(String.fromCharCode(0))) continue; // binary
  const lines = body.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('secret-scan-allow')) continue;

    // Rule 1 — EVM private key by context.
    if (KEY_CONTEXT.test(line) && !HASH_CONTEXT.test(line)) {
      for (const m of line.match(HEX64) || []) {
        if (!isPlaceholderHex(m)) {
          findings.push({ file, line: i + 1, rule: 'evm-private-key', match: redact(m) });
        }
      }
    }

    // Rule 2 — vendor credential tokens (context-free).
    for (const { name, re } of TOKEN_RULES) {
      re.lastIndex = 0;
      for (const m of line.match(re) || []) {
        findings.push({ file, line: i + 1, rule: name, match: redact(m) });
      }
    }
  }
}

if (findings.length === 0) {
  console.log('secret-scan: OK — no plaintext credentials in tracked files.');
  process.exit(0);
}

console.error(`secret-scan: FAILED — ${findings.length} potential secret(s) found:\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  [${f.rule}]  ${f.match}`);
}
console.error(
  '\nRemove the credential from source (load it from an env var / secret manager),' +
  '\nthen rotate it — a secret committed to git must be treated as compromised.' +
  '\nFor a deliberate, reviewed exception add a trailing `secret-scan-allow` comment.',
);
process.exit(1);
