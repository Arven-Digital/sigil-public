// Browser-compatible shim for MetaMask SDK's optional React Native storage import.
// The dashboard is a web app; bundling the real React Native AsyncStorage package
// adds unnecessary native dependencies. This implements the small async key/value
// surface the wallet stack expects, backed by localStorage when available and an
// in-memory map during prerender/build.

type Pair = [string, string | null];

const memory = new Map<string, string>();

function browserStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

async function getItem(key: string): Promise<string | null> {
  const storage = browserStorage();
  return storage ? storage.getItem(key) : memory.get(key) ?? null;
}

async function setItem(key: string, value: string): Promise<void> {
  const storage = browserStorage();
  if (storage) storage.setItem(key, value);
  else memory.set(key, value);
}

async function removeItem(key: string): Promise<void> {
  const storage = browserStorage();
  if (storage) storage.removeItem(key);
  else memory.delete(key);
}

async function mergeItem(key: string, value: string): Promise<void> {
  const current = await getItem(key);
  if (!current) return setItem(key, value);
  try {
    await setItem(key, JSON.stringify({ ...JSON.parse(current), ...JSON.parse(value) }));
  } catch {
    await setItem(key, value);
  }
}

async function clear(): Promise<void> {
  const storage = browserStorage();
  if (storage) storage.clear();
  else memory.clear();
}

async function getAllKeys(): Promise<string[]> {
  const storage = browserStorage();
  if (!storage) return Array.from(memory.keys());
  return Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => Boolean(key));
}

async function multiGet(keys: string[]): Promise<Pair[]> {
  return Promise.all(keys.map(async (key) => [key, await getItem(key)] as Pair));
}

async function multiSet(entries: [string, string][]): Promise<void> {
  await Promise.all(entries.map(([key, value]) => setItem(key, value)));
}

async function multiRemove(keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => removeItem(key)));
}

const AsyncStorage = {
  getItem,
  setItem,
  removeItem,
  mergeItem,
  clear,
  getAllKeys,
  multiGet,
  multiSet,
  multiRemove,
};

export { getItem, setItem, removeItem, mergeItem, clear, getAllKeys, multiGet, multiSet, multiRemove };
export default AsyncStorage;
