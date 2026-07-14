"use client";

import { normalizePath, parentRoute } from "@/lib/routes";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import {
  Check,
  ChevronsRight,
  Cloud,
  KeyRound,
  LoaderCircle,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { ProgressCloudBadge } from "@/components/ProgressCloudBadge";
import { ProgressReadAnimation } from "@/components/ProgressReadAnimation";
import {
  readerActiveSectionEvent,
  type ReaderActiveSectionDetail,
} from "@/lib/reader-active-section";
import { loadProgressSections } from "@/lib/reader-data";
import { useLoadedData } from "@/lib/use-loaded-data";
import type { ProgressSection } from "@/lib/manuscript-data";

const emptyProgressSections: ProgressSection[] = [];
import {
  createEngagementEvent,
  grantSyncConsent,
  markEventsSynced,
  parseSyncConsent,
  unsyncedEvents,
  type ReaderEngagementEvent,
  type ReaderSyncConsent,
} from "@/lib/reader-engagement";
import {
  appendStoredEvent,
  readStoredConsent,
  readStoredEvents,
  readStoredProgress,
  updateStoredProgress,
  useReaderProgress,
  writeStoredConsent,
  writeStoredEvents,
} from "@/lib/reader-progress-store";
import { useToolbarMenu } from "@/lib/use-toolbar-menu";
import {
  getCurrentUser,
  isReaderSyncConfigured,
  loadRemoteReaderState,
  onAuthStateChange,
  sendMagicLink,
  signOutReader,
  uploadRemoteEvents,
  upsertRemoteConsent,
  upsertRemoteProgress,
  verifyEmailOtp,
} from "@/lib/reader-sync";
import {
  isSectionRead,
  markRead,
  readerProgressSchemaVersion,
  readPercent,
  reconcileRemoteProgress,
  recentlyReadSections,
  recommendNextSections,
  updatedSinceRead,
  type ReaderProgressState,
} from "@/lib/reader-state";

// Debounce before a local change is pushed to the remote sync backend.
const syncDebounceMs = 1_500;
const lastSyncedStorageKey = "coherence-reader-last-synced-at-v1";
const modalFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

type SyncStatus = "idle" | "syncing" | "synced" | "error";

function readLastSyncedAt(): number | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(lastSyncedStorageKey);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function writeLastSyncedAt(value: number): void {
  window.localStorage.setItem(lastSyncedStorageKey, String(value));
}

function relativeTimeFrom(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.round((now - timestamp) / 1000));
  if (seconds < 45) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function formatLastSyncedAt(timestamp: number | null, now: number): string {
  if (!timestamp) return "Not synced yet";
  const absolute = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(timestamp));
  return `${absolute} (${relativeTimeFrom(timestamp, now)})`;
}

