"use client";

import type { User } from "@supabase/supabase-js";
import {
  readerSyncConsentCopyVersion,
  type ReaderEngagementEvent,
  type ReaderSyncConsent,
} from "./reader-engagement";
import {
  parseProgress,
  readerProgressSchemaVersion,
  type ReaderProgressState,
} from "./reader-state";
import { createBrowserSupabaseClient } from "./supabase/browser";

export type ReaderSyncClient = ReturnType<typeof createBrowserSupabaseClient>;

export type ReaderRemoteState = {
  progress: ReaderProgressState | null;
  // Schema version the remote progress row was written with, or null when there
  // is no remote row. Callers use this to refuse merging rows newer than this
  // client understands.
  progressSchemaVersion: number | null;
  consent: ReaderSyncConsent | null;
};

export function isReaderSyncConfigured(): boolean {
  return Boolean(createBrowserSupabaseClient());
}

export async function getCurrentUser(): Promise<User | null> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return user;
}

export function onAuthStateChange(
  callback: (user: User | null) => void,
): { unsubscribe: () => void } {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { unsubscribe() {} };

  const {
    data: { subscription },
  } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null);
  });

  return subscription;
}

export async function sendMagicLink(email: string, redirectTo: string) {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { error: new Error("Sync is not configured.") };

  return supabase.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
    },
  });
}

export async function verifyEmailOtp(email: string, token: string) {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) {
    return {
      data: { user: null, session: null },
      error: new Error("Sync is not configured."),
    };
  }

  return supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
}

export async function signOutReader() {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { error: new Error("Sync is not configured.") };

  return supabase.auth.signOut();
}

export async function loadRemoteReaderState(userId: string): Promise<ReaderRemoteState> {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { progress: null, progressSchemaVersion: null, consent: null };

  const [progressResponse, consentResponse] = await Promise.all([
    supabase
      .from("reader_progress")
      .select("progress, schema_version")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("reader_sync_consent")
      .select("consent_version, copy_version, granted, granted_at, revoked_at")
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  return {
    progress: progressResponse.data?.progress
      ? parseProgress(JSON.stringify(progressResponse.data.progress))
      : null,
    progressSchemaVersion:
      typeof progressResponse.data?.schema_version === "number"
        ? progressResponse.data.schema_version
        : null,
    consent: consentResponse.data
      ? {
          version: consentResponse.data.consent_version,
          copyVersion: consentResponse.data.copy_version,
          granted: consentResponse.data.granted === true,
          grantedAt: consentResponse.data.granted_at
            ? Date.parse(consentResponse.data.granted_at)
            : undefined,
          revokedAt: consentResponse.data.revoked_at
            ? Date.parse(consentResponse.data.revoked_at)
            : undefined,
        }
      : null,
  };
}

export async function upsertRemoteProgress(
  userId: string,
  progress: ReaderProgressState,
) {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { error: new Error("Sync is not configured.") };

  return supabase.from("reader_progress").upsert(
    {
      user_id: userId,
      progress,
      schema_version: readerProgressSchemaVersion,
    },
    { onConflict: "user_id" },
  );
}

export async function upsertRemoteConsent(
  userId: string,
  consent: ReaderSyncConsent,
) {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { error: new Error("Sync is not configured.") };

  return supabase.from("reader_sync_consent").upsert(
    {
      user_id: userId,
      consent_version: consent.version,
      copy_version: consent.copyVersion || readerSyncConsentCopyVersion,
      granted: consent.granted,
      granted_at: consent.grantedAt
        ? new Date(consent.grantedAt).toISOString()
        : null,
      revoked_at: consent.revokedAt
        ? new Date(consent.revokedAt).toISOString()
        : null,
    },
    { onConflict: "user_id" },
  );
}

export async function uploadRemoteEvents(
  userId: string,
  events: ReaderEngagementEvent[],
) {
  const supabase = createBrowserSupabaseClient();
  if (!supabase || events.length === 0) {
    return { error: null, uploadedIds: [] as string[] };
  }

  const rows = events.map((event) => ({
    user_id: userId,
    client_event_id: event.clientEventId,
    event_type: event.eventType,
    event_at: new Date(event.eventAt).toISOString(),
    section_id: event.sectionId ?? null,
    content_hash: event.contentHash ?? null,
    route: event.route ?? null,
    payload: event.payload ?? {},
  }));

  const { error } = await supabase
    .from("reader_engagement_events")
    .upsert(rows, {
      onConflict: "user_id,client_event_id",
      ignoreDuplicates: true,
    });

  return {
    error,
    uploadedIds: error ? [] : events.map((event) => event.clientEventId),
  };
}

export async function deleteRemoteReaderData(userId: string) {
  const supabase = createBrowserSupabaseClient();
  if (!supabase) return { error: new Error("Sync is not configured.") };

  const [events, progress, consent] = await Promise.all([
    supabase.from("reader_engagement_events").delete().eq("user_id", userId),
    supabase.from("reader_progress").delete().eq("user_id", userId),
    supabase.from("reader_sync_consent").delete().eq("user_id", userId),
  ]);

  return { error: events.error ?? progress.error ?? consent.error };
}

export async function deleteReaderAccount() {
  const response = await fetch("/api/account", { method: "DELETE" });
  if (!response.ok) {
    return { error: new Error("Account deletion failed.") };
  }
  return { error: null };
}
