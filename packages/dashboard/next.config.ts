import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Security headers
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // M1: MetaMask SDK SES requires eval; wallet inject scripts require unsafe-inline. Nonce-based CSP blocked by RainbowKit/WalletConnect inline injection.
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: https:",
              "font-src 'self' data:",
              "connect-src 'self' https://sigil.codes https://app.sigil.codes https://api.sigil.codes https://*.walletconnect.com https://*.walletconnect.org wss://*.walletconnect.com wss://*.walletconnect.org https://api.avax.network https://api.avax-test.network https://*.publicnode.com https://*.drpc.org https://rpc.ankr.com https://*.web3modal.org https://pulse.walletconnect.org https://polygon-rpc.com https://mainnet.base.org https://arb1.arbitrum.io https://evmrpc.0g.ai https://api.web3modal.org https://*.kaspersky-labs.com",
              "frame-src 'self' https://*.walletconnect.com https://*.walletconnect.org",
            ].join("; "),
          },
        ],
      },
    ];
  },
};

export default nextConfig;
