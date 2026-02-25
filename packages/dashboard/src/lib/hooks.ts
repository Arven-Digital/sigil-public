"use client";
import useSWR from "swr";
import { api } from "./api";

export function useAccount(address?: string) {
  return useSWR(
    address ? `account-${address}` : null,
    () => api.getAccount(address!),
    { refreshInterval: 30000 }
  );
}

export function useTransactions(account?: string, page = 1, limit = 20) {
  return useSWR(
    account ? `txs-${account}-${page}-${limit}` : null,
    () => api.getTransactions(account!, page, limit),
    { refreshInterval: 30000 }
  );
}

export function useAudit(account?: string) {
  return useSWR(
    account ? `audit-${account}` : null,
    () => api.getAudit(account!),
    { refreshInterval: 30000 }
  );
}

export function useHealth() {
  return useSWR("health", () => api.health(), {
    refreshInterval: 60000,
  });
}

export function useRecoveryConfig(address?: string) {
  return useSWR(
    address ? `recovery-config-${address}` : null,
    () => api.getRecoveryConfig(address!),
    { refreshInterval: 30000 }
  );
}

export function useActiveRecoveries(address?: string) {
  return useSWR(
    address ? `recovery-active-${address}` : null,
    () => api.getActiveRecoveries(address!),
    { refreshInterval: 15000 }
  );
}

export function useUpgradeStatus(address?: string) {
  return useSWR(
    address ? `upgrade-${address}` : null,
    () => api.getUpgradeStatus(address!),
    { refreshInterval: 30000 }
  );
}

export function useProtectionStatus(address?: string, chainId?: number) {
  return useSWR(
    address && chainId ? `protection-${address}-${chainId}` : null,
    () => api.getProtectionStatus(address!, chainId!),
    { refreshInterval: 15000 }
  );
}

export function useUpgradeHistory(address?: string) {
  return useSWR(
    address ? `upgrade-history-${address}` : null,
    () => api.getUpgradeHistory(address!),
    { refreshInterval: 60000 }
  );
}
