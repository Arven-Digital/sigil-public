#!/usr/bin/env node
// Public Release Integrity Gate.
//
// Enforces the mechanical invariants a public release must hold, and surfaces
// (without silently resolving) the decisions a human must make before
// publishing. Deterministic, offline, no network — safe for CI.
//
//   HARD checks (exit 1 on failure): package repository metadata, publish
//   config for scoped packages, SECURITY.md presence, a secret-boundary scan
//   over tracked files, and on-chain-address drift between the README and the
//   dashboard source of truth.
//
//   RELEASE DECISIONS (reported, do NOT fail CI): licensing must be resolved
//   by a human before publish. This gate refuses to invent a license.
//
// It never publishes, tags, or pushes anything.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const EXPECTED_REPO = 'https://github.com/Arven-Digital/sigil-public';

const hard = [];   // { ok, name, detail }
const decisions = []; // human-decision findings (non-blocking)

const pass = (name) => hard.push({ ok: true, name });
const fail = (name, detail) => hard.push({ ok: false, name, detail });
const decision = (name, detail) => decisions.push({ name, detail });

const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const exists = (p) => fs.existsSync(path.join(root, p));
const readJson = (p) => JSON.parse(read(p));

// ─── Package metadata ───────────────────────────────────────────────
function checkPackages() {
  const dirs = fs.readdirSync(path.join(root, 'packages'), { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const dir of dirs) {
    const rel = `packages/${dir}/package.json`;
    if (!exists(rel)) continue; // e.g. contracts (Foundry) / skill (docs only)
    const pkg = readJson(rel);
    if (pkg.private) continue; // private packages are not published

    const label = pkg.name || dir;

    // Repository must point at THIS repo, with the right directory.
    const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    if (!url) {
      fail(`repository:${label}`, `publishable package has no repository field`);
    } else if (!url.replace(/\.git$/, '').endsWith('Arven-Digital/sigil-public')) {
      fail(`repository:${label}`, `repository url ${url} does not point at ${EXPECTED_REPO}`);
    } else if (pkg.repository?.directory && pkg.repository.directory !== `packages/${dir}`) {
      fail(`repository:${label}`, `repository.directory ${pkg.repository.directory} != packages/${dir}`);
    } else {
      pass(`repository:${label}`);
    }

    // Scoped packages must declare public publish access, or npm refuses / defaults private.
    if (label.startsWith('@')) {
      if (pkg.publishConfig?.access === 'public') pass(`publishConfig:${label}`);
      else fail(`publishConfig:${label}`, `scoped package must set publishConfig.access = "public"`);
    }

    // Licensing is a human/legal decision — report, never invent.
    if (!pkg.license) {
      decision(`license:${label}`, `publishable package declares no license`);
    }
  }
}

// ─── License coherence (reported) ──────────────────────────────────
function checkLicenseCoherence() {
  const readme = exists('README.md') ? read('README.md') : '';
  const readmeSaysProprietary = /proprietary/i.test(readme.split('## License')[1] || '');
  const declared = new Set();
  for (const dir of fs.readdirSync(path.join(root, 'packages'))) {
    const rel = `packages/${dir}/package.json`;
    if (!exists(rel)) continue;
    const pkg = readJson(rel);
    if (!pkg.private && pkg.license) declared.add(pkg.license);
  }
  if (!exists('LICENSE') && !exists('LICENSE.md')) {
    decision('license:root', 'no root LICENSE file — a public release needs one');
  }
  if (readmeSaysProprietary && declared.size > 0) {
    decision(
      'license:contradiction',
      `README declares "Proprietary" but publishable packages declare [${[...declared].join(', ')}] — resolve before publishing (an MIT npm publish would give away rights to proprietary code)`,
    );
  }
}

// ─── SECURITY.md presence ──────────────────────────────────────────
function checkSecurityPolicy() {
  if (exists('SECURITY.md')) pass('security-policy');
  else fail('security-policy', 'SECURITY.md is missing');
}

// ─── Secret-boundary scan ──────────────────────────────────────────
// Targets real secret material, not every 64-hex (storage slots, event
// topics, gas blobs, and well-known test keys are not secrets).
const SECRET_PATTERNS = [
  { name: 'openai-key', re: /\bsk-[A-Za-z0-9]{20,}\b/ },
  { name: 'github-pat', re: /\bghp_[A-Za-z0-9]{20,}\b/ },
  { name: 'aws-akid', re: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: 'private-key-block', re: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'bearer-token', re: /\bBearer\s+[A-Za-z0-9._-]{20,}/ },
  // 64-hex assigned to a var whose NAME implies a secret (real key leak),
  // rather than any 64-hex literal.
  { name: 'named-private-key', re: /(private[_-]?key|mnemonic|secret[_-]?key)["'\s:=]+0x[0-9a-fA-F]{64}\b/i },
];
// Known-benign values that legitimately appear in a public repo.
const SECRET_ALLOWLIST = [
  // Foundry/Anvil well-known default test key (public, in every tutorial).
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
];
const SCAN_SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'out', 'cache', 'lib', 'broadcast', '.next', '.turbo', 'coverage']);
// Test suites and the placeholder env file legitimately carry fake key shapes.
const SCAN_SKIP_FILES = [/\.env\.example$/, /packages\/contracts\/test\//, /packages\/contracts\/script\//];

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SCAN_SKIP_DIRS.has(entry.name)) continue;
      yield* walk(path.join(dir, entry.name));
    } else {
      yield path.join(dir, entry.name);
    }
  }
}

