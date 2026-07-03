"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { usePathname } from "next/navigation";
import { Check, Cloud, RotateCcw, Trash2, UserRound } from "lucide-react";
import { loadReaderSections } from "@/lib/reader-data";
import type { ProgressSection } from "@/lib/manuscript-data";
import {
  createEngagementEvent,
  grantSyncConsent,
  markEventsSynced,
  parseSyncConsent,
  revokeSyncConsent,
  unsyncedEvents,
  type ReaderEngagementEvent,
  type ReaderSyncConsent,
} from "@/lib/reader-engagement";
import {
  appendStoredEvent,
  readStoredConsent,
  readStoredEvents,
  readStoredProgress,
  writeStoredConsent,
  writeStoredEvents,
  writeStoredProgress,
} from "@/lib/reader-progress-store";
import {
  deleteReaderAccount,
  deleteRemoteReaderData,
  getCurrentUser,
  isReaderSyncConfigured,
  loadRemoteReaderState,
  onAuthStateChange,
  sendMagicLink,
  signOutReader,
  uploadRemoteEvents,
  upsertRemoteConsent,
  upsertRemoteProgress,
} from "@/lib/reader-sync";
import {
  emptyProgress,
  isSectionRead,
  markRead,
  markSectionOpened,
  mergeProgressStates,
  readPercent,
  recentlyReadSections,
  recordReadingTime,
  recordScrollProgress,
  recommendNextSections,
  updatedSinceRead,
  type ReaderProgressState,
} from "@/lib/reader-state";

function normalizePath(path: string): string {
  return path.endsWith("/") ? path : `${path}/`;
}

function parentRoute(path: string): string {
  return normalizePath(path).replace(/[^/]+\/$/, "");
}

const idleThresholdMs = 45_000;
const scrollMilestones = [25, 50, 75, 100];
// Percent scrolled at which a section counts as read and the read event fires.
const readThresholdPercent = 80;
// How often the visibility timer samples active vs idle time.
const timingSampleIntervalMs = 5_000;
// Trailing debounce before a scroll-driven progress change is persisted, so
// localStorage serialization runs a few times per page instead of per frame.
const scrollWriteDebounceMs = 500;
// Debounce before a local change is pushed to the remote sync backend.
const syncDebounceMs = 1_500;

type SyncStatus = "idle" | "syncing" | "synced" | "paused" | "error";

