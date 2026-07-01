"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

const DynamicConnectButton = dynamic(
  () => import("@rainbow-me/rainbowkit").then((mod) => mod.ConnectButton),
  {
    ssr: false,
    loading: () => (
      <button
        type="button"
        disabled
        className="px-4 py-2 rounded-xl border border-white/10 bg-white/[0.03] text-white/40 text-sm"
      >
        Loading wallet…
      </button>
    ),
  },
);

export default function WalletConnectButton(props: ComponentProps<typeof DynamicConnectButton>) {
  return <DynamicConnectButton {...props} />;
}
