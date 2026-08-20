import {
  ArrowRight,
  Check,
  Circle,
  ExternalLink,
  LoaderCircle,
} from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { MarkdownBody } from "@/components/MarkdownBody";
import type {
  WorkingRevisionSession,
  WorkingRevisionStatus,
} from "@/lib/editorial-revision-session";
import type { ParagraphFingerprint } from "@/lib/manuscript-data";

import styles from "../../admin.module.css";
import { readWorkingRevisionSession } from "../../adminData";
import { readRevisionOriginalContext } from "../revisionSourceData";
import { RevisionSessionRefresh } from "./RevisionSessionRefresh";

export const dynamic = "force-dynamic";

const numberFormat = new Intl.NumberFormat("en-US");

const steps = [
  {
    key: "direction",
    label: "Direction",
    description: "The editor names what should change.",
  },
  {
    key: "variants",
    label: "Variants",
    description: "The agent publishes distinct approaches.",
  },
  {
    key: "approval",
    label: "Approval",
    description: "The editor chooses the finished language.",
  },
  {
    key: "record",
    label: "Record",
    description: "Durable evidence follows approval.",
  },
] as const;

function statusLabel(status: WorkingRevisionStatus): string {
  if (status === "awaiting-intent") return "Waiting for direction";
  if (status === "drafting") return "Preparing variants";
  if (status === "review") return "Ready for review";
  if (status === "approved") return "Approved";
  return "Recorded";
}

function currentStep(status: WorkingRevisionStatus): number {
  if (status === "awaiting-intent") return 0;
  if (status === "drafting" || status === "review") return 1;
  if (status === "approved") return 2;
  return 3;
}

function StepIcon({
  complete,
  current,
}: {
  complete: boolean;
  current: boolean;
}) {
  if (complete) return <Check aria-hidden="true" size={15} />;
  if (current) {
    return (
      <LoaderCircle
        aria-hidden="true"
        className={styles.revisionStepSpinner}
        size={15}
      />
    );
  }
  return <Circle aria-hidden="true" size={11} />;
}

function WaitingState({ session }: { session: WorkingRevisionSession }) {
  if (session.status === "awaiting-intent") {
    return (
      <section className={styles.revisionWaiting} aria-labelledby="revision-waiting-title">
        <p className={styles.eyebrow}>Your turn</p>
        <h2 id="revision-waiting-title">What do you want changed?</h2>
        <p>
          Answer in the chat that opened this session. The agent should not
          diagnose, rewrite, or generate variants until it understands your
          direction.
        </p>
      </section>
    );
  }
  if (session.status === "drafting") {
    return (
      <section className={styles.revisionWaiting} aria-labelledby="revision-drafting-title">
        <LoaderCircle
          aria-hidden="true"
          className={styles.revisionStepSpinner}
          size={20}
        />
        <p className={styles.eyebrow}>In progress</p>
        <h2 id="revision-drafting-title">The next variants are being prepared.</h2>
        <p>
          This page refreshes automatically. The chat will tell you when the
          next comparison is ready.
        </p>
      </section>
    );
  }
  return null;
}

