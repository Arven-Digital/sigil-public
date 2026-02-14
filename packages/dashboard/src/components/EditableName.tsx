"use client";

import { useState, useRef, useEffect } from "react";

interface EditableNameProps {
  chainId: number;
  address: string;
}

function getKey(chainId: number, address: string) {
  return `sigil-account-name-${chainId}-${address.toLowerCase()}`;
}

export default function EditableName({ chainId, address }: EditableNameProps) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("My Sigil Wallet");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(getKey(chainId, address));
    if (stored) setName(stored);
    else setName("My Sigil Wallet");
  }, [chainId, address]);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const save = () => {
    const trimmed = name.trim() || "My Sigil Wallet";
    setName(trimmed);
    localStorage.setItem(getKey(chainId, address), trimmed);
    setEditing(false);
  };

  const cancel = () => {
    const stored = localStorage.getItem(getKey(chainId, address));
    setName(stored || "My Sigil Wallet");
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") cancel();
        }}
        onBlur={save}
        className="text-xl font-semibold bg-transparent border-b border-[#00FF88]/50 outline-none text-white py-0.5 px-0"
        maxLength={40}
      />
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xl font-semibold text-white hover:text-[#00FF88] transition-colors group flex items-center gap-2"
    >
      {name}
      <span className="text-white/20 group-hover:text-[#00FF88]/50 text-sm">✎</span>
    </button>
  );
}
