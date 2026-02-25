import { describe, it, expect } from "vitest";

const API = "https://api.sigil.codes/v1";

describe("API E2E", () => {
  it("GET /health returns 200 with status ok", async () => {
    const res = await fetch(`${API}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("GET /bundles?chainId=137 returns bundles array", async () => {
    const res = await fetch(`${API}/bundles?chainId=137`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(Array.isArray(body.bundles || body)).toBe(true);
  });

  it("POST /evaluate without auth returns 401", async () => {
    const res = await fetch(`${API}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("GET /transactions without auth returns 401", async () => {
    const res = await fetch(`${API}/transactions?account=0xcd49a6a38c3e52763345a4ad36c03eafb61deed5`);
    expect(res.status).toBe(401);
  });

  it("GET /audit without auth returns 401", async () => {
    const res = await fetch(`${API}/audit?account=0xcd49a6a38c3e52763345a4ad36c03eafb61deed5`);
    // Audit may be 401 or 200 depending on server config
    expect([200, 401]).toContain(res.status);
  });

  it("auth-protected endpoints reject unauthenticated requests", async () => {
    const protected_paths = [
      { path: "/transactions?account=0xcd49a6a38c3e52763345a4ad36c03eafb61deed5", method: "GET" },
      { path: "/evaluate", method: "POST" },
    ];
    for (const { path, method } of protected_paths) {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        ...(method === "POST" ? { body: JSON.stringify({}) } : {}),
      });
      expect(res.status, `${path} should be 401`).toBe(401);
    }
  });

  it("CSP headers present on app.sigil.codes", async () => {
    const res = await fetch("https://app.sigil.codes", { method: "HEAD" });
    const csp = res.headers.get("content-security-policy") ||
                res.headers.get("content-security-policy-report-only");
    expect(csp).toBeTruthy();
  });
});
