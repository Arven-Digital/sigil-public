import { describe, it, expect } from "vitest";

const API = "https://api.sigil.codes/v1";

describe("Guardian Pipeline E2E", () => {
  it("health endpoint responds with status ok", async () => {
    const res = await fetch(`${API}/health`);
    expect(res.ok).toBe(true);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("evaluate with missing fields returns 401 (auth required)", async () => {
    const res = await fetch(`${API}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(401);
  });

  it("evaluate with invalid userOp structure returns error", async () => {
    const res = await fetch(`${API}/evaluate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userOp: { sender: "not-an-address", callData: "0x" },
        chainId: 137,
      }),
    });
    expect(res.ok).toBe(false);
  });

  it("API version is returned in health", async () => {
    const res = await fetch(`${API}/health`);
    const body = await res.json();
    expect(body.version).toBeDefined();
    expect(typeof body.version).toBe("string");
  });
});
