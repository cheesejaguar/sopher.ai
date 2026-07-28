"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { saveChapter } from "@/lib/actions/chapters";

export type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error";

export type Autosave = {
  state: SaveState;
  /** Call on every editor change; debounces a save 1.5s out. */
  markDirty(): void;
  /** Save now (no-op when clean). Resolves true when the server matches the editor. */
  flush(): Promise<boolean>;
  /** Conflict resolution: overwrite the server's version with this editor's content. */
  keepMine(): Promise<boolean>;
  /** The server applied a change for us (e.g. accepted suggestion) — adopt its version. */
  markSynced(version: number): void;
  getVersion(): number;
};

const DEBOUNCE_MS = 1500;

export function useAutosave(options: {
  chapterId: string;
  initialVersion: number;
  /** Serialize the current editor to markdown; null when the editor is not ready. */
  getContent: () => string | null;
  onSaved?: (info: { version: number; wordCount: number }) => void;
  onConflict?: (currentVersion: number) => void;
}): Autosave {
  const { chapterId } = options;
  const [state, setState] = useState<SaveState>("saved");
  const versionRef = useRef(options.initialVersion);
  const dirtyRef = useRef(false);
  const conflictRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inflightRef = useRef<Promise<boolean> | null>(null);
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const save = useCallback(
    function save(force = false): Promise<boolean> {
      // A stale in-flight save may not contain the latest keystrokes; once it
      // settles (its .finally has nulled inflightRef), chain a fresh save if
      // the editor is still dirty so callers see the *latest* content's fate.
      if (inflightRef.current) {
        return inflightRef.current.then((ok) => (ok && dirtyRef.current ? save(force) : ok));
      }
      if (!dirtyRef.current && !force) return Promise.resolve(true);
      // After a conflict, only an explicit resolution ("keep mine") may write.
      if (conflictRef.current && !force) return Promise.resolve(false);

      const run = (async () => {
        const content = optionsRef.current.getContent();
        if (content == null) return true;
        dirtyRef.current = false;
        setState("saving");
        const result = await saveChapter(
          chapterId,
          content,
          versionRef.current,
          force ? { force: true } : undefined,
        );
        if (result.ok) {
          versionRef.current = result.version;
          conflictRef.current = false;
          setState(dirtyRef.current ? "dirty" : "saved");
          optionsRef.current.onSaved?.(result);
          return true;
        }
        dirtyRef.current = true;
        if (result.error === "conflict") {
          conflictRef.current = true;
          setState("conflict");
          optionsRef.current.onConflict?.(result.currentVersion);
        } else {
          setState("error");
        }
        return false;
      })()
        .catch(() => {
          dirtyRef.current = true;
          setState("error");
          return false;
        })
        .finally(() => {
          inflightRef.current = null;
        });

      inflightRef.current = run;
      return run;
    },
    [chapterId],
  );

  const flush = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    return save();
  }, [save]);

  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setState((s) => (s === "saving" || s === "conflict" ? s : "dirty"));
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void save();
    }, DEBOUNCE_MS);
  }, [save]);

  const keepMine = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    dirtyRef.current = true;
    return save(true);
  }, [save]);

  const markSynced = useCallback((version: number) => {
    versionRef.current = version;
    dirtyRef.current = false;
    conflictRef.current = false;
    setState("saved");
  }, []);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && dirtyRef.current) void flush();
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtyRef.current || inflightRef.current) {
        event.preventDefault();
        void flush();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [flush]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      // Unmount (e.g. client-side navigation) with a pending debounce: fire
      // and forget a final save so those keystrokes aren't silently lost.
      if (dirtyRef.current && !conflictRef.current && !inflightRef.current) {
        const content = optionsRef.current.getContent();
        if (content != null) void saveChapter(chapterId, content, versionRef.current);
      }
    },
    [chapterId],
  );

  return {
    state,
    markDirty,
    flush,
    keepMine,
    markSynced,
    getVersion: () => versionRef.current,
  };
}
