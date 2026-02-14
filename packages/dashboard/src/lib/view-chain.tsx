"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

const ViewChainContext = createContext<{ viewChainId: number; setViewChainId: (id: number) => void }>({
  viewChainId: 43114,
  setViewChainId: () => {},
});

export function useViewChain() {
  return useContext(ViewChainContext);
}

export function ViewChainProvider({ children }: { children: ReactNode }) {
  const [viewChainId, setViewChainId] = useState(43114);

  useEffect(() => {
    const stored = localStorage.getItem("sigil-view-chain");
    if (stored) setViewChainId(Number(stored));
  }, []);

  const handleChainChange = (id: number) => {
    setViewChainId(id);
    localStorage.setItem("sigil-view-chain", String(id));
  };

  return (
    <ViewChainContext.Provider value={{ viewChainId, setViewChainId: handleChainChange }}>
      {children}
    </ViewChainContext.Provider>
  );
}
