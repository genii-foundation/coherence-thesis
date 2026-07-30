"use client";

import { useEffect, useRef } from "react";

type BenchSurfaceProps = {
  className?: string;
  html: string;
};

export function BenchSurface({ className, html }: BenchSurfaceProps) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const tab = target.closest<HTMLButtonElement>(".tab[data-target]");
      if (!tab || !host.contains(tab)) return;

      const key = tab.dataset.target;
      host
        .querySelectorAll<HTMLButtonElement>(".tab[data-target]")
        .forEach((item) =>
          item.setAttribute(
            "aria-selected",
            String(item.dataset.target === key),
          ),
        );
      host
        .querySelectorAll<HTMLElement>(".body-right .pane[data-version]")
        .forEach((pane) =>
          pane.classList.toggle("active", pane.dataset.version === key),
        );
      host
        .querySelectorAll<HTMLElement>(".reason[data-version]")
        .forEach((reason) =>
          reason.classList.toggle("active", reason.dataset.version === key),
        );
    };

    const onChange = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement) || target.id !== "diffToggle") {
        return;
      }
      host
        .querySelector(".wrap")
        ?.classList.toggle("showdiff", target.checked);
    };

    host.addEventListener("click", onClick);
    host.addEventListener("change", onChange);
    return () => {
      host.removeEventListener("click", onClick);
      host.removeEventListener("change", onChange);
    };
  }, []);

  return (
    <div
      ref={hostRef}
      className={className}
      role="region"
      aria-label="Calibration comparison"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
