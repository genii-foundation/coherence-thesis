"use client";

import * as Popover from "@radix-ui/react-popover";
import { GitCommitHorizontal } from "lucide-react";
import { useState } from "react";

import type { GuidelineSectionHistory } from "@/app/admin/guidelines/guidelinesData";
import styles from "@/app/admin/admin.module.css";

const dateFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

function readableDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : dateFormat.format(date);
}

export function GuidelineHistoryDisclosure({
  history,
  title,
}: {
  history: GuidelineSectionHistory;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const revisionCount = history.revisions.length;
  const revisionLabel = `${revisionCount.toLocaleString("en-US")} recorded ${
    revisionCount === 1 ? "revision" : "revisions"
  }`;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          className={styles.guidelineHistoryButton}
          aria-label={`View Git history for ${title}, ${revisionLabel}`}
          aria-expanded={open}
        >
          <GitCommitHorizontal aria-hidden="true" size={17} strokeWidth={1.7} />
          <span>{revisionCount.toLocaleString("en-US")}</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          className={styles.guidelineHistoryPopover}
          side="bottom"
          align="end"
          sideOffset={8}
          collisionPadding={12}
        >
          <header>
            <p>Section history</p>
            <h3>{title}</h3>
            <span>
              Introduced {readableDate(history.introducedAt)} ·{" "}
              {revisionLabel}
            </span>
          </header>

          <ol aria-label={`Git history for ${title}`}>
            {history.revisions.map((revision, index) => {
              const current = index === history.revisions.length - 1;
              return (
                <li key={revision.hash}>
                  <div className={styles.guidelineHistoryPopoverMeta}>
                    <strong>
                      {revision.kind === "introduced" ? "Introduced" : "Revised"}
                    </strong>
                    <time dateTime={revision.date}>
                      {readableDate(revision.date)}
                    </time>
                    <code>{revision.shortHash}</code>
                    {current ? <em>Current</em> : null}
                  </div>
                  <p>{revision.subject}</p>
                  <div className={styles.guidelineHistoryPopoverChanges}>
                    <span className={styles.guidelineAdditions}>
                      +{revision.additions.toLocaleString("en-US")}
                    </span>
                    <span className={styles.guidelineDeletions}>
                      −{revision.deletions.toLocaleString("en-US")}
                    </span>
                    {revision.addedRules.map((rule) => (
                      <code key={rule}>{rule}</code>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
          <Popover.Arrow
            className={styles.guidelineHistoryPopoverArrow}
            width={18}
            height={9}
          />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
