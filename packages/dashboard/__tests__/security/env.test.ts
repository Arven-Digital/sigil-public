import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SRC_DIR = join(__dirname, "../../src");

describe("Environment & Config Security", () => {
  it("API URL doesn't contain trailing newline", () => {
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "https://api.sigil.codes/v1");
    expect(apiUrl).not.toMatch(/\n$/);
    expect(apiUrl.trim()).toBe(apiUrl);
  });

  it("API URL is valid HTTPS URL", () => {
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "https://api.sigil.codes/v1").trim();
    const parsed = new URL(apiUrl);
    expect(parsed.protocol).toBe("https:");
  });

  it("no secrets in client-side code", () => {
    // Read api.ts which is the main client-side API file
    const apiTs = readFileSync(join(SRC_DIR, "lib/api.ts"), "utf-8");
    // Check for common secret patterns
    expect(apiTs).not.toMatch(/(?:secret|private.?key|password)\s*[:=]\s*["'][^"']+["']/i);
    expect(apiTs).not.toMatch(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/);
    expect(apiTs).not.toMatch(/sk-[a-zA-Z0-9]{20,}/);  // OpenAI-style keys
    expect(apiTs).not.toMatch(/0x[a-fA-F0-9]{64}/);     // Private keys (64 hex chars)
  });

  it("api.ts uses .trim() on API_BASE", () => {
    const apiTs = readFileSync(join(SRC_DIR, "lib/api.ts"), "utf-8");
    // The API_BASE definition should include .trim()
    expect(apiTs).toMatch(/\.trim\(\)/);
  });
});
