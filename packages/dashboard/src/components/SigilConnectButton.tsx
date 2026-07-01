"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

const NEON = "#00FF88";

export default function SigilConnectButton() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        const connected = ready && account && chain;

        return (
          <div
            {...(!ready && {
              "aria-hidden": true,
              style: { opacity: 0, pointerEvents: "none" as const, userSelect: "none" as const },
            })}
          >
            {(() => {
              if (!connected) {
                return (
                  <button
                    onClick={openConnectModal}
                    type="button"
                    className="relative px-5 py-2.5 rounded-xl text-sm font-semibold text-[#050505] transition-all hover:scale-[1.02] active:scale-[0.98]"
                    style={{
                      background: `linear-gradient(135deg, #00CC6A 0%, ${NEON} 100%)`,
                      boxShadow: `0 0 20px ${NEON}40, 0 0 40px ${NEON}20`,
                    }}
                  >
                    <span className="flex items-center gap-2">
                      <span>⚡</span>
                      Connect Wallet
                    </span>
                  </button>
                );
              }

              if (chain.unsupported) {
                return (
                  <button onClick={openChainModal} type="button"
                    className="px-4 py-2 rounded-xl text-sm font-medium bg-red-500/20 text-red-400 border border-red-500/30"
                  >
                    Wrong network
                  </button>
                );
              }

              return (
                <button
                  onClick={openAccountModal}
                  type="button"
                  className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all hover:bg-white/[0.04]"
                  style={{ borderColor: `${NEON}30`, color: NEON }}
                >
                  <span className="w-2 h-2 rounded-full animate-pulse" style={{ backgroundColor: NEON }} />
                  {account.displayName}
                </button>
              );
            })()}
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
