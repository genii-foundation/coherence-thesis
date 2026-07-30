"use client";

import { useState } from "react";

import styles from "./admin.module.css";

/**
 * Copies a prompt to the clipboard. The admin surface cannot start a session itself, and
 * should not pretend to: it has no idea which agent surface is running. A prompt on the
 * clipboard works in all of them, and leaves the author in control of where it goes.
 */
export function CopyPromptButton({ label, prompt }: { label: string; prompt: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      className={styles.copyButton}
      onClick={() => {
        void navigator.clipboard.writeText(prompt).then(
          () => {
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2200);
          },
          () => setCopied(false),
        );
      }}
    >
      {copied ? "Copied. Paste it into any agent session." : label}
    </button>
  );
}
