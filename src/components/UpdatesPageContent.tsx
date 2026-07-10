import Link from "next/link";
import { GitHubMark } from "@/components/GitHubMark";
import {
  formatUpdateDay,
  updateKindLabels,
  updatesBranch,
  updatesRepositoryUrl,
  type UpdateDay,
} from "@/lib/updates";
import {
  getUpdatesPageHref,
  getUpdatesTotalPages,
} from "@/lib/updates-pagination";

function UpdatesPagination({
  currentPage,
  placement,
}: {
  currentPage: number;
  placement: "top" | "bottom";
}) {
  const totalPages = getUpdatesTotalPages();

  return (
    <nav
      className={"updates-pagination updates-pagination-" + placement}
      aria-label={
        placement === "top" ? "Updates pagination" : "Updates pagination, end"
      }
    >
      {Array.from({ length: totalPages }, (_, index) => {
        const page = index + 1;
        const label = page === 1 ? "Latest" : page.toLocaleString();
        return page === currentPage ? (
          <span aria-current="page" key={page}>
            {label}
          </span>
        ) : (
          <Link href={getUpdatesPageHref(page)} key={page}>
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
  totalCommitCount,
  totalDayCount,
}: {
  currentPage: number;
  days: UpdateDay[];
  totalCommitCount: number;
  totalDayCount: number;
}) {
  return (
    <div className="page-frame updates-page">
      <header className="page-heading updates-heading">
        <h1>Updates</h1>
        <p>
          Every change to the thesis and its reader interface, newest first.
        </p>
        <p className="updates-summary">
          <strong>{totalCommitCount.toLocaleString()}</strong> commits across{" "}
          <strong>{totalDayCount.toLocaleString()}</strong> days.{" "}
          <a
            href={updatesRepositoryUrl + "/commits/" + updatesBranch}
            rel="noopener noreferrer"
            target="_blank"
          >
            <GitHubMark className="updates-summary-github-icon" />
            Browse history
          </a>
          .
        </p>
      </header>

      <UpdatesPagination currentPage={currentPage} placement="top" />

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
                  return (
                    <li
                      className={
                        isLatest ? "updates-entry is-latest" : "updates-entry"
                      }
                      data-update-sha={entry.sha}
                      key={entry.sha}
                    >
                      <article>
                        <a
                          className="updates-card-link"
                          href={entry.commitUrl}
                          rel="noopener noreferrer"
                          target="_blank"
                          aria-label={
                            "Open commit " +
                            entry.shortSha +
                            ": " +
                            entry.title +
                            " on GitHub"
                          }
                        />
                        <div className="updates-card-content">
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
                            <span className="updates-commit-reference">
                              <GitHubMark className="updates-github-icon" />
                              <code>{entry.shortSha}</code>
                            </span>
                            {entry.pullRequestUrl && entry.pullRequestNumber ? (
                              <a
                                className="updates-pull-link"
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
                          </div>
                          <h3>{entry.title}</h3>
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

      <UpdatesPagination currentPage={currentPage} placement="bottom" />
    </div>
  );
}
