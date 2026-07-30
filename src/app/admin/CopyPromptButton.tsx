"use client";

import { useState } from "react";

import styles from "./admin.module.css";

/**
 * Copies a prompt to the clipboard. The admin surface cannot start a session itself, and
 * should not pretend to: it has no idea which agent surface is running. A prompt on the
 * clipboard works in all of them, and leaves the author in control of where it goes.
 *
 * Two paths, because the async clipboard API rejects whenever the document is not
 * focused, which is common enough that a button relying on it alone silently does
 * nothing and reports nothing. The selection fallback works without focus.
 */
async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fall through.
  }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.top = "-1000px";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    field.remove();
    return ok;
  } catch {
    return false;
  }
}

export function CopyPromptButton({ label, prompt }: { label: string; prompt: string }) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");

  return (
    <button
      type="button"
      className={[styles.copyButton, state === "copied" ? styles.copyOk : "", state === "failed" ? styles.copyBad : ""]
        .filter(Boolean)
        .join(" ")}
      onClick={() => {
        void copy(prompt).then((ok) => {
          setState(ok ? "copied" : "failed");
          window.setTimeout(() => setState("idle"), 2400);
        });
      }}
    >
      {state === "copied" ? "Copied" : state === "failed" ? "Press to select, then copy" : label}
    </button>
  );
}
