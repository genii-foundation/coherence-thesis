"use client";

import { Check, Link as LinkIcon, TriangleAlert } from "lucide-react";
import { createPortal } from "react-dom";
import { useEffect, useRef, useState } from "react";
import { CleanTooltip } from "@/components/CleanTooltip";
import { copyTextToClipboard } from "@/lib/clipboard";

type CopyStatus = "copied" | "failed" | null;

const readerHeadingCopyStartedEvent = "reader-heading-copy-started";
let latestReaderHeadingCopyRequestId = 0;

export function ReaderLinkableHeading({
  href,
  level,
  title,
}: {
  href: string;
  level: 1 | 2;
  title: string;
}) {
  const [status, setStatus] = useState<CopyStatus>(null);
  const mountedRef = useRef(true);
  const statusTimerRef = useRef<number | null>(null);
  const Heading = level === 1 ? "h1" : "h2";

  useEffect(() => {
    mountedRef.current = true;

    function dismissStatus() {
      if (statusTimerRef.current !== null) {
        window.clearTimeout(statusTimerRef.current);
        statusTimerRef.current = null;
      }
      setStatus(null);
    }

    window.addEventListener(readerHeadingCopyStartedEvent, dismissStatus);

    return () => {
      mountedRef.current = false;
      window.removeEventListener(readerHeadingCopyStartedEvent, dismissStatus);
      if (statusTimerRef.current !== null) {
        window.clearTimeout(statusTimerRef.current);
      }
    };
  }, []);

  async function copyLink() {
    const requestId = latestReaderHeadingCopyRequestId + 1;
    latestReaderHeadingCopyRequestId = requestId;
    window.dispatchEvent(new Event(readerHeadingCopyStartedEvent));
    const copied = await copyTextToClipboard(
      new URL(href, window.location.origin).href,
    );
    if (!mountedRef.current || requestId !== latestReaderHeadingCopyRequestId) {
      return;
    }

    if (statusTimerRef.current !== null) {
      window.clearTimeout(statusTimerRef.current);
    }
    setStatus(copied ? "copied" : "failed");
    statusTimerRef.current = window.setTimeout(() => {
      setStatus(null);
      statusTimerRef.current = null;
    }, 2400);
  }

  return (
    <div className="reader-linkable-heading">
      <Heading>{title}</Heading>{"\u00a0"}
      <CleanTooltip label="Click to copy link">
        <button
          type="button"
          className="reader-heading-link-button"
          aria-label={`Copy link to ${title}`}
          onClick={() => {
            void copyLink();
          }}
        >
          <LinkIcon aria-hidden="true" size={18} strokeWidth={1.8} />
        </button>
      </CleanTooltip>
      {status && typeof document !== "undefined"
        ? createPortal(
            <div
              className="reader-copy-toast"
              data-copy-status={status}
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              {status === "copied" ? (
                <Check aria-hidden="true" size={17} strokeWidth={2} />
              ) : (
                <TriangleAlert aria-hidden="true" size={17} strokeWidth={1.8} />
              )}
              <span>
                {status === "copied" ? "Link copied" : "Unable to copy link"}
              </span>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
