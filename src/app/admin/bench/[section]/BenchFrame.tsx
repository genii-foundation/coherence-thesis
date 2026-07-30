"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type BenchFrameProps = {
  className?: string;
  src: string;
  title: string;
};

/**
 * The comparison renderer remains an isolated document so its publication
 * typography cannot leak into the admin shell. Its height follows its content,
 * which leaves scrolling to the page instead of trapping it inside the frame.
 */
export function BenchFrame({ className, src, title }: BenchFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  const disconnectRef = useRef<() => void>(() => undefined);
  const [height, setHeight] = useState<number | null>(null);

  const connect = useCallback(() => {
    disconnectRef.current();

    const frame = frameRef.current;
    const document = frame?.contentDocument;
    if (!frame || !document) return;
    const content = document.querySelector<HTMLElement>(".wrap");

    const resize = () => {
      const next = Math.ceil(
        content?.getBoundingClientRect().height ??
          document.body?.getBoundingClientRect().height ??
          0,
      );
      if (next > 0) setHeight(next);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(content ?? document.documentElement);
    document.defaultView?.addEventListener("resize", resize);

    disconnectRef.current = () => {
      observer.disconnect();
      document.defaultView?.removeEventListener("resize", resize);
    };
  }, []);

  useEffect(() => {
    connect();
    return () => disconnectRef.current();
  }, [connect]);

  return (
    <iframe
      ref={frameRef}
      src={src}
      title={title}
      className={className}
      onLoad={connect}
      scrolling="no"
      style={height ? { height } : undefined}
    />
  );
}