export default async function WorkingRevisionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  const session = readWorkingRevisionSession(section);
  if (!session) notFound();
  const original = readRevisionOriginalContext(
    session.editorialId,
    session.currentHeading,
    session.selectedPassage,
  );
  const originalParagraphs: ParagraphFingerprint[] =
    original?.blocks.map((block, index) => ({
      paragraphId: `revision-original-${index + 1}`,
      anchor: original.selectedBlockIndexes.includes(index)
        ? `revision-selected-passage-${index + 1}`
        : `revision-original-${index + 1}`,
      order: index + 1,
      contentHash: "",
      text: block,
    })) ?? [];

  const step = currentStep(session.status);
  const sourceHref = session.paragraphAnchor
    ? `${session.sourceHref}#${session.paragraphAnchor}`
    : session.sourceHref;

  return (
    <div className={styles.revisionWorkspace}>
      <RevisionSessionRefresh
        active={
          session.status === "awaiting-intent" ||
          session.status === "drafting" ||
          session.status === "review"
        }
      />

      <header className={styles.revisionWorkspaceHero}>
        <div>
          <p className={styles.eyebrow}>Working editorial revision</p>
          <h1>{session.currentHeading}</h1>
          <p>
            This is transient working state. It cannot change the manuscript,
            create a ruling, or alter editorial guidance before you approve a
            finished version.
          </p>
        </div>
        <div className={styles.revisionWorkspaceMeta}>
          <span data-revision-status={session.status}>
            {statusLabel(session.status)}
          </span>
          <Link href={sourceHref}>
            Open current manuscript
            <ExternalLink aria-hidden="true" size={14} />
          </Link>
        </div>
      </header>

      <ol className={styles.revisionSteps} aria-label="Revision progress">
        {steps.map((item, index) => (
          <li
            key={item.key}
            data-current={index === step ? "true" : undefined}
            data-complete={index < step ? "true" : undefined}
          >
            <span className={styles.revisionStepIcon}>
              <StepIcon complete={index < step} current={index === step} />
            </span>
            <div>
              <strong>
                {index + 1}. {item.label}
              </strong>
              <p>{item.description}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className={styles.revisionContextGrid}>
        <section
          aria-labelledby="revision-source-title"
        >
          <p className={styles.eyebrow}>Original manuscript</p>
          <h2 id="revision-source-title">
            {original?.heading ?? "Original passage unavailable"}
          </h2>
          {original ? (
            <div className={styles.revisionOriginalProse}>
              <p className={styles.revisionOriginalLegend}>
                <span aria-hidden="true" />
                {original.selectedBlockIndexes.length
                  ? "The closest original passage is highlighted in context."
                  : `Permanent checkpoint ${original.checkpointId}`}
              </p>
              <MarkdownBody
                markdown={original.blocks.join("\n\n")}
                paragraphs={originalParagraphs}
              />
            </div>
          ) : (
            <blockquote>{session.selectedPassage}</blockquote>
          )}
        </section>

        <section aria-labelledby="revision-current-title">
          <p className={styles.eyebrow}>Current edited manuscript</p>
          <h2 id="revision-current-title">The passage you copied</h2>
          <blockquote>{session.selectedPassage}</blockquote>
          <Link className={styles.revisionSourceLink} href={sourceHref}>
            Read it in the current manuscript
            <ExternalLink aria-hidden="true" size={14} />
          </Link>
        </section>
      </div>

      <section
        className={styles.revisionDirection}
        aria-labelledby="revision-direction-title"
      >
        <div className={styles.revisionDirectionHeading}>
          <p className={styles.eyebrow}>Editor direction</p>
          <h2 id="revision-direction-title">
            {session.directions.length
              ? `${numberFormat.format(session.directions.length)} instruction${
                  session.directions.length === 1 ? "" : "s"
              }`
              : "Not supplied yet"}
          </h2>
        </div>
        {session.directions.length ? (
          <ol>
            {session.directions.map((direction) => (
              <li key={`${direction.createdAt}-${direction.text}`}>
                {direction.text}
              </li>
            ))}
          </ol>
        ) : (
          <p>The agent is waiting for you to define the problem.</p>
        )}
      </section>

      <WaitingState session={session} />

      {session.variants.length ? (
        <section
          className={styles.revisionVariants}
          aria-labelledby="revision-variants-title"
        >
          <header>
            <div>
              <p className={styles.eyebrow}>Working comparison</p>
              <h2 id="revision-variants-title">Revision variants</h2>
            </div>
            <p>
              Compare the language, tell the chat what to keep or change, and
              continue until one version is finished.
            </p>
          </header>
          <div className={styles.revisionVariantGrid}>
            {session.variants.map((variant) => (
              <article
                key={variant.label}
                data-variant-status={variant.status}
                className={styles.revisionVariantCard}
              >
                <header>
                  <span>{variant.label}</span>
                  <div>
                    <h3>{variant.title}</h3>
                    <p>{variant.status}</p>
                  </div>
                  {variant.status === "approved" ? (
                    <Check aria-label="Approved" size={17} />
                  ) : null}
                </header>
                <div className={styles.revisionVariantProse}>
                  <MarkdownBody
                    focusWords={false}
                    markdown={variant.text.join("\n\n")}
                  />
                </div>
                <ul>
                  {variant.reasoning.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {session.status === "approved" ? (
        <section className={styles.revisionApproved} aria-labelledby="revision-approved-title">
          <Check aria-hidden="true" size={20} />
          <div>
            <p className={styles.eyebrow}>Approval received</p>
            <h2 id="revision-approved-title">
              Variant {session.approvedVariant} is approved.
            </h2>
            <p>
              The agent may now update the manuscript and create durable
              editorial evidence. Nothing was recorded before this approval.
            </p>
          </div>
        </section>
      ) : null}

      {session.status === "recorded" ? (
        <section className={styles.revisionApproved} aria-labelledby="revision-recorded-title">
          <Check aria-hidden="true" size={20} />
          <div>
            <p className={styles.eyebrow}>Durable record complete</p>
            <h2 id="revision-recorded-title">The approved revision is recorded.</h2>
            <p>{session.durableRecordPath}</p>
            <Link href={`/admin/bench/${session.sectionId}/`}>
              Open the recorded comparison
              <ArrowRight aria-hidden="true" size={15} />
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}
