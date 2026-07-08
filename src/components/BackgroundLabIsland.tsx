"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  BookOpen,
  Check,
  ChevronRight,
  Layers,
  PenLine,
  Sparkles,
} from "lucide-react";

type BackgroundOption = {
  id: string;
  name: string;
  note: string;
  tone: string;
};

const densityStats = [
  { value: 9, label: "volumes" },
  { value: 566, label: "sections" },
  { value: 198717, label: "words" },
  { value: 904, label: "minutes" },
];

const backgroundOptions: BackgroundOption[] = [
  {
    id: "pulp-bloom",
    name: "Pulp bloom",
    note: "Soft paper pulp with uneven cloudy blooms.",
    tone: "Fiber",
  },
  {
    id: "linen-drift",
    name: "Linen drift",
    note: "Loose woven grain with imperfect cloth movement.",
    tone: "Thread",
  },
  {
    id: "cloud-wash",
    name: "Cloud wash",
    note: "Broad translucent stains with quiet edge variation.",
    tone: "Wash",
  },
  {
    id: "silt-current",
    name: "Silt current",
    note: "Sediment-like flow with slow organic direction.",
    tone: "Flow",
  },
  {
    id: "marbled-vellum",
    name: "Marbled vellum",
    note: "Loose marbling without hard rings or geometry.",
    tone: "Marble",
  },
  {
    id: "pressed-leaf",
    name: "Pressed leaf",
    note: "Faint botanical veining under the paper surface.",
    tone: "Vein",
  },
  {
    id: "ink-mist",
    name: "Ink mist",
    note: "Diluted ink diffusion with irregular pooling.",
    tone: "Mist",
  },
  {
    id: "weathered-patina",
    name: "Weathered patina",
    note: "Age marks and soft mineral staining.",
    tone: "Patina",
  },
  {
    id: "handmade-fiber",
    name: "Handmade fiber",
    note: "Pulled fibers and uneven handmade paper density.",
    tone: "Paper",
  },
  {
    id: "soft-terrain",
    name: "Soft terrain",
    note: "Low relief texture like worn topographic paper.",
    tone: "Terrain",
  },
];

const numberFormatter = new Intl.NumberFormat("en-US");

function formatPercent(value: number) {
  return `${numberFormatter.format(value)}%`;
}

export default function BackgroundLabIsland() {
  const [activeId, setActiveId] = useState(backgroundOptions[0]!.id);
  const activeOption = useMemo(
    () =>
      backgroundOptions.find((option) => option.id === activeId) ??
      backgroundOptions[0]!,
    [activeId],
  );

  return (
    <div className={`background-lab-page background-lab-${activeOption.id}`}>
      <div className="background-lab-shell">
        <header className="background-lab-hero">
          <div className="background-lab-hero-copy">
            <p className="eyebrow">Background Lab</p>
            <h1>Organic texture trials for the reader surface.</h1>
            <p>
              Pick a candidate and scan the same page elements against it. The
              current selection is <strong>{activeOption.name}</strong>.
            </p>
            <div className="background-lab-hero-actions">
              <button className="primary-link" type="button">
                <BookOpen aria-hidden="true" size={18} />
                Primary action
              </button>
              <button className="secondary-link" type="button">
                <Layers aria-hidden="true" size={18} />
                Secondary action
              </button>
            </div>
          </div>
          <aside className="background-lab-current" aria-label="Current background">
            <span className="background-lab-current-swatch" aria-hidden="true" />
            <div>
              <span>{activeOption.tone}</span>
              <strong>{activeOption.name}</strong>
              <p>{activeOption.note}</p>
            </div>
          </aside>
        </header>

        <section
          className="background-lab-options"
          aria-label="Background variations"
        >
          {backgroundOptions.map((option, index) => (
            <button
              key={option.id}
              type="button"
              className="background-lab-option"
              aria-pressed={option.id === activeOption.id}
              onClick={() => setActiveId(option.id)}
            >
              <span
                className={`background-lab-option-swatch background-lab-option-swatch-${option.id}`}
                aria-hidden="true"
              />
              <span className="background-lab-option-copy">
                <span>{`${numberFormatter.format(index + 1)}. ${option.name}`}</span>
                <small>{option.note}</small>
              </span>
            </button>
          ))}
        </section>

        <section className="background-lab-preview" aria-label="Layout preview">
          <div className="background-lab-panel background-lab-reader">
            <p className="eyebrow">Reader pane</p>
            <h2>A sample long form surface</h2>
            <p>
              The test is simple. The background should feel alive behind the
              text without shouting at it from the balcony.
            </p>
            <blockquote>
              The page should carry texture like memory, not like graph paper
              wearing ceremonial robes.
            </blockquote>
            <p>
              This block checks line length, panel translucency, paragraph color,
              and whether the grain competes with serif body text.
            </p>
          </div>

          <div className="background-lab-stack">
            <div className="background-lab-panel background-lab-control-panel">
              <div className="background-lab-panel-heading">
                <div>
                  <p className="eyebrow">Controls</p>
                  <h2>Common inputs</h2>
                </div>
                <Sparkles aria-hidden="true" size={22} />
              </div>
              <label>
                Reading mode
                <select defaultValue="focused">
                  <option value="focused">Focused</option>
                  <option value="ambient">Ambient</option>
                  <option value="dense">Dense</option>
                </select>
              </label>
              <label>
                Search field
                <input placeholder="Trust architecture" type="search" />
              </label>
              <div className="background-lab-check-row">
                <Check aria-hidden="true" size={18} />
                <span>{formatPercent(62)} local progress</span>
              </div>
            </div>

            <div className="background-lab-card-grid">
              {[
                ["Section card", "A compact card with tags and a visible edge."],
                ["Menu panel", "A floating surface over the background."],
                ["Inline note", "A softer block for reader context."],
              ].map(([title, copy]) => (
                <article className="background-lab-mini-card" key={title}>
                  <PenLine aria-hidden="true" size={18} />
                  <h3>{title}</h3>
                  <p>{copy}</p>
                  <Link href="/overview/">
                    Preview link
                    <ChevronRight aria-hidden="true" size={16} />
                  </Link>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="background-lab-band" aria-label="Density preview">
          <div>
            <p className="eyebrow">Density check</p>
            <h2>Stats, tags, dividers, and a busier content band.</h2>
          </div>
          <div className="background-lab-stat-grid">
            {densityStats.map(({ value, label }) => (
              <div className="background-lab-stat" key={label}>
                <strong>{numberFormatter.format(value)}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <div className="background-lab-tags" aria-label="Sample tags">
            {["Local first", "Readable", "Organic", "Low noise", "Responsive"].map(
              (tag) => (
                <span key={tag}>{tag}</span>
              ),
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
