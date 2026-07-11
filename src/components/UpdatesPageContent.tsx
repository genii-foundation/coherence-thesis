import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { GitHubMark } from "@/components/GitHubMark";
import {
  formatUpdateDay,
  formatUpdateLineCount,
  updateKindLabels,
  updatesBranch,
  updatesRepositoryUrl,
  type UpdateDay,
} from "@/lib/updates";
import {
  getUpdatesPageHref,
  getUpdatesTotalPages,
  type UpdatesMode,
} from "@/lib/updates-pagination";

function UpdatesPagination({
  currentPage,
  mode,
  placement,
}: {
  currentPage: number;
  mode: UpdatesMode;
  placement: "top" | "bottom";
}) {
  const totalPages = getUpdatesTotalPages(mode);
  const otherMode = mode === "all" ? "literary" : "all";

  return (
    <nav
      className={"updates-pagination updates-pagination-" + placement}
      aria-label={
        placement === "top" ? "Updates pagination" : "Updates pagination, end"
      }
    >
      <Link
        className="updates-mode-link"
        href={getUpdatesPageHref(1, otherMode)}
      >
        {mode === "all" ? "Show Only Literary Updates" : "Show All Updates"}
      </Link>
      {Array.from({ length: totalPages }, (_, index) => {
        const page = index + 1;
        const label = page === 1 ? "Latest" : page.toLocaleString();
        return page === currentPage ? (
          <span aria-current="page" key={page}>
            {label}
          </span>
        ) : (
          <Link href={getUpdatesPageHref(page, mode)} key={page}>
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

export function UpdatesPageContent({
  currentPage,
  days,
  mode,
  totalCommitCount,
  totalDayCount,
}: {
  currentPage: number;
  days: UpdateDay[];
  mode: UpdatesMode;
  totalCommitCount: number;
  totalDayCount: number;
}) {
  return (
    <div className="page-frame updates-page">
      <header className="page-heading updates-heading">
        <h1>Updates</h1>
        <p>Every change to the thesis, and its reader interface.</p>
        <p className="updates-summary">
          <strong>{totalCommitCount.toLocaleString()}</strong> commits across{" "}
          <strong>{totalDayCount.toLocaleString()}</strong> days, newest first.{" "}
          <a
            href={updatesRepositoryUrl + "/commits/" + updatesBranch}
            rel="noopener noreferrer"
            target="_blank"
          >
            <GitHubMark className="updates-summary-github-icon" />
            Full history
          </a>
        </p>
      </header>

      <UpdatesPagination
        currentPage={currentPage}
        mode={mode}
        placement="top"
      />

      <section className="updates-history" aria-label="Updates history">
        {days.map((day, dayIndex) => {
          const isLatestDay = currentPage === 1 && dayIndex === 0;
          return (
            <section
              className="updates-day"
              aria-labelledby={"updates-" + day.date}
              data-update-day={day.date}
              data-latest-day={isLatestDay ? "true" : undefined}
              key={day.date}
            >
              <header className="updates-day-heading">
                <h2 id={"updates-" + day.date}>
                  <time dateTime={day.date}>{formatUpdateDay(day.date)}</time>
                </h2>
                <p>
                  {day.entries.length.toLocaleString()}{" "}
                  {day.entries.length === 1 ? "commit" : "commits"}
                </p>
              </header>

              <div className="updates-timeline-rail" aria-hidden="true" />

              <ol className="updates-list">
                {day.entries.map((entry, entryIndex) => {
                  const isLatest = isLatestDay && entryIndex === 0;
                  const hasPullRequest = Boolean(
                    entry.pullRequestUrl && entry.pullRequestNumber,
                  );
                  const primaryHref = hasPullRequest
                    ? entry.pullRequestUrl!
                    : entry.commitUrl;
                  const primaryLabel = hasPullRequest
                    ? "Open PR #" +
                      entry.pullRequestNumber!.toLocaleString() +
                      ": " +
                      entry.title +
                      " on GitHub"
                    : "Open commit " +
                      entry.shortSha +
                      ": " +
                      entry.title +
                      " on GitHub";
                  const fileLabel =
                    entry.filesChanged === 1 ? "file" : "files";
                  const lineLabel =
                    entry.linesChanged === 1 ? "line" : "lines";
                  return (
                    <li
                      className={
                        isLatest ? "updates-entry is-latest" : "updates-entry"
                      }
                      data-primary-target={
                        hasPullRequest ? "pull-request" : "commit"
                      }
                      data-update-sha={entry.sha}
                      key={entry.sha}
                    >
                      <article>
                        <a
                          className="updates-card-link"
                          href={primaryHref}
                          rel="noopener noreferrer"
                          target="_blank"
                          aria-label={primaryLabel}
                        />
                        <div className="updates-card-content">
                          <div className="updates-card-main">
                            <div className="updates-entry-meta">
                              {isLatest ? (
                                <span className="updates-latest-badge">
                                  Latest
                                </span>
                              ) : null}
                              <span
                                className="updates-kind"
                                data-update-kind={entry.kind}
                              >
                                {updateKindLabels[entry.kind]}
                              </span>
                              {entry.pullRequestUrl &&
                              entry.pullRequestNumber ? (
                                <a
                                  className="updates-pull-link updates-primary-reference"
                                  href={entry.pullRequestUrl}
                                  rel="noopener noreferrer"
                                  target="_blank"
                                  aria-label={
                                    "Open PR #" +
                                    entry.pullRequestNumber.toLocaleString() +
                                    " on GitHub"
                                  }
                                >
                                  PR #{entry.pullRequestNumber.toLocaleString()}
                                </a>
                              ) : null}
                              {hasPullRequest ? (
                                <a
                                  className="updates-commit-reference updates-commit-link updates-secondary-reference"
                                  href={entry.commitUrl}
                                  rel="noopener noreferrer"
                                  target="_blank"
                                  aria-label={
                                    "Open commit " +
                                    entry.shortSha +
                                    " on GitHub"
                                  }
                                >
                                  <GitHubMark className="updates-github-icon" />
                                  <code>{entry.shortSha}</code>
                                </a>
                              ) : (
                                <span className="updates-commit-reference updates-primary-reference">
                                  <GitHubMark className="updates-github-icon" />
                                  <code>{entry.shortSha}</code>
                                </span>
                              )}
                              {entry.deploymentUrl ? (
                                <a
                                  className="updates-deployment-link updates-secondary-reference"
                                  href={entry.deploymentUrl}
                                  rel="noopener noreferrer"
                                  target="_blank"
                                  aria-label={
                                    "View version for " +
                                    entry.shortSha +
                                    " in a new tab"
                                  }
                                >
                                  View version
                                  <ExternalLink aria-hidden="true" size={13} />
                                </a>
                              ) : null}
                            </div>
                            <h3>{entry.title}</h3>
                          </div>
                          <div
                            className="updates-change-summary"
                            data-change-level={entry.changeLevel}
                            data-files-changed={entry.filesChanged}
                            data-lines-changed={entry.linesChanged}
                          >
                            <span className="sr-only">
                              {entry.filesChanged.toLocaleString()} {fileLabel}{" "}
                              changed, {entry.linesChanged.toLocaleString()}{" "}
                              {lineLabel} changed. Relative change size{" "}
                              {entry.changeLevel.toLocaleString()} of 5.
                            </span>
                            <span
                              className="updates-change-meter"
                              aria-hidden="true"
                            >
                              {Array.from({ length: 5 }, (_, index) => (
                                <span
                                  data-filled={
                                    index < entry.changeLevel
                                      ? "true"
                                      : undefined
                                  }
                                  key={index}
                                />
                              ))}
                            </span>
                            <span
                              className="updates-change-counts"
                              aria-hidden="true"
                            >
                              <span>
                                <strong>
                                  {entry.filesChanged.toLocaleString()}
                                </strong>{" "}
                                {fileLabel}
                              </span>
                              <span>
                                <strong>
                                  {formatUpdateLineCount(entry.linesChanged)}
                                </strong>{" "}
                                {lineLabel}
                              </span>
                            </span>
                          </div>
                        </div>
                      </article>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </section>

      <UpdatesPagination
        currentPage={currentPage}
        mode={mode}
        placement="bottom"
      />
    </div>
  );
}
