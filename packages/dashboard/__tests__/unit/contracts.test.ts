import { describe, it, expect } from "vitest";
import { FACTORY_ADDRESSES, GUARDIAN_ADDRESS, getNativeToken } from "../../src/lib/contracts";

describe("Contract Utilities", () => {
  it("getNativeToken returns POL for Polygon", () => {
    expect(getNativeToken(137)).toBe("POL");
  });

  it("getNativeToken returns AVAX for Avalanche", () => {
    expect(getNativeToken(43114)).toBe("AVAX");
    expect(getNativeToken(43113)).toBe("AVAX");
  });

  it("getNativeToken returns ETH for Base and Arbitrum", () => {
    expect(getNativeToken(8453)).toBe("ETH");
    expect(getNativeToken(42161)).toBe("ETH");
  });

  it("getNativeToken returns A0GI for 0G", () => {
    expect(getNativeToken(16661)).toBe("A0GI");
  });

  it("FACTORY_ADDRESSES has entries for all 6 chains", () => {
    const expected = [43114, 43113, 8453, 42161, 16661, 137];
    for (const cid of expected) {
      expect(FACTORY_ADDRESSES).toHaveProperty(String(cid));
      expect(FACTORY_ADDRESSES[cid]).toMatch(/^0x[0-9a-fA-F]{40}$/);
    }
  });

  it("GUARDIAN_ADDRESS is valid address", () => {
    expect(GUARDIAN_ADDRESS).toMatch(/^0x[0-9a-fA-F]{40}$/);
  });
});
