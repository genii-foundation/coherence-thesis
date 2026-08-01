"use client";

import { Check, Copy, TriangleAlert } from "lucide-react";
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

export function CopyPromptButton({
  label,
  prompt,
  secondary = false,
}: {
  label: string;
  prompt: string;
  secondary?: boolean;
}) {
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  const text =
    state === "copied"
      ? "Copied"
      : state === "failed"
        ? "Press to select, then copy"
        : label;

  return (
    <button
      type="button"
      className={[
        styles.copyButton,
        secondary ? styles.copyButtonSecondary : "",
        state === "copied" ? styles.copyOk : "",
        state === "failed" ? styles.copyBad : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={() => {
        void copy(prompt).then((ok) => {
          setState(ok ? "copied" : "failed");
          window.setTimeout(() => setState("idle"), 2400);
        });
      }}
    >
      {state === "copied" ? (
        <Check aria-hidden="true" size={15} />
      ) : state === "failed" ? (
        <TriangleAlert aria-hidden="true" size={15} />
      ) : (
        <Copy aria-hidden="true" size={15} />
      )}
      <span>{text}</span>
    </button>
  );
}