function checkSecrets() {
  const hits = [];
  for (const file of walk(root)) {
    const relPath = path.relative(root, file).split(path.sep).join('/');
    if (SCAN_SKIP_FILES.some((re) => re.test(relPath))) continue;
    if (!/\.(ts|tsx|js|mjs|cjs|json|md|sol|txt|yml|yaml|env)$/.test(file) && !relPath.includes('.env')) continue;
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];
      if (SECRET_ALLOWLIST.some((v) => line.includes(v))) continue;
      for (const { name, re } of SECRET_PATTERNS) {
        if (re.test(line)) hits.push(`${relPath}:${i + 1} (${name})`);
      }
    }
  }
  if (hits.length === 0) pass('secret-boundary-scan');
  else fail('secret-boundary-scan', `secret-shaped material found:\n    ${hits.join('\n    ')}`);
}

// ─── On-chain address drift ────────────────────────────────────────
// The dashboard contracts.ts is the source of truth for factory + guardian
// addresses. Every one of those must appear verbatim in the README, so the
// public docs cannot silently drift from the deployed set.
function checkAddressDrift() {
  const src = read('packages/dashboard/src/lib/contracts.ts');
  const factoryBlock = src.split('FACTORY_ADDRESSES')[1]?.split('};')[0] ?? '';
  const factories = [...factoryBlock.matchAll(/0x[0-9a-fA-F]{40}/g)].map((m) => m[0]);
  const guardian = src.match(/GUARDIAN_ADDRESS\s*=\s*"(0x[0-9a-fA-F]{40})"/)?.[1];
  const canonical = [...new Set([...factories, guardian].filter(Boolean))];
  if (canonical.length < 7) {
    fail('address-drift', `expected 6 factories + guardian in contracts.ts, found ${canonical.length}`);
    return;
  }
  const readme = read('README.md').toLowerCase();
  const missing = canonical.filter((a) => !readme.includes(a.toLowerCase()));
  if (missing.length === 0) pass('address-drift');
  else fail('address-drift', `README is missing canonical addresses:\n    ${missing.join('\n    ')}`);
}

// ─── Run ───────────────────────────────────────────────────────────
checkPackages();
checkLicenseCoherence();
checkSecurityPolicy();
checkSecrets();
checkAddressDrift();

console.log('Public Release Integrity Gate\n');
for (const c of hard) {
  console.log(`  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.ok ? '' : `\n        ${c.detail}`}`);
}
const failed = hard.filter((c) => !c.ok);

if (decisions.length) {
  console.log('\n  Release decisions requiring human sign-off (do NOT block CI):');
  for (const d of decisions) console.log(`  ⚠ ${d.name}: ${d.detail}`);
}

console.log(`\n${failed.length ? `FAILED — ${failed.length} hard check(s)` : 'OK — all hard checks passed'}` +
  `${decisions.length ? `; ${decisions.length} human decision(s) pending` : ''}`);

process.exit(failed.length ? 1 : 0);