export function ToolbarProgressIsland() {
  const pathname = usePathname();
  const syncingRef = useRef(false);
  const syncLoginContinueRef = useRef<HTMLButtonElement | null>(null);
  const syncLoginModalRef = useRef<HTMLDivElement | null>(null);
  const syncLoginTriggerRef = useRef<HTMLButtonElement | null>(null);
  const syncOtpRef = useRef<HTMLInputElement | null>(null);
  const syncLoginModalWasOpenRef = useRef(false);
  // Set when the remote progress row was written by a newer schema than this
  // client understands. While true, the client neither merges the remote row
  // nor uploads over it, so an outdated device cannot clobber newer data.
  const remoteSchemaAheadRef = useRef(false);
  const progress = useReaderProgress();
  const allSections = useLoadedData<ProgressSection[]>(
    loadProgressSections,
    emptyProgressSections,
  );
  const [syncConfigured, setSyncConfigured] = useState(false);
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [consent, setConsent] = useState<ReaderSyncConsent>(() => parseSyncConsent(null));
  const [authEmail, setAuthEmail] = useState("");
  const [authOtp, setAuthOtp] = useState("");
  const [pendingOtpEmail, setPendingOtpEmail] = useState("");
  const [syncLoginModalEmail, setSyncLoginModalEmail] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("idle");
  const [syncMessage, setSyncMessage] = useState("");
  const [lastSyncedAt, setLastSyncedAt] = useState<number | null>(null);
  const [relativeNow, setRelativeNow] = useState(() => Date.now());
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const [showReadAnimation, setShowReadAnimation] = useState(false);
  const previousReadStateRef = useRef<{ sectionId: string | null; isRead: boolean }>({
    sectionId: null,
    isRead: false,
  });
  const {
    open,
    rendered,
    setOpen,
    toggle,
    containerRef,
    triggerProps,
    popoverProps,
  } = useToolbarMenu<HTMLDivElement>({
    floatingRefs: [syncLoginModalRef],
    onDismiss: () => setSyncLoginModalEmail(""),
    onEscape: () => {
      if (!syncLoginModalEmail) return;
      setSyncLoginModalEmail("");
      return false;
    },
  });

  const section = useMemo(() => {
    const currentPath = normalizePath(pathname);
    const activeMatch = activeSectionId
      ? allSections.find((candidate) => candidate.sectionId === activeSectionId)
      : undefined;
    if (activeMatch) return activeMatch;
    const exactMatch = allSections.find(
      (candidate) => normalizePath(candidate.href) === currentPath,
    );
    if (exactMatch) return exactMatch;
    const parentMatches = allSections.filter(
      (candidate) => parentRoute(candidate.href) === currentPath,
    );
    return parentMatches.length === 1 ? parentMatches[0] : undefined;
  }, [activeSectionId, allSections, pathname]);

  useEffect(() => {
    const hydrationTimer = window.setTimeout(() => {
      setConsent(readStoredConsent());
      setLastSyncedAt(readLastSyncedAt());
      setSyncConfigured(isReaderSyncConfigured());
    }, 0);
    return () => window.clearTimeout(hydrationTimer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setRelativeNow(Date.now());
    }, 30_000);
    return () => window.clearInterval(timer);
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
    const closeTimer = window.setTimeout(() => {
      setOpen(false);
      setSyncLoginModalEmail("");
      setActiveSectionId(null);
    }, 0);
    return () => window.clearTimeout(closeTimer);
  }, [pathname, setOpen]);

  useEffect(() => {
    const onActiveSection = (event: Event) => {
      const detail = (event as CustomEvent<ReaderActiveSectionDetail>).detail;
      setActiveSectionId(detail.sectionId);
    };
    window.addEventListener(readerActiveSectionEvent, onActiveSection);
    return () =>
      window.removeEventListener(readerActiveSectionEvent, onActiveSection);
  }, []);

  useEffect(() => {
    if (!user) return;
    let mounted = true;

    loadRemoteReaderState(user.id)
      .then((remote) => {
        if (!mounted) return;
        const localConsent = readStoredConsent();
        const effectiveConsent = localConsent.granted ? localConsent : remote.consent;
        if (remote.consent && !localConsent.granted) {
          setConsent(remote.consent);
          writeStoredConsent(remote.consent);
        }
        if (effectiveConsent?.granted && remote.progress) {
          const remoteProgress = remote.progress;
          const remoteVersion =
            remote.progressSchemaVersion ?? readerProgressSchemaVersion;
          if (remoteVersion > readerProgressSchemaVersion) {
            remoteSchemaAheadRef.current = true;
            setSyncStatus("error");
            setSyncMessage(
              "Your reading history was saved by a newer version of the reader. Update this device to sync it.",
            );
          } else {
            remoteSchemaAheadRef.current = false;
            updateStoredProgress(
              (current) =>
                reconcileRemoteProgress(current, remoteProgress, remoteVersion) ??
                current,
            );
          }
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
    if (!syncLoginModalEmail) return;
    syncLoginModalWasOpenRef.current = true;
    const modalBackdrop = syncLoginModalRef.current;
    const siteShell = document.querySelector<HTMLElement>(".site-shell");
    const siteShellWasInert = siteShell?.inert ?? false;
    const rootOverflow = document.documentElement.style.overflow;
    const bodyOverflow = document.body.style.overflow;

    if (siteShell) siteShell.inert = true;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    function trapModalFocus(event: KeyboardEvent) {
      if (event.key !== "Tab" || !modalBackdrop) return;
      const focusableElements = Array.from(
        modalBackdrop.querySelectorAll<HTMLElement>(modalFocusableSelector),
      ).filter((element) => element.getClientRects().length > 0);
      const first = focusableElements[0];
      const last = focusableElements.at(-1);
      if (!first || !last) return;

      const activeElement = document.activeElement;
      if (
        event.shiftKey &&
        (activeElement === first || !modalBackdrop.contains(activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (activeElement === last || !modalBackdrop.contains(activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", trapModalFocus);
    const focusTimer = window.setTimeout(() => {
      syncLoginContinueRef.current?.focus();
    }, 0);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener("keydown", trapModalFocus);
      if (siteShell) siteShell.inert = siteShellWasInert;
      document.documentElement.style.overflow = rootOverflow;
      document.body.style.overflow = bodyOverflow;
    };
  }, [syncLoginModalEmail]);

  useEffect(() => {
    if (syncLoginModalEmail || !syncLoginModalWasOpenRef.current) return;
    syncLoginModalWasOpenRef.current = false;
    const focusTimer = window.setTimeout(() => {
      if (pendingOtpEmail) {
        syncOtpRef.current?.focus();
      } else {
        syncLoginTriggerRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(focusTimer);
  }, [pendingOtpEmail, syncLoginModalEmail]);

  const syncNow = useCallback(
    async (
      overrideProgress?: ReaderProgressState,
      overrideEvents?: ReaderEngagementEvent[],
      options: { grantConsent?: boolean } = {},
    ) => {
      if (!user || syncingRef.current) return;
      if (remoteSchemaAheadRef.current) {
        setSyncStatus("error");
        setSyncMessage(
          "Sync paused: your account has newer data than this version of the reader supports.",
        );
        return;
      }
      let activeConsent = consent;
      if (!activeConsent.granted) {
        if (!options.grantConsent) return;
        activeConsent = grantSyncConsentLocally();
      }
      syncingRef.current = true;
      setSyncStatus("syncing");
      setSyncMessage("Syncing reading history.");
      const currentProgress = overrideProgress ?? readStoredProgress();
      const currentEvents = overrideEvents ?? readStoredEvents();
      const pendingEvents = unsyncedEvents(currentEvents);

      try {
        const progressResult = await upsertRemoteProgress(user.id, currentProgress);
        const consentResult = await upsertRemoteConsent(user.id, activeConsent);
        const primaryError = progressResult.error ?? consentResult.error ?? null;
        if (primaryError) throw primaryError;

        const eventResult = await uploadRemoteEvents(user.id, pendingEvents);
        if (eventResult.uploadedIds.length > 0) {
          writeStoredEvents(markEventsSynced(currentEvents, eventResult.uploadedIds));
        }
        const syncedAt = Date.now();
        setLastSyncedAt(syncedAt);
        writeLastSyncedAt(syncedAt);
        setSyncStatus("synced");
        setSyncMessage(
          eventResult.error
            ? "Progress synced. Reading history details will retry."
            : "Synced across your devices.",
        );
        if (eventResult.error) {
          console.warn("Reader engagement event sync failed.", eventResult.error);
        }
      } catch (error) {
        setSyncStatus("error");
        setSyncMessage(
          error instanceof Error
            ? `Sync failed: ${error.message}`
            : "Sync failed. Local progress is still saved.",
        );
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
  const lastSyncedLabel = formatLastSyncedAt(lastSyncedAt, relativeNow);

  useEffect(() => {
    const sectionId = section?.sectionId ?? null;
    const previous = previousReadStateRef.current;
    const becameRead =
      Boolean(sectionId) &&
      previous.sectionId === sectionId &&
      !previous.isRead &&
      isRead;
    previousReadStateRef.current = { sectionId, isRead };

    if (!becameRead) return;

    setShowReadAnimation(true);
    const timer = window.setTimeout(() => {
      setShowReadAnimation(false);
    }, 1_600);
    return () => window.clearTimeout(timer);
  }, [isRead, section?.sectionId]);

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
    updateStoredProgress((current) =>
      markRead(current, section, 100, Date.now(), "manual"),
    );
  }

  function grantSyncConsentLocally(): ReaderSyncConsent {
    const nextConsent = grantSyncConsent();
    setConsent(nextConsent);
    writeStoredConsent(nextConsent);
    return nextConsent;
  }

  async function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage("");
    const email = authEmail.trim();
    if (!email) return;
    setSyncLoginModalEmail(email);
  }

  async function continueSyncLogin() {
    const email = syncLoginModalEmail.trim();
    if (!email) return;
    setAuthMessage("");
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(
      pathname,
    )}`;
    const { error } = await sendMagicLink(email, redirectTo);
    if (!error) {
      grantSyncConsentLocally();
      setPendingOtpEmail(email);
      setAuthOtp("");
      setSyncLoginModalEmail("");
    }
    setAuthMessage(
      error
        ? "Sign in could not start. Try again."
        : "",
    );
  }

  function cancelSyncLogin() {
    setSyncLoginModalEmail("");
  }

  function resetPendingEmail() {
    setPendingOtpEmail("");
    setAuthEmail("");
    setAuthOtp("");
    setAuthMessage("");
  }

  async function submitOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthMessage("");
    const email = pendingOtpEmail || authEmail.trim();
    const token = authOtp.replace(/\s+/g, "");
    if (!email || !token) return;
    const { data, error } = await verifyEmailOtp(email, token);
    if (error) {
      setAuthMessage("Code sign in failed. Request a fresh email and try again.");
      return;
    }
    if (!consent.granted) {
      grantSyncConsentLocally();
    }
    setAuthOtp("");
    setPendingOtpEmail("");
    setUser(data.user ? { id: data.user.id, email: data.user.email ?? undefined } : null);
    setAuthMessage("Signed in. Sync will start shortly.");
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
        {...triggerProps}
        type="button"
        className={`progress-menu-button${user ? " is-signed-in" : ""}`}
        aria-label={`Progress ${percent}%${user ? ", signed in" : ""}`}
        aria-controls="reader-progress-menu"
        onClick={() => {
          toggle();
          setSyncLoginModalEmail("");
        }}
      >
        {showReadAnimation ? (
          <ProgressReadAnimation />
        ) : (
          <ProgressCloudBadge connected={Boolean(user)} percent={percent} />
        )}
      </button>
      {rendered && (
        <div
          {...popoverProps}
          id="reader-progress-menu"
          className="reader-status progress-popover"
          role="region"
          aria-label="Reader progress"
        >
          <div className="progress-section">
            <p className="eyebrow">Reading progress</p>
            <div className="progress-row">
              <div className="progress-bar" aria-hidden="true">
                <span style={{ width: `${percent}%` }} />
              </div>
              <strong>{percent}%</strong>
            </div>
            {!user && (
              <p className="quiet-copy">
                Reading history is kept in this browser until you choose to sync.
              </p>
            )}
          </div>
          <div className="reader-actions progress-section">
            <a className="reader-menu-link" href="/progress/">
              <ChevronsRight
                className="reader-menu-link-icon"
                aria-hidden="true"
                size={16}
              />
              <span>Open reading map</span>
            </a>
          </div>
          <div className="progress-section reader-sync">
            <p className="eyebrow">Sync</p>
            {!syncConfigured && (
              <p className="quiet-copy">Sync is not configured for this build.</p>
            )}
            {syncConfigured && !user && (
              <div className="reader-sync-login">
                <form className="reader-sync-form" onSubmit={submitEmail}>
                  <label htmlFor="reader-sync-email">Email</label>
                  <input
                    id="reader-sync-email"
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    placeholder="you@example.com"
                    autoComplete="email"
                  />
                  {pendingOtpEmail ? (
                    <button
                      type="button"
                      className="icon-button reader-sync-sent-button"
                      onClick={resetPendingEmail}
                      aria-live="polite"
                    >
                      <Check aria-hidden="true" size={17} />
                      <span>Check your email to finish.</span>
                    </button>
                  ) : (
                    <button
                      ref={syncLoginTriggerRef}
                      type="submit"
                      className="icon-button"
                    >
                      <UserRound aria-hidden="true" size={17} />
                      <span>Sign in to sync</span>
                    </button>
                  )}
                </form>
                {syncLoginModalEmail && typeof document !== "undefined"
                  ? createPortal(
                      <div
                        ref={syncLoginModalRef}
                        className="reader-sync-modal-backdrop"
                      >
                        <div
                          className="reader-sync-modal"
                          role="dialog"
                          aria-modal="true"
                          aria-labelledby="reader-sync-modal-title"
                          aria-describedby="reader-sync-modal-description"
                        >
                          <Cloud aria-hidden="true" size={20} />
                          <div className="reader-sync-modal-copy">
                            <h2 id="reader-sync-modal-title">
                              Sync reading progress?
                            </h2>
                            <p id="reader-sync-modal-description">
                              If you continue, reading progress will be synchronized
                              to your Cloud account so this site can remember where
                              you left off and share progress between your devices.
                            </p>
                          </div>
                          <div className="reader-sync-modal-actions">
                            <button
                              type="button"
                              className="secondary-link"
                              onClick={cancelSyncLogin}
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              className="icon-button"
                              onClick={continueSyncLogin}
                              ref={syncLoginContinueRef}
                            >
                              <Cloud aria-hidden="true" size={17} />
                              <span>Continue</span>
                            </button>
                          </div>
                        </div>
                      </div>,
                      document.body,
                    )
                  : null}
                {pendingOtpEmail && (
                  <form className="reader-sync-form" onSubmit={submitOtp}>
                    <label htmlFor="reader-sync-otp">One-time code</label>
                    <input
                      ref={syncOtpRef}
                      id="reader-sync-otp"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={authOtp}
                      onChange={(event) => setAuthOtp(event.target.value)}
                      placeholder="12345678"
                    />
                    <button type="submit" className="icon-button">
                      <KeyRound aria-hidden="true" size={17} />
                      <span>Verify code</span>
                    </button>
                  </form>
                )}
                {authMessage && (
                  <p className="quiet-copy" role="status" aria-live="polite">
                    {authMessage}
                  </p>
                )}
              </div>
            )}
            {syncConfigured && user && (
              <div className="reader-sync-actions">
                <dl className="reader-sync-meta">
                  <div>
                    <dt>Account:</dt>
                    <dd>{user.email ?? "Signed in"}</dd>
                  </div>
                  <div>
                    <dt>Last synced:</dt>
                    <dd>{lastSyncedLabel}</dd>
                  </div>
                </dl>
                <div className="reader-actions">
                  <button
                    type="button"
                    className="reader-menu-link"
                    disabled={syncStatus === "syncing"}
                    aria-busy={syncStatus === "syncing"}
                    onClick={() => syncNow(undefined, undefined, { grantConsent: true })}
                  >
                    {syncStatus === "syncing" ? (
                      <LoaderCircle
                        className="reader-sync-spinner"
                        aria-hidden="true"
                        size={16}
                      />
                    ) : (
                      <ChevronsRight
                        className="reader-menu-link-icon"
                        aria-hidden="true"
                        size={16}
                      />
                    )}
                    <span>Sync now</span>
                  </button>
                  <button type="button" className="reader-menu-link" onClick={signOut}>
                    <ChevronsRight
                      className="reader-menu-link-icon"
                      aria-hidden="true"
                      size={16}
                    />
                    <span>Sign out</span>
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
                  <a
                    key={item.sectionId}
                    className="reader-menu-link"
                    href={item.href}
                  >
                    <ChevronsRight
                      className="reader-menu-link-icon"
                      aria-hidden="true"
                      size={16}
                    />
                    <span>{item.title}</span>
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
                    className={
                      item.isUpdated
                        ? "reader-menu-link revised-link"
                        : "reader-menu-link"
                    }
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
                    <ChevronsRight
                      className="reader-menu-link-icon"
                      aria-hidden="true"
                      size={16}
                    />
                    <span>
                      {item.isUpdated ? "Updated: " : ""}
                      {item.title}
                    </span>
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
