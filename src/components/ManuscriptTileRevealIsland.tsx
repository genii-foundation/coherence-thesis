"use client";

import { useEffect } from "react";

const revealSelector = ".manuscript-showcase .manuscript-cover-card";

export function ManuscriptTileRevealIsland() {
  useEffect(() => {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>(revealSelector),
    );
    const showcase = document.querySelector<HTMLElement>(".manuscript-showcase");

    if (!showcase || cards.length === 0) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    if (reduceMotion || !("IntersectionObserver" in window)) {
      for (const card of cards) {
        card.classList.add("manuscript-cover-card-revealed");
      }
      return;
    }

    for (const [index, card] of cards.entries()) {
      card.style.setProperty("--manuscript-reveal-delay", `${index * 55}ms`);
    }

    showcase.classList.add("manuscript-showcase-reveal-ready");

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;

          const card = entry.target as HTMLElement;
          card.classList.add("manuscript-cover-card-revealed");
          observer.unobserve(card);
        }
      },
      {
        rootMargin: "0px 0px -12% 0px",
        threshold: 0.18,
      },
    );

    for (const card of cards) {
      observer.observe(card);
    }

    return () => {
      observer.disconnect();
      showcase.classList.remove("manuscript-showcase-reveal-ready");
      for (const card of cards) {
        card.style.removeProperty("--manuscript-reveal-delay");
      }
    };
  }, []);

  return null;
}
