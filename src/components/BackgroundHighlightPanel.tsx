"use client";

import { useEffect, useState } from "react";

const highlightOptions = [
  { id: "1", label: "1", name: "Highlight intensity 1" },
  { id: "2", label: "2", name: "Highlight intensity 2" },
  { id: "3", label: "3", name: "Highlight intensity 3" },
  { id: "4", label: "4", name: "Highlight intensity 4" },
  { id: "5", label: "5", name: "Highlight intensity 5" },
] as const;

type HighlightOptionId = (typeof highlightOptions)[number]["id"];

function applyHighlight(id: HighlightOptionId) {
  document.documentElement.dataset.backgroundHighlight = id;
}

export function BackgroundHighlightPanel() {
  const [activeId, setActiveId] = useState<HighlightOptionId>("3");

  useEffect(() => {
    applyHighlight(activeId);
  }, [activeId]);

  const chooseHighlight = (id: HighlightOptionId) => {
    setActiveId(id);
  };

  return (
    <section
      className="background-highlight-panel"
      aria-label="Background highlight intensity"
    >
      <span className="background-highlight-label">Highlight</span>
      <div className="background-highlight-options">
        {highlightOptions.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-label={option.name}
            aria-pressed={activeId === option.id}
            onClick={() => chooseHighlight(option.id)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