export function ToolbarProgressIsland() {
  const pathname = usePathname();
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<ProgressSection | undefined>(undefined);
  const syncingRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [progress, setProgress] = useState<ReaderProgressState>(() => emptyProgress());
  const [allSections, setAllSections] = useState<ProgressSection[]>([]);
  const [syncConfigured, setSyncConfigured] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [consent, setConsent] = useState<ReaderSyncConsent>(() => parseSyncConsent(null));
  const [authEmail, setAuthEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const section = useMemo(() => {
    const currentPath = normalizePath(pathname);
    const exactMatch = allSections.find(
      (candidate) => normalizePath(candidate.href) === currentPath,
    );
    if (exactMatch) return exactMatch;
    const parentMatches = allSections.filter(
      (candidate) => parentRoute(candidate.href) === currentPath,
    );
    return parentMatches.length === 1 ? parentMatches[0] : undefined;
  }, [allSections, pathname]);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setProgress(readStoredProgress());
      setConsent(readStoredConsent());
      setSyncConfigured(isReaderSyncConfigured());
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    let mounted = true;

    getCurrentUser().then((currentUser) => {
      if (!mounted) return;
      setUser(
        currentUser
          ? { id: currentUser.id, email: currentUser.email ?? undefined }
          : null,
      );
    });

    const subscription = onAuthStateChange((currentUser) => {
      setUser(
        currentUser
          ? { id: currentUser.id, email: currentUser.email ?? undefined }
          : null,
      );
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    loadReaderSections()
      .then((sections) => {
        if (mounted) setAllSections(sections);
      })
      .catch(() => {
        if (mounted) setAllSections([]);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const closeTimer = window.setTimeout(() => {
      setOpen(false);
      setConfirmingDelete(false);
    }, 0);
    return () => window.clearTimeout(closeTimer);
  }, [pathname]);

  useEffect(() => {
    sectionRef.current = section;
  }, [section]);


  useEffect(() => {
    if (!user) return;
    let mounted = true;

    loadRemoteReaderState(user.id)
      .then((remote) => {
        if (!mounted) return;
        if (remote.consent) {
          setConsent(remote.consent);
          writeStoredConsent(remote.consent);
        }
        if (remote.consent?.granted && remote.progress) {
          setProgress((current) => {
            const next = mergeProgressStates(current, remote.progress ?? emptyProgress());
            writeStoredProgress(next);
            return next;
          });
        }
      })
      .catch(() => {
        if (mounted) {
          setSyncStatus("error");
          setSyncMessage("Sync could not load. Local progress is still saved.");
        }
      });

    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const dismiss = () => {
      setOpen(false);
      // Disarm the delete confirmation on any close so a stale armed state
      // cannot commit on the next open.
      setConfirmingDelete(false);
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        dismiss();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    if (!section) return;
    const existingOpenCount =
      readStoredProgress().sections[section.sectionId]?.openCount ?? 0;
    const openTimer = window.setTimeout(() => {
      setProgress((current) => {
        const next = markSectionOpened(current, section, Date.now(), "direct");
        writeStoredProgress(next);
        return next;
      });
    }, 0);
    appendStoredEvent(
      createEngagementEvent(existingOpenCount > 0 ? "section_returned" : "section_opened", {
        sectionId: section.sectionId,
        contentHash: section.contentHash,
        route: pathname,
      }),
    );
    appendStoredEvent(
      createEngagementEvent("navigation_source_used", {
        sectionId: section.sectionId,
        contentHash: section.contentHash,
        route: pathname,
        payload: { source: "direct" },
      }),
    );

    const timing = {
      activeMs: 0,
      idleMs: 0,
      totalVisibleMs: 0,
      lastSampleAt: Date.now(),
      lastActivityAt: Date.now(),
    };
    const reachedMilestones = new Set<number>();
    let readThresholdCaptured = false;

    const sampleTiming = () => {
      const now = Date.now();
      if (document.visibilityState !== "visible") {
        timing.lastSampleAt = now;
        return;
      }
      const delta = Math.max(0, now - timing.lastSampleAt);
      timing.totalVisibleMs += delta;
      if (now - timing.lastActivityAt > idleThresholdMs) {
        timing.idleMs += delta;
      } else {
        timing.activeMs += delta;
      }
      timing.lastSampleAt = now;
    };
    const markActivity = () => {
      sampleTiming();
      timing.lastActivityAt = Date.now();
    };
    // Persist scroll-driven progress on a trailing debounce instead of on every
    // frame. writeStoredProgress serializes the whole progress blob and
    // dispatches an event that other islands re-read, so per-frame writes stall
    // scrolling on long pages.
    let pendingWrite: ReaderProgressState | null = null;
    let writeTimer = 0;
    const flushProgressWrite = () => {
      writeTimer = 0;
      if (!pendingWrite) return;
      writeStoredProgress(pendingWrite);
      pendingWrite = null;
    };
    const scheduleProgressWrite = (next: ReaderProgressState) => {
      pendingWrite = next;
      if (!writeTimer) {
        writeTimer = window.setTimeout(flushProgressWrite, scrollWriteDebounceMs);
      }
    };

    let scrollTicking = false;
    let lastScrollPercent = -1;
    const handleScrollFrame = () => {
      scrollTicking = false;
      markActivity();
      const scrollable = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollable <= 0) return;
      const percent = Math.round((window.scrollY / scrollable) * 100);
      if (percent === lastScrollPercent) return;
      lastScrollPercent = percent;
      const reached = scrollMilestones.filter(
        (milestone) => percent >= milestone && !reachedMilestones.has(milestone),
      );
      if (reached.length > 0) {
        reached.forEach((milestone) => {
          reachedMilestones.add(milestone);
          appendStoredEvent(
            createEngagementEvent("scroll_milestone", {
              sectionId: section.sectionId,
              contentHash: section.contentHash,
              route: pathname,
              payload: { percent: milestone },
            }),
          );
        });
      }
      setProgress((current) => {
        const next = recordScrollProgress(current, section, percent);
        if (next !== current) scheduleProgressWrite(next);
        return next;
      });
      if (percent < readThresholdPercent) return;
      if (!readThresholdCaptured) {
        readThresholdCaptured = true;
        appendStoredEvent(
          createEngagementEvent("read_threshold_crossed", {
            sectionId: section.sectionId,
            contentHash: section.contentHash,
            route: pathname,
            payload: { percent },
          }),
        );
      }
      setProgress((current) => {
        const existing = current.sections[section.sectionId];
        if (existing?.contentHash === section.contentHash && existing.percent >= 100) {
          return current;
        }
        const next = markRead(current, section);
        // Marking read is meaningful state; persist it immediately and keep the
        // pending debounce pointed at the same value so a later flush is a no-op.
        writeStoredProgress(next);
        pendingWrite = next;
        return next;
      });
    };
    const onScroll = () => {
      if (scrollTicking) return;
      scrollTicking = true;
      window.requestAnimationFrame(handleScrollFrame);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", markActivity, { passive: true });
    window.addEventListener("keydown", markActivity);
    window.addEventListener("focus", markActivity);
    document.addEventListener("visibilitychange", sampleTiming);
    const interval = window.setInterval(sampleTiming, timingSampleIntervalMs);
    handleScrollFrame();
    return () => {
      window.clearTimeout(openTimer);
      flushProgressWrite();
      sampleTiming();
      window.clearInterval(interval);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", markActivity);
      window.removeEventListener("keydown", markActivity);
      window.removeEventListener("focus", markActivity);
      document.removeEventListener("visibilitychange", sampleTiming);
      const activeSeconds = Math.round(timing.activeMs / 1000);
      const idleSeconds = Math.round(timing.idleMs / 1000);
      const totalVisibleSeconds = Math.round(timing.totalVisibleMs / 1000);
      if (activeSeconds > 0 || idleSeconds > 0 || totalVisibleSeconds > 0) {
        const currentSection = sectionRef.current ?? section;
        setProgress((current) => {
          const next = recordReadingTime(current, currentSection, {
            activeSeconds,
            idleSeconds,
            totalVisibleSeconds,
          });
          writeStoredProgress(next);
          return next;
        });
        appendStoredEvent(
          createEngagementEvent("section_visibility_ended", {
            sectionId: section.sectionId,
            contentHash: section.contentHash,
            route: pathname,
            payload: {
              activeSeconds,
              idleSeconds,
              totalVisibleSeconds,
            },
          }),
        );
      }
    };
  }, [pathname, section]);

  const syncNow = useCallback(
    async (overrideProgress?: ReaderProgressState, overrideEvents?: ReaderEngagementEvent[]) => {
      if (!user || !consent.granted || syncingRef.current) return;
      syncingRef.current = true;
      setSyncStatus("syncing");
      setSyncMessage("Syncing reading history.");
      const currentProgress = overrideProgress ?? readStoredProgress();
      const currentEvents = overrideEvents ?? readStoredEvents();
      const pendingEvents = unsyncedEvents(currentEvents);

      try {
        const progressResult = await upsertRemoteProgress(user.id, currentProgress);
        const consentResult = await upsertRemoteConsent(user.id, consent);
        const eventResult = await uploadRemoteEvents(user.id, pendingEvents);
        const error =
          progressResult.error ?? consentResult.error ?? eventResult.error ?? null;
        if (error) throw error;
        if (eventResult.uploadedIds.length > 0) {
          writeStoredEvents(markEventsSynced(currentEvents, eventResult.uploadedIds));
        }
        setSyncStatus("synced");
        setSyncMessage("Synced with your account.");
      } catch {
        setSyncStatus("error");
        setSyncMessage("Sync paused. Local progress is still saved.");
      } finally {
        syncingRef.current = false;
      }
    },
    [consent, user],
  );

  useEffect(() => {
    if (!user || !consent.granted) return;
    const timer = window.setTimeout(() => {
      void syncNow(progress);
    }, syncDebounceMs);
    return () => window.clearTimeout(timer);
  }, [consent.granted, progress, syncNow, user]);

  const percent = useMemo(
    () => readPercent(progress, allSections),
    [allSections, progress],
  );
  const recommendations = useMemo(
    () => recommendNextSections(progress, allSections, 4),
    [allSections, progress],
  );
  const recentSections = useMemo(
    () => recentlyReadSections(progress, allSections, 4),
    [allSections, progress],
  );
  const revisedCount = recommendations.filter((item) => item.isUpdated).length;
  const isRead = section ? isSectionRead(progress, section) : false;
  const isUpdated = section ? updatedSinceRead(progress, section) : false;

  useEffect(() => {
    if (!open || recommendations.length === 0) return;
    recommendations.forEach((item, index) => {
      appendStoredEvent(
        createEngagementEvent("recommendation_shown", {
          sectionId: item.sectionId,
          route: item.href,
          payload: {
            rank: index + 1,
            isUpdated: item.isUpdated,
          },
        }),
      );
    });
  }, [open, recommendations]);

  function markCurrentRead(): void {
    if (!section) return;
    appendStoredEvent(
      createEngagementEvent("manual_mark_read", {
        sectionId: section.sectionId,
        contentHash: section.contentHash,
        route: pathname,
      }),
    );
    setProgress((current) => {
      const next = markRead(current, section, 100, Date.now(), "manual");
      writeStoredProgress(next);
      return next;
    });
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage("");
    const email = authEmail.trim();
    if (!email) return;
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      pathname,
    )}`;
    const { error } = await sendMagicLink(email, redirectTo);
    setAuthMessage(
      error ? "Sign in could not start. Try again." : "Check your email to finish.",
    );
  }

  async function grantConsentAndSync() {
    if (!user) return;
    const nextConsent = grantSyncConsent();
    setConsent(nextConsent);
    writeStoredConsent(nextConsent);
    try {
      const remote = await loadRemoteReaderState(user.id);
      const nextProgress = remote.progress
        ? mergeProgressStates(readStoredProgress(), remote.progress)
        : readStoredProgress();
      writeStoredProgress(nextProgress);
      setProgress(nextProgress);
      const { error } = await upsertRemoteConsent(user.id, nextConsent);
      if (error) throw error;
      await syncNow(nextProgress);
    } catch {
      setSyncStatus("error");
      setSyncMessage("Sync could not start. Local progress is still saved.");
    }
  }

  async function revokeConsentAndPause() {
    const nextConsent = revokeSyncConsent(consent);
    setConsent(nextConsent);
    writeStoredConsent(nextConsent);
    if (user) {
      const { error } = await upsertRemoteConsent(user.id, nextConsent);
      if (error) {
        setSyncStatus("error");
        setSyncMessage("Sync could not be paused remotely. It is paused locally.");
        return;
      }
    }
    setSyncStatus("paused");
    setSyncMessage("Sync paused. Local history stays in this browser.");
  }

  async function deleteSyncedData() {
    if (!user) return;
    const { error } = await deleteRemoteReaderData(user.id);
    if (error) {
      setSyncStatus("error");
      setSyncMessage("Synced data could not be deleted.");
      return;
    }
    const nextConsent = revokeSyncConsent(consent);
    setConsent(nextConsent);
    writeStoredConsent(nextConsent);
    setSyncStatus("paused");
    setSyncMessage("Synced data deleted. Local history was kept.");
  }

  async function deleteAccount() {
    // Two-step confirmation: the first click arms the action, the second
    // commits it. Account deletion is irreversible and cascades all synced data.
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setSyncMessage("Click again to permanently delete your account.");
      return;
    }
    setConfirmingDelete(false);
    const { error } = await deleteReaderAccount();
    if (error) {
      setSyncStatus("error");
      setSyncMessage("Account deletion failed.");
      return;
    }
    await signOutReader();
    setUser(null);
    setSyncStatus("paused");
    setSyncMessage("Account deleted. Local history was kept.");
  }

  async function signOut() {
    await signOutReader();
    setUser(null);
    setSyncStatus("idle");
    setSyncMessage("Signed out. Local progress is still saved.");
  }

  return (
    <div className="progress-menu" ref={containerRef}>
      <button
        type="button"
        className="progress-menu-button"
        aria-label={`Progress ${percent}%`}
        aria-expanded={open}
        aria-controls="reader-progress-menu"
        style={
          { "--progress-value": percent } as CSSProperties & {
            "--progress-value": number;
          }
        }
        onClick={() => {
          setOpen((current) => !current);
          setConfirmingDelete(false);
        }}
      >
        <span className="progress-percent">{percent}%</span>
      </button>
      {open && (
        <div
          id="reader-progress-menu"
          className="reader-status progress-popover"
          role="region"
          aria-label="Reader progress"
        >
          <div className="progress-section">
            <p className="eyebrow">
              {user && consent.granted ? "Synced progress" : "Local progress"}
            </p>
            <div className="progress-row">
              <div className="progress-bar" aria-hidden="true">
                <span style={{ width: `${percent}%` }} />
              </div>
              <strong>{percent}%</strong>
            </div>
            <p className="quiet-copy">
              {user && consent.granted
                ? "Synced with your account after consent."
                : "Reading history is kept in this browser until you choose to sync."}
            </p>
          </div>
          <div className="progress-section reader-sync">
            <p className="eyebrow">Sync</p>
            {!syncConfigured && (
              <p className="quiet-copy">Sync is not configured for this build.</p>
            )}
            {syncConfigured && !user && (
              <form className="reader-sync-form" onSubmit={submitEmail}>
                <label htmlFor="reader-sync-email">Email</label>
                <input
                  id="reader-sync-email"
                  type="email"
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="you@example.com"
                />
                <button type="submit" className="icon-button">
                  <UserRound aria-hidden="true" size={17} />
                  <span>Sign in to sync</span>
                </button>
                {authMessage && (
                  <p className="quiet-copy" role="status" aria-live="polite">
                    {authMessage}
                  </p>
                )}
              </form>
            )}
            {syncConfigured && user && !consent.granted && (
              <div className="reader-sync-consent">
                <p className="quiet-copy">
                  Sign in is active. Sync will not upload anything until you allow it.
                </p>
                <button type="button" className="icon-button" onClick={grantConsentAndSync}>
                  <Cloud aria-hidden="true" size={17} />
                  <span>Allow sync</span>
                </button>
              </div>
            )}
            {syncConfigured && user && consent.granted && (
              <div className="reader-sync-actions">
                <p className="quiet-copy">{user.email ?? "Signed in"}</p>
                <div className="reader-actions">
                  <button type="button" className="icon-button" onClick={() => syncNow()}>
                    <Cloud aria-hidden="true" size={17} />
                    <span>{syncStatus === "syncing" ? "Syncing" : "Sync now"}</span>
                  </button>
                  <button type="button" className="icon-button" onClick={revokeConsentAndPause}>
                    <RotateCcw aria-hidden="true" size={17} />
                    <span>Pause sync</span>
                  </button>
                  <button type="button" className="icon-button" onClick={signOut}>
                    <UserRound aria-hidden="true" size={17} />
                    <span>Sign out</span>
                  </button>
                </div>
                <div className="reader-actions">
                  <button type="button" className="icon-button" onClick={deleteSyncedData}>
                    <Trash2 aria-hidden="true" size={17} />
                    <span>Delete synced data</span>
                  </button>
                  <button
                    type="button"
                    className="icon-button"
                    onClick={deleteAccount}
                    aria-pressed={confirmingDelete}
                  >
                    <Trash2 aria-hidden="true" size={17} />
                    <span>
                      {confirmingDelete
                        ? "Confirm delete account"
                        : "Delete account"}
                    </span>
                  </button>
                </div>
              </div>
            )}
            {syncMessage && (
              <p className="quiet-copy" role="status" aria-live="polite">
                {syncMessage}
              </p>
            )}
          </div>
          {section && (
            <div className="reader-actions progress-section">
              <button type="button" className="icon-button" onClick={markCurrentRead}>
                <Check aria-hidden="true" size={17} />
                <span>
                  {isRead
                    ? "Current section is marked read"
                    : "Mark current section as read"}
                </span>
              </button>
              {isUpdated && (
                <span className="updated-badge">
                  <RotateCcw aria-hidden="true" size={15} />
                  <span>Updated since read</span>
                </span>
              )}
            </div>
          )}
          {recentSections.length > 0 && (
            <div className="recently-read progress-section">
              <p className="eyebrow">Recently read</p>
              <div className="progress-link-list">
                {recentSections.map((item) => (
                  <a key={item.sectionId} href={item.href}>
                    {item.title}
                  </a>
                ))}
              </div>
            </div>
          )}
          {recommendations.length > 0 && (
            <div className="recommendations progress-section">
              <p className="eyebrow">
                {revisedCount > 0 ? "Revised sections first" : "Recommended next"}
              </p>
              <div className="progress-link-list">
                {recommendations.map((item) => (
                  <a
                    key={item.sectionId}
                    href={item.href}
                    className={item.isUpdated ? "revised-link" : undefined}
                    onClick={() =>
                      appendStoredEvent(
                        createEngagementEvent("recommendation_clicked", {
                          sectionId: item.sectionId,
                          route: item.href,
                          payload: { isUpdated: item.isUpdated },
                        }),
                      )
                    }
                  >
                    {item.isUpdated ? "Updated: " : ""}
                    {item.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
