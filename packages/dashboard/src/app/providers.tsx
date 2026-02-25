"use client";
import { ReactNode } from "react";
import { WagmiProvider, http } from "wagmi";
import { mainnet, avalanche, base, arbitrum, polygon } from "wagmi/chains";
import { zgMainnet } from "@/lib/chains";
import { getDefaultConfig, RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WalletProvider } from "@/lib/wallet";
import "@rainbow-me/rainbowkit/styles.css";

// L3 fix: Warn if WalletConnect projectId is not configured
if (typeof window !== "undefined" && !process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID && process.env.NODE_ENV === 'development') {
  console.warn(
    "[Sigil] NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is not set. " +
    "WalletConnect will not work in production. " +
    "Get a project ID at https://cloud.walletconnect.com/"
  );
}

const config = getDefaultConfig({
  appName: "Sigil Protocol",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "sigil-protocol-placeholder",
  chains: [mainnet, polygon, avalanche, base, arbitrum, zgMainnet],
  transports: {
    [mainnet.id]: http("https://eth.drpc.org"),
    [polygon.id]: http("https://polygon-bor-rpc.publicnode.com"),
    [avalanche.id]: http("https://api.avax.network/ext/bc/C/rpc"),
    [base.id]: http("https://mainnet.base.org"),
    [arbitrum.id]: http("https://arb1.arbitrum.io/rpc"),
    [zgMainnet.id]: http("https://0g.drpc.org"),
  },
  ssr: true,
});

const queryClient = new QueryClient();

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider theme={darkTheme({ accentColor: "#00FF88", accentColorForeground: "#050505", borderRadius: "large", overlayBlur: "small", fontStack: "system" })}>
          <WalletProvider>
            {children}
          </WalletProvider>
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
