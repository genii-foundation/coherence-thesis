import { ChevronDown } from "lucide-react";

import { MarkdownBody } from "@/components/MarkdownBody";
import { GuidelineHistoryDisclosure } from "@/components/GuidelineHistoryDisclosure";

import styles from "../admin.module.css";
import {
  editorialStandardPath,
  readEditorialGuidelines,
  readEditorialVoiceCards,
} from "./guidelinesData";

export const dynamic = "force-dynamic";

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

export default function EditorialGuidelinesPage() {
  const guidelines = readEditorialGuidelines();
  const voiceCards = readEditorialVoiceCards();
  const documentSections = guidelines.sections.filter(
    (section) => section.title !== "Contents",
  );

  return (
    <div className={styles.guidelinesPage}>
      <section
        className={styles.guidelineCurrentSection}
        aria-labelledby="current-standard-title"
      >
        <div className={styles.guidelinesTitle}>
          <h1 id="current-standard-title">Editorial Guidelines</h1>
          <code className={styles.guidelinesPath}>{editorialStandardPath}</code>
        </div>

        <div className={styles.guidelineReadingLayout}>
          <aside className={styles.guidelineOutline} aria-label="On this page">
            <div>
              <span>In this standard</span>
              <ol>
                {documentSections.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`}>{section.title}</a>
                  </li>
                ))}
              </ol>
            </div>
            <div className={styles.guidelineRuleIndex}>
              <span>Named rules</span>
              <div>
                {guidelines.rules.map((rule) => (
                  <a href="#rule-index" key={rule.id} title={rule.obligation}>
                    {rule.id}
                  </a>
                ))}
              </div>
            </div>
          </aside>

          <article
            className={styles.guidelineDocument}
            aria-label="Current editorial standard"
          >
            {documentSections.map((section) => (
              <section id={section.id} key={section.id}>
                <MarkdownBody
                  markdown={section.markdown}
                  focusWords={false}
                  orderedLists
                  headingActions={{
                    [section.markdown.match(/^##\s+(.+)$/m)?.[1] ??
                    section.title]: (
                      <GuidelineHistoryDisclosure
                        title={section.title}
                        history={guidelines.sectionHistories[section.id]!}
                      />
                    ),
                  }}
                />
              </section>
            ))}
          </article>
        </div>
      </section>

      <section
        className={styles.guidelineHistorySection}
        aria-labelledby="guideline-history-title"
      >
        <h2 id="guideline-history-title">Evolution</h2>
        <ol
          className={styles.guidelineTimeline}
          aria-label="Editorial standard history"
        >
          {guidelines.history.map((entry, index) => (
            <li key={entry.hash}>
              <div className={styles.guidelineTimelineMarker}>
                <span aria-hidden="true" />
              </div>
              <article>
                <div className={styles.guidelineTimelineMeta}>
                  <time dateTime={entry.date}>{readableDate(entry.date)}</time>
                  <code>{entry.shortHash}</code>
                  {index === 0 ? <strong>Current standard</strong> : null}
                </div>
                <h3>{entry.subject}</h3>
                {entry.renamedFrom && entry.renamedTo ? (
                  <p className={styles.guidelinePathChange}>
                    Moved from <code>{entry.renamedFrom}</code> to{" "}
                    <code>{entry.renamedTo}</code>.
                  </p>
                ) : null}
                {entry.addedRules.length ? (
                  <div
                    className={styles.guidelineRuleChips}
                    aria-label="Rules introduced"
                  >
                    {entry.addedRules.map((rule) => (
                      <code key={rule}>{rule}</code>
                    ))}
                  </div>
                ) : null}
                <div className={styles.guidelineDiffStats}>
                  <span className={styles.guidelineAdditions}>
                    +{numberFormat.format(entry.additions)}
                  </span>
                  <span className={styles.guidelineDeletions}>
                    −{numberFormat.format(entry.deletions)}
                  </span>
                  <span>{entry.changedPath}</span>
                </div>
              </article>
            </li>
          ))}
        </ol>
      </section>

      <section
        className={styles.voiceCardsSection}
        aria-labelledby="voice-cards-title"
      >
        <h2 id="voice-cards-title">Voice Cards</h2>
        <div className={styles.voiceCardCollection}>
          {voiceCards.map((voiceCard, index) => (
            <details
              className={styles.voiceCard}
              data-voice-card-id={voiceCard.id}
              key={voiceCard.id}
              open={index === 0}
            >
              <summary>
                <span className={styles.voiceCardIdentity}>
                  <span>{voiceCard.label}</span>
                  <strong>{voiceCard.title}</strong>
                </span>
                <span className={styles.voiceCardSummaryMeta}>
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
                <code>{voiceCard.path}</code>
                <MarkdownBody
                  markdown={voiceCard.markdown}
                  focusWords={false}
                  orderedLists
                />
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
