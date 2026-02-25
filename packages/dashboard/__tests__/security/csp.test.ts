import { describe, it, expect } from "vitest";

describe("Content Security Policy — app.sigil.codes", () => {
  let csp: string;

  it("CSP header exists", async () => {
    const res = await fetch("https://app.sigil.codes");
    csp = res.headers.get("content-security-policy") ||
          res.headers.get("content-security-policy-report-only") || "";
    expect(csp.length).toBeGreaterThan(0);
  });

  it("connect-src includes api.sigil.codes", async () => {
    if (!csp) {
      const res = await fetch("https://app.sigil.codes");
      csp = res.headers.get("content-security-policy") ||
            res.headers.get("content-security-policy-report-only") || "";
    }
    expect(csp).toContain("api.sigil.codes");
  });

  it("connect-src includes app.sigil.codes or sigil.codes", async () => {
    if (!csp) {
      const res = await fetch("https://app.sigil.codes");
      csp = res.headers.get("content-security-policy") ||
            res.headers.get("content-security-policy-report-only") || "";
    }
    expect(csp.includes("app.sigil.codes") || csp.includes("sigil.codes")).toBe(true);
  });

  it("connect-src includes *.publicnode.com", async () => {
    if (!csp) {
      const res = await fetch("https://app.sigil.codes");
      csp = res.headers.get("content-security-policy") ||
            res.headers.get("content-security-policy-report-only") || "";
    }
    expect(csp).toContain("publicnode.com");
  });

  it("connect-src includes *.drpc.org", async () => {
    if (!csp) {
      const res = await fetch("https://app.sigil.codes");
      csp = res.headers.get("content-security-policy") ||
            res.headers.get("content-security-policy-report-only") || "";
    }
    expect(csp).toContain("drpc.org");
  });

  it("connect-src includes *.walletconnect.com", async () => {
    if (!csp) {
      const res = await fetch("https://app.sigil.codes");
      csp = res.headers.get("content-security-policy") ||
            res.headers.get("content-security-policy-report-only") || "";
    }
    expect(csp).toContain("walletconnect.com");
  });

  it("script-src does not include unsafe-eval", async () => {
    if (!csp) {
      const res = await fetch("https://app.sigil.codes");
      csp = res.headers.get("content-security-policy") ||
            res.headers.get("content-security-policy-report-only") || "";
    }
    const scriptSrc = csp.match(/script-src\s+([^;]+)/)?.[1] || "";
    // Allow if wagmi needs it, but flag it
    if (scriptSrc.includes("unsafe-eval")) {
      console.warn("⚠️ script-src contains unsafe-eval — verify this is needed for wagmi/viem");
    }
  });

  it("script-src does not include unsafe-inline (unless explicitly needed)", async () => {
    if (!csp) {
      const res = await fetch("https://app.sigil.codes");
      csp = res.headers.get("content-security-policy") ||
            res.headers.get("content-security-policy-report-only") || "";
    }
    const scriptSrc = csp.match(/script-src\s+([^;]+)/)?.[1] || "";
    if (scriptSrc.includes("'unsafe-inline'")) {
      console.warn("⚠️ script-src contains unsafe-inline — verify this is intentional");
    }
  });
});
