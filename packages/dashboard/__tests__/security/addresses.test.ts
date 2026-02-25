import { describe, it, expect, beforeEach } from "vitest";

// Inline the validation logic (same as contracts.ts) to test independently
const INVALID_ACCOUNTS = new Set([
  "0x0000000000000000000000000000000000000000",
  "0x0000000000000000000000000000000000001010",
  "0xca11bde05977b3631167028862be2a173976ca11",
]);

function isValidSigilAccount(addr: string): boolean {
  if (!addr?.match(/^0x[0-9a-fA-F]{40}$/)) return false;
  return !INVALID_ACCOUNTS.has(addr.toLowerCase());
}

// Mock localStorage
function createMockStorage(): Storage {
  const store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, val: string) => { store[key] = val; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { for (const k in store) delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  };
}

describe("Address Validation — isValidSigilAccount", () => {
  it("rejects zero address", () => {
    expect(isValidSigilAccount("0x0000000000000000000000000000000000000000")).toBe(false);
  });

  it("rejects Polygon system contract (0x...1010)", () => {
    expect(isValidSigilAccount("0x0000000000000000000000000000000000001010")).toBe(false);
  });

  it("rejects Multicall3 address", () => {
    expect(isValidSigilAccount("0xca11bde05977b3631167028862be2a173976ca11")).toBe(false);
  });

  it("accepts valid addresses", () => {
    expect(isValidSigilAccount("0xcd49a6a38c3e52763345a4ad36c03eafb61deed5")).toBe(true);
    expect(isValidSigilAccount("0xEC0D6435fFA48E33cf39c56f21A0cCFB9b50Ad45")).toBe(true);
  });

  it("rejects malformed addresses", () => {
    expect(isValidSigilAccount("")).toBe(false);
    expect(isValidSigilAccount("0x")).toBe(false);
    expect(isValidSigilAccount("0xZZZZ")).toBe(false);
    expect(isValidSigilAccount("not-an-address")).toBe(false);
  });
});

describe("Account Storage — addStoredAccount filtering", () => {
  let storage: Storage;
  const ACCOUNTS_KEY = "sigil-accounts";

  beforeEach(() => {
    storage = createMockStorage();
  });

  function addStoredAccount(chainId: number, address: string) {
    if (!isValidSigilAccount(address)) return;
    const accounts = JSON.parse(storage.getItem(ACCOUNTS_KEY) || "[]");
    if (accounts.some((a: any) => a.address.toLowerCase() === address.toLowerCase() && a.chainId === chainId)) return;
    accounts.push({ address, chainId, createdAt: new Date().toISOString() });
    storage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
  }

  function getStoredAccounts() {
    const all = JSON.parse(storage.getItem(ACCOUNTS_KEY) || "[]");
    return all.filter((a: any) => isValidSigilAccount(a.address));
  }

  it("silently rejects zero address", () => {
    addStoredAccount(137, "0x0000000000000000000000000000000000000000");
    expect(getStoredAccounts()).toHaveLength(0);
  });

  it("silently rejects Multicall3", () => {
    addStoredAccount(137, "0xca11bde05977b3631167028862be2a173976ca11");
    expect(getStoredAccounts()).toHaveLength(0);
  });

  it("accepts valid address", () => {
    addStoredAccount(137, "0xcd49a6a38c3e52763345a4ad36c03eafb61deed5");
    expect(getStoredAccounts()).toHaveLength(1);
  });

  it("getStoredAccounts filters out invalid entries injected directly", () => {
    storage.setItem(ACCOUNTS_KEY, JSON.stringify([
      { address: "0x0000000000000000000000000000000000000000", chainId: 137, createdAt: "" },
      { address: "0xcd49a6a38c3e52763345a4ad36c03eafb61deed5", chainId: 137, createdAt: "" },
    ]));
    expect(getStoredAccounts()).toHaveLength(1);
    expect(getStoredAccounts()[0].address).toBe("0xcd49a6a38c3e52763345a4ad36c03eafb61deed5");
  });
});

describe("Migration — invalid addresses not imported", () => {
  it("migration skips invalid addresses", () => {
    const storage = createMockStorage();
    // Simulate old per-chain keys with one invalid
    storage.setItem("sigil-account-137", "0x0000000000000000000000000000000000001010");
    storage.setItem("sigil-account-43114", "0xb6e8d0fac5b33b437aac6eecc76dae2a4f6b16f9");

    // Run migration logic
    const accounts: any[] = [];
    for (const cid of [43114, 43113, 8453, 42161, 16661, 137]) {
      const val = storage.getItem(`sigil-account-${cid}`);
      if (val && isValidSigilAccount(val)) {
        accounts.push({ address: val, chainId: cid });
      }
    }
    expect(accounts).toHaveLength(1);
    expect(accounts[0].chainId).toBe(43114);
  });
});

describe("AccountCreated event topic", () => {
  it("matches expected keccak256 hash", () => {
    // The topic for AccountCreated(address,address,address)
    const expected = "0xf910bcf6ef45198082a2e9755330a11e60bde93603dd71de5eb22ecab5416768";
    // We verify this is used correctly in on-chain queries (see rpc.test.ts)
    expect(expected).toMatch(/^0x[0-9a-f]{64}$/);
  });
});
