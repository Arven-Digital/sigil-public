import { describe, it, expect } from "vitest";
import { decodeErrorMessage } from "../../src/lib/errors";

describe("Error Decoder", () => {
  it("decodes Unauthorized correctly", () => {
    expect(decodeErrorMessage("Unauthorized")).toBe("You are not authorized to perform this action.");
  });

  it("decodes NotOwner correctly", () => {
    expect(decodeErrorMessage("NotOwner")).toBe("Only the wallet owner can perform this action.");
  });

  it("OwnableUnauthorizedAccount does NOT match Unauthorized (word boundary)", () => {
    const result = decodeErrorMessage("OwnableUnauthorizedAccount(0x1234)");
    expect(result).not.toBe("You are not authorized to perform this action.");
    expect(result).toContain("factory may not be initialized");
  });

  it("unknown error returns as-is", () => {
    expect(decodeErrorMessage("0xdeadbeef")).toBe("0xdeadbeef");
  });

  it("empty data returns 'Unknown error'", () => {
    expect(decodeErrorMessage(undefined)).toBe("Unknown error");
    expect(decodeErrorMessage("")).toBe("Unknown error");
  });
});
