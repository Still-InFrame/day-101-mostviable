"use client";

import { useState } from "react";

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard access can be blocked; the text is still selectable on screen.
    }
  }

  return (
    <button
      onClick={copy}
      className="rounded-md border border-line bg-raised px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent/50 hover:text-text"
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}
