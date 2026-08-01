"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, GitCommitHorizontal, Layers3, Link2 } from "lucide-react";

import { MarkdownBody } from "@/components/MarkdownBody";

import styles from "../admin.module.css";
import type { EditorialVoiceCard } from "./guidelinesData";

type VoiceCardFilter = "all" | "active" | "pending";

const numberFormat = new Intl.NumberFormat("en-US");
const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function readableDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : dateFormat.format(date);
}

function voiceCardAnchor(id: string): string {
  return `voice-card-${id}`;
}

export function VoiceCardCollection({
  voiceCards,
}: {
  voiceCards: EditorialVoiceCard[];
}) {
  const [filter, setFilter] = useState<VoiceCardFilter>("all");
  const [openCards, setOpenCards] = useState<Set<string>>(
    () => new Set(["corpus"]),
  );
  const counts = useMemo(
    () => ({
      all: voiceCards.length,
      active: voiceCards.filter((card) => card.status === "Active").length,
      pending: voiceCards.filter((card) => card.status === "Pending").length,
    }),
    [voiceCards],
  );

  useEffect(() => {
    const openLinkedCard = () => {
      const targetId = decodeURIComponent(window.location.hash.slice(1));
      const voiceCard = voiceCards.find(
        (card) => voiceCardAnchor(card.id) === targetId,
      );
      if (!voiceCard) return;

      setFilter("all");
      setOpenCards((current) => {
        if (current.has(voiceCard.id)) return current;
        const next = new Set(current);
        next.add(voiceCard.id);
        return next;
      });
    };

    openLinkedCard();
    window.addEventListener("hashchange", openLinkedCard);
    return () => window.removeEventListener("hashchange", openLinkedCard);
  }, [voiceCards]);

  const setCardOpen = (id: string, open: boolean) => {
    setOpenCards((current) => {
      if (current.has(id) === open) return current;
      const next = new Set(current);
      if (open) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const filters: Array<{ value: VoiceCardFilter; label: string }> = [
    { value: "all", label: "All" },
    { value: "active", label: "Active" },
    { value: "pending", label: "Pending" },
  ];

  return (
    <>
      <fieldset className={styles.voiceCardFilters}>
        <legend>Voice card status</legend>
        <div>
          {filters.map((option) => (
            <label key={option.value}>
              <input
                type="radio"
                name="voice-card-status"
                value={option.value}
                checked={filter === option.value}
                onChange={() => setFilter(option.value)}
              />
              <span>{option.label}</span>
              <strong>{numberFormat.format(counts[option.value])}</strong>
            </label>
          ))}
        </div>
      </fieldset>

      <div className={styles.voiceCardCollection}>
        {voiceCards.map((voiceCard) => {
          const hidden =
            filter !== "all" && voiceCard.status.toLowerCase() !== filter;
          const historyLabel = `${numberFormat.format(voiceCard.history.length)} ${voiceCard.history.length === 1 ? "revision" : "revisions"}`;

          return (
            <details
              className={styles.voiceCard}
              data-voice-card-id={voiceCard.id}
              hidden={hidden}
              id={voiceCardAnchor(voiceCard.id)}
              key={voiceCard.id}
              open={openCards.has(voiceCard.id)}
              onToggle={(event) =>
                setCardOpen(voiceCard.id, event.currentTarget.open)
              }
            >
              <summary>
                <span className={styles.voiceCardIdentity}>
                  <span>{voiceCard.label}</span>
                  <strong>{voiceCard.title}</strong>
                </span>
                <span className={styles.voiceCardSummaryMeta}>
                  <span
                    data-voice-card-history-count
                    title={`${voiceCard.label} Git history`}
                  >
                    <GitCommitHorizontal aria-hidden="true" size={13} />
                    {numberFormat.format(voiceCard.history.length)}
                  </span>
                  <span
                    data-voice-card-status={voiceCard.status.toLowerCase()}
                    title={voiceCard.statusDetail}
                  >
                    {voiceCard.status}
                  </span>
                  <ChevronDown aria-hidden="true" size={18} />
                </span>
              </summary>

              <div className={styles.voiceCardBody}>
                <div className={styles.voiceCardSourceRow}>
                  <code>{voiceCard.path}</code>
                  <a
                    href={`#${voiceCardAnchor(voiceCard.id)}`}
                    aria-label={`Link to ${voiceCard.label} voice card`}
                    title={`Link to ${voiceCard.label} voice card`}
                  >
                    <Link2 aria-hidden="true" size={15} />
                  </a>
                </div>

                {voiceCard.id !== "corpus" ? (
                  <section
                    className={styles.voiceCardAuthority}
                    aria-label={`Effective voice for ${voiceCard.label}`}
                  >
                    <header>
                      <Layers3 aria-hidden="true" size={18} />
                      <div>
                        <span>Effective voice</span>
                        <strong>
                          Corpus floor + {voiceCard.label} overlay
                        </strong>
                      </div>
                    </header>
                    <div>
                      <a href="#voice-card-corpus">
                        <span>Corpus floor</span>
                        <strong>Coherence Thesis</strong>
                        <small>Shared rules and authority</small>
                      </a>
                      <div>
                        <span>Volume overlay</span>
                        <strong>{voiceCard.title}</strong>
                        <p>{voiceCard.departure}</p>
                      </div>
                    </div>
                  </section>
                ) : null}

                <details className={styles.voiceCardHistory}>
                  <summary>
                    <GitCommitHorizontal aria-hidden="true" size={16} />
                    <span>Git journey</span>
                    <strong>{historyLabel}</strong>
                    <ChevronDown aria-hidden="true" size={16} />
                  </summary>
                  <ol
                    aria-label={`Git history for ${voiceCard.label} voice card`}
                  >
                    {voiceCard.history.map((entry, index) => (
                      <li key={entry.hash}>
                        <div>
                          <time dateTime={entry.date}>
                            {readableDate(entry.date)}
                          </time>
                          <code>{entry.shortHash}</code>
                          {index === 0 ? <strong>Current</strong> : null}
                          {index === voiceCard.history.length - 1 ? (
                            <strong>Introduced</strong>
                          ) : null}
                        </div>
                        <p>{entry.subject}</p>
                        <small>
                          <span>+{numberFormat.format(entry.additions)}</span>
                          <span>−{numberFormat.format(entry.deletions)}</span>
                          {entry.changedPath}
                        </small>
                      </li>
                    ))}
                  </ol>
                </details>

                <MarkdownBody
                  markdown={voiceCard.markdown}
                  focusWords={false}
                  orderedLists
                />
              </div>
            </details>
          );
        })}
      </div>
    </>
  );
}
