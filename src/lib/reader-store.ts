"use client";

import { useSyncExternalStore } from "react";

// One reactive localStorage-backed store, shared by every island that reads it.
//
// This is the machinery reader-progress-store.ts grew to fix BUG-02, where each
// island kept a private React copy and wrote its own stale snapshot back, so
// concurrent writers (a scroll tick vs an audio-seconds update) dropped each
// other's changes. Bookmarks need exactly the same guarantees, so rather than
// copy the subscription code a second time it lives here once, per the
// src/AGENTS.md rule to extract a shared primitive when two surfaces need the
// same behavior.
//
// The invariants a caller depends on:
//   - reads and writes flow through one in-memory snapshot per key
//   - update() is an atomic read-modify-write, so an updater always sees the
//     latest state
//   - an updater returning the same reference costs zero renders and zero
//     localStorage writes
//   - a same-tab write notifies listeners directly; the custom event it also
//     dispatches is ignored by this store (writingInternally) and observed by
//     any other listener
//   - a cross-tab write arrives as a native storage event

export type ReaderStore<T> = {
  read: () => T;
  write: (value: T) => void;
  update: (updater: (current: T) => T) => T;
  useValue: () => T;
};

export function createReaderStore<T>({
  storageKey,
  legacyStorageKey,
  updatedEvent,
  parse,
  serialize,
  empty,
}: {
  storageKey: string;
  // Read-only fallback for a superseded key. Never written back, matching the
  // progress v1 to v2 migration: an old blob is understood, not rewritten.
  legacyStorageKey?: string;
  updatedEvent: string;
  parse: (raw: string | null) => T;
  serialize: (value: T) => string;
  empty: () => T;
}): ReaderStore<T> {
  // Stable identity is required: useSyncExternalStore treats a new object from
  // getServerSnapshot as a change and loops.
  const serverSnapshot = empty();
  let cached: T | null = null;
  let writingInternally = false;
  const listeners = new Set<() => void>();

  function read(): T {
    if (typeof window === "undefined") return empty();
    const current = window.localStorage.getItem(storageKey);
    if (current) return parse(current);
    return parse(
      legacyStorageKey ? window.localStorage.getItem(legacyStorageKey) : null,
    );
  }

  function write(value: T): void {
    // The in-memory snapshot must move with the persisted one. Leaving `cached`
    // stale here means the next update() reads the pre-write value and writes
    // its own stale copy back, which is exactly the BUG-02 clobber this module
    // exists to prevent, arriving through the write() door instead. The DOM
    // event only rescues it when a component happens to be subscribed, and the
    // windows with no subscriber are real: before hydration, and on routes
    // where no island for this key is mounted.
    cached = value;
    window.localStorage.setItem(storageKey, serialize(value));
    window.dispatchEvent(new Event(updatedEvent));
  }

  function snapshot(): T {
    if (cached === null) cached = read();
    return cached;
  }

  function handleStorageChange(event?: Event): void {
    // A same-tab write already updated the cache and notified listeners; ignore
    // the event it dispatched.
    if (writingInternally) return;
    if (
      event instanceof StorageEvent &&
      event.key &&
      event.key !== storageKey &&
      event.key !== legacyStorageKey
    ) {
      return;
    }
    cached = read();
    listeners.forEach((listener) => listener());
  }

  function subscribe(listener: () => void): () => void {
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.addEventListener("storage", handleStorageChange);
      window.addEventListener(updatedEvent, handleStorageChange);
    }
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0 && typeof window !== "undefined") {
        window.removeEventListener("storage", handleStorageChange);
        window.removeEventListener(updatedEvent, handleStorageChange);
      }
    };
  }

  function getServerSnapshot(): T {
    return serverSnapshot;
  }

  function update(updater: (current: T) => T): T {
    const current = snapshot();
    const next = updater(current);
    if (next === current) return current;
    cached = next;
    writingInternally = true;
    try {
      write(next);
    } finally {
      writingInternally = false;
    }
    listeners.forEach((listener) => listener());
    return next;
  }

  function useValue(): T {
    return useSyncExternalStore(subscribe, snapshot, getServerSnapshot);
  }

  return { read, write, update, useValue };
}
