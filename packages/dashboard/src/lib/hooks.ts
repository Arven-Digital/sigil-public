"use client";
import useSWR from "swr";
import { api } from "./api";
import { useWallet } from "./wallet";
import { isDemoMode } from "./mock";

export function useAccount(address?: string) {
  const { isConnected } = useWallet();
  const demo = isDemoMode(isConnected);
  const result = useSWR(
    address && !demo ? `account-${address}` : null,
    () => api.getAccount(address!),
    { refreshInterval: 30000 }
  );
  return { ...result, isDemoMode: demo };
}

export function useTransactions(account?: string, page = 1, limit = 20) {
  const { isConnected } = useWallet();
  const demo = isDemoMode(isConnected);
  const result = useSWR(
    account && !demo ? `txs-${account}-${page}-${limit}` : null,
    () => api.getTransactions(account!, page, limit),
    { refreshInterval: 30000 } // R14: Reduced from 15s to prevent rate limiting
  );
  return { ...result, isDemoMode: demo };
}

export function useAudit(account?: string) {
  const { isConnected } = useWallet();
  const demo = isDemoMode(isConnected);
  const result = useSWR(
    account && !demo ? `audit-${account}` : null,
    () => api.getAudit(account!),
    { refreshInterval: 30000 }
  );
  return { ...result, isDemoMode: demo };
}

export function useHealth() {
  return useSWR("health", () => api.health(), {
    refreshInterval: 60000,
  });
}

export function useRecoveryConfig(address?: string) {
  const { isConnected } = useWallet();
  const demo = isDemoMode(isConnected);
  const result = useSWR(
    address && !demo ? `recovery-config-${address}` : null,
    () => api.getRecoveryConfig(address!),
    { refreshInterval: 30000 }
  );
  return { ...result, isDemoMode: demo };
}

export function useActiveRecoveries(address?: string) {
  const { isConnected } = useWallet();
  const demo = isDemoMode(isConnected);
  const result = useSWR(
    address && !demo ? `recovery-active-${address}` : null,
    () => api.getActiveRecoveries(address!),
    { refreshInterval: 15000 }
  );
  return { ...result, isDemoMode: demo };
}

export function useUpgradeStatus(address?: string) {
  const { isConnected } = useWallet();
  const demo = isDemoMode(isConnected);
  const result = useSWR(
    address && !demo ? `upgrade-${address}` : null,
    () => api.getUpgradeStatus(address!),
    { refreshInterval: 30000 }
  );
  return { ...result, isDemoMode: demo };
}

export function useProtectionStatus(address?: string, chainId?: number) {
  const { isConnected } = useWallet();
  const demo = isDemoMode(isConnected);
  const result = useSWR(
    address && chainId && !demo ? `protection-${address}-${chainId}` : null,
    () => api.getProtectionStatus(address!, chainId!),
    { refreshInterval: 15000 }
  );
  return { ...result, isDemoMode: demo };
}

export function useUpgradeHistory(address?: string) {
  const { isConnected } = useWallet();
  const demo = isDemoMode(isConnected);
  const result = useSWR(
    address && !demo ? `upgrade-history-${address}` : null,
    () => api.getUpgradeHistory(address!),
    { refreshInterval: 60000 }
  );
  return { ...result, isDemoMode: demo };
}
