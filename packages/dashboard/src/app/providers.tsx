"use client";
import { ReactNode } from "react";
import { WagmiProvider, http } from "wagmi";
import { avalanche, avalancheFuji, base, arbitrum, sepolia } from "wagmi/chains";
import { zgMainnet } from "@/lib/chains";
import { getDefaultConfig, RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletProvider } from "@/lib/wallet";
import "@rainbow-me/rainbowkit/styles.css";

// L3 fix: Warn if WalletConnect projectId is not configured
if (typeof window !== "undefined" && !process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID) {
  console.warn(
    "[Sigil] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. " +
    "WalletConnect will not work in production. " +
    "Get a project ID at https://cloud.walletconnect.com/"
  );
}

const config = getDefaultConfig({
  appName: "Sigil Protocol",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "sigil-protocol-placeholder",
  chains: [avalanche, base, arbitrum, zgMainnet, avalancheFuji, sepolia],
  transports: {
    [avalanche.id]: http("https://api.avax.network/ext/bc/C/rpc"),
    [base.id]: http("https://mainnet.base.org"),
    [arbitrum.id]: http("https://arb1.arbitrum.io/rpc"),
    [zgMainnet.id]: http("https://evmrpc.0g.ai"),
    [avalancheFuji.id]: http("https://api.avax-test.network/ext/bc/C/rpc"),
    [sepolia.id]: http(),
  },
  ssr: true,
});

const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: "#5E6CFF", borderRadius: "medium" })}>
          <WalletProvider>
            {children}
          </WalletProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
