"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useReducer,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import CharacterCount from "@tiptap/extension-character-count";
import { Markdown } from "tiptap-markdown";
import { BookOpen } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type {
  ChapterNavItem,
  ContentToolResponse,
  ReviewResponse,
  SelectionEditResponse,
  SuggestionActionResponse,
  SuggestionDTO,
} from "@/lib/editor/types";
import { markdownSelection } from "@/lib/editor/markdown-offsets";

import { ChapterSidebar } from "./chapter-sidebar";
import { ImageNode } from "./image-node";
import { mermaidCodeBlockView } from "./mermaid-code-block-view";
import { ReviewPanel } from "./review-panel";
import { SelectionToolbar, type ContentToolId } from "./selection-toolbar";
import { StatusBar } from "./status-bar";
import { SuggestionCard } from "./suggestion-card";
import {
  getSuggestionItems,
  setPluginFocus,
  setPluginSuggestions,
  SuggestionHighlights,
  type SuggestionItem,
} from "./suggestion-plugin";
import { useAutosave } from "./use-autosave";
import { useMediaQuery } from "./use-media-query";

export type EditorShellProps = {
  projectId: string;
  chapterId: string;
  chapterNumber: number;
  chapterTitle: string | null;
  bookTitle: string;
  content: string;
  version: number;
  targetWords: number;
  chapters: ChapterNavItem[];
  initialSuggestions: SuggestionDTO[];
};

type MarkdownEditorStorage = {
  getMarkdown(): string;
  serializer: { serialize(doc: PMNode): string };
};

/** tiptap-markdown registers its storage under "markdown"; its types predate tiptap v3 storage maps. */
function markdownStorage(editor: Editor): MarkdownEditorStorage {
  return (editor.storage as unknown as { markdown: MarkdownEditorStorage }).markdown;
}

type Busy = null | "edit" | "review" | "tool" | "apply";

const CARD_WIDTH = 384;
const EMPTY_ITEMS: SuggestionItem[] = [];

/** Measure where the inline card should sit, relative to the paper surface. */
function computeCardPosition(
  editor: Editor | null,
  item: SuggestionItem | undefined,
  paper: HTMLDivElement | null,
): { top: number; left: number } | null {
  if (!editor || editor.isDestroyed || !item?.range || !paper) return null;
  try {
    const pos = Math.min(item.range.to, editor.state.doc.content.size);
    const coords = editor.view.coordsAtPos(pos);
    const rect = paper.getBoundingClientRect();
    const left = Math.max(16, Math.min(coords.left - rect.left, rect.width - CARD_WIDTH - 16));
    return { top: coords.bottom - rect.top + 8, left };
  } catch {
    return null;
  }
}

/** Elements that must stay reachable even while zen mode covers the app. */
const KEEP_REACHABLE = '[aria-live],[role="dialog"],[role="alertdialog"]';

/**
 * Zen mode paints a full-screen overlay over the studio chrome, but that chrome
 * stays in the tab order underneath it — keyboard focus would land on controls
 * the user cannot see (WCAG 2.4.11). Mark the covered siblings inert while zen
 * is on. Body-level portals (dialogs, menus) sit outside this walk, and live
 * regions such as the toaster are skipped explicitly.
 */
function hideBehindOverlay(overlay: HTMLElement): () => void {
  const hidden: HTMLElement[] = [];
  let node: HTMLElement | null = overlay;
  while (node?.parentElement && node.parentElement !== document.body) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue;
      if (sibling.matches(KEEP_REACHABLE) || sibling.querySelector(KEEP_REACHABLE)) continue;
      sibling.inert = true;
      hidden.push(sibling);
    }
    node = node.parentElement;
  }
  return () => {
    for (const el of hidden) el.inert = false;
  };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

async function postJson<T>(url: string, body: unknown): Promise<{ status: number; data: T }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

function MobileInterstitial({ projectId }: { projectId: string }) {
  return (
    <div className="paper-surface flex min-h-72 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <BookOpen aria-hidden="true" className="size-6 text-paper-muted" />
      <h2 className="font-display text-lg font-semibold">The editor is best at a desk</h2>
      <p className="max-w-sm text-sm leading-relaxed text-paper-muted">
        Accepting suggestions and line-editing want a wide screen and a keyboard. On this device you
        can read the manuscript instead.
      </p>
      <Button render={<Link href={`/projects/${projectId}/manuscript`} />}>
        Read the manuscript
      </Button>
    </div>
  );
}

export function EditorShell({
  projectId,
  chapterId,
  chapterNumber,
  chapterTitle,
  bookTitle,
  content,
  version,
  targetWords,
  chapters,
  initialSuggestions,
}: EditorShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const zen = searchParams.get("zen") === "1";
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isXl = useMediaQuery("(min-width: 1280px)");

  const [suggestions, setSuggestions] = useState<SuggestionDTO[]>(() =>
    initialSuggestions.filter((s) => s.status === "pending"),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [conflict, setConflict] = useState<{ currentVersion: number } | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [, forceLayout] = useReducer((n: number) => n + 1, 0);

  const [paperEl, setPaperEl] = useState<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const suppressDirtyRef = useRef(false);
  const zenRef = useRef<HTMLDivElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  /** Set to a suggestion id when an async result should take focus once it renders. */
  const focusCardRef = useRef<string | null>(null);
  const shortcutsId = useId();

  // Polite announcements for async work and its results. Editor content and
  // streaming text deliberately stay out of here — only outcomes are announced.
  const [announcement, setAnnouncement] = useState("");

  /** Put focus back on the manuscript when a control unmounted out from under it. */
  const returnFocusToEditor = useCallback(() => {
    requestAnimationFrame(() => {
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed) return;
      const active = document.activeElement;
      if (active && active !== document.body && document.body.contains(active)) return;
      ed.view.dom.focus();
    });
  }, []);

  const getMarkdown = useCallback((): string | null => {
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return null;
    return markdownStorage(ed).getMarkdown();
  }, []);

  const autosave = useAutosave({
    chapterId,
    initialVersion: version,
    getContent: getMarkdown,
    onConflict: (currentVersion) => setConflict({ currentVersion }),
  });
  const autosaveRef = useRef(autosave);
  useEffect(() => {
    autosaveRef.current = autosave;
  });

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      CharacterCount,
      Markdown.configure({ html: false, tightLists: true }),
      ImageNode,
      SuggestionHighlights.configure({ onActivate: (id) => setActiveId(id) }),
    ],
    content,
    editorProps: {
      attributes: {
        class: "prose-manuscript mx-auto min-h-[50vh] outline-none",
        "aria-label": `Chapter ${chapterNumber} manuscript`,
        "aria-describedby": shortcutsId,
      },
      nodeViews: { codeBlock: mermaidCodeBlockView },
    },
    onUpdate: () => {
      if (!suppressDirtyRef.current) autosaveRef.current.markDirty();
    },
  });
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  const serializeDoc = useCallback((doc: PMNode): string => {
    const ed = editorRef.current;
    if (!ed) throw new Error("Editor not ready");
    return markdownStorage(ed).serializer.serialize(doc);
  }, []);

  // Push the pending list into the ProseMirror plugin whenever it changes.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    setPluginSuggestions(editor, suggestions);
  }, [editor, suggestions]);

  useEffect(() => {
    if (!editor || editor.isDestroyed) return;
    setPluginFocus(editor, activeId, hoverId);
  }, [editor, activeId, hoverId]);

  // Live view of the plugin's anchored items (re-renders on each transaction
  // only while suggestions exist — the plugin returns a stable state otherwise).
  const items = useSyncExternalStore(
    useCallback(
      (onStoreChange: () => void) => {
        if (!editor) return () => {};
        editor.on("transaction", onStoreChange);
        return () => {
          editor.off("transaction", onStoreChange);
        };
      },
      [editor],
    ),
    () => (editor && !editor.isDestroyed ? getSuggestionItems(editor) : EMPTY_ITEMS),
    () => EMPTY_ITEMS,
  );

  // Suggestions whose quoted text no longer appears — panel-only ("unanchored").
  const unanchored = useMemo(
    () => new Set(items.filter((i) => !i.range).map((i) => i.suggestion.id)),
    [items],
  );

  // Reposition the inline card on window resizes (transactions re-render anyway).
  useEffect(() => {
    window.addEventListener("resize", forceLayout);
    return () => window.removeEventListener("resize", forceLayout);
  }, []);

  /** Adopt server-applied content (accepted suggestion) without re-saving it. */
  const applyServerChapter = useCallback(
    (
      chapter: { content: string; version: number; wordCount: number },
      pending: SuggestionDTO[],
    ) => {
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed) return;
      suppressDirtyRef.current = true;
      try {
        ed.commands.setContent(chapter.content);
      } finally {
        suppressDirtyRef.current = false;
      }
      autosaveRef.current.markSynced(chapter.version);
      setSuggestions(pending);
      setActiveId(null);
    },
    [],
  );

  const requestSelectionEdit = useCallback(
    async (instruction: string) => {
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed || busy) return;
      const { from, to, empty } = ed.state.selection;
      if (empty) return;
      setBusy("edit");
      setAnnouncement("Asking the editor to revise the selection…");
      try {
        if (!(await autosaveRef.current.flush())) {
          toast.error("Couldn't save the chapter before editing — resolve the conflict first.");
          return;
        }
        const selection = markdownSelection(ed.state, serializeDoc, from, to);
        if (!selection) {
          toast.error("Couldn't map that selection — try selecting a slightly larger passage.");
          return;
        }
        const { status, data } = await postJson<SelectionEditResponse & { error?: unknown }>(
          `/api/chapters/${chapterId}/edits`,
          { selection, instruction },
        );
        if (status === 201 && data.suggestion) {
          setSuggestions((prev) => [...prev, data.suggestion]);
          setActiveId(data.suggestion.id);
          // The toolbar the user was standing on unmounts while busy; hand
          // focus to the result instead of dropping it on the body.
          focusCardRef.current = data.suggestion.id;
          setAnnouncement("A suggestion is ready below the passage.");
        } else if (status === 402) {
          toast.error(String(data.error ?? "Monthly budget reached."));
        } else if (status === 409) {
          toast.error("The saved chapter moved under you — try again.");
        } else {
          toast.error("The editor couldn't produce a suggestion. Try again.");
        }
      } finally {
        setBusy(null);
      }
    },
    [busy, chapterId, serializeDoc],
  );

  const runContentTool = useCallback(
    async (toolId: ContentToolId) => {
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed || busy) return;
      const { from, to, empty } = ed.state.selection;
      if (empty) return;
      setBusy("tool");
      setAnnouncement(
        toolId === "mermaid"
          ? "Generating a diagram from the selection…"
          : "Generating an illustration from the selection…",
      );
      try {
        if (!(await autosaveRef.current.flush())) {
          toast.error("Couldn't save the chapter first — resolve the conflict.");
          return;
        }
        const selection = markdownSelection(ed.state, serializeDoc, from, to);
        if (!selection) {
          toast.error("Couldn't read that selection — try reselecting.");
          return;
        }
        const { status, data } = await postJson<ContentToolResponse & { error?: unknown }>(
          `/api/content-tools/${toolId}`,
          { chapterId, text: selection.text },
        );
        if (status !== 200 || !data.output) {
          toast.error(
            status === 402
              ? String(data.error ?? "Monthly budget reached.")
              : String(data.error ?? "The tool didn't produce a result."),
          );
          return;
        }
        const insertPos = ed.state.selection.$to.after(1);
        if (data.output.kind === "mermaid") {
          ed.chain()
            .focus()
            .insertContentAt(insertPos, {
              type: "codeBlock",
              attrs: { language: "mermaid" },
              content: [{ type: "text", text: data.output.source }],
            })
            .run();
          toast.success("Diagram added below the passage.");
        } else {
          const { url, alt } = data.output;
          ed.chain()
            .focus()
            .insertContentAt(insertPos, [
              { type: "paragraph", content: [{ type: "image", attrs: { src: url, alt } }] },
              {
                type: "paragraph",
                content: alt
                  ? [{ type: "text", marks: [{ type: "italic" }], text: alt }]
                  : undefined,
              },
            ])
            .run();
          toast.success("Illustration added below the passage.");
        }
      } finally {
        setBusy(null);
      }
    },
    [busy, chapterId, serializeDoc],
  );

  const rejectSuggestion = useCallback(
    async (id: string) => {
      const fromCard = !!cardRef.current?.contains(document.activeElement);
      setBusy("apply");
      try {
        const { status } = await postJson<SuggestionActionResponse>(
          `/api/chapters/${chapterId}/edits/${id}`,
          { action: "reject" },
        );
        if (status === 200 || status === 409) {
          setSuggestions((prev) => prev.filter((s) => s.id !== id));
          setActiveId((cur) => (cur === id ? null : cur));
          setAnnouncement("Suggestion dismissed.");
        } else {
          toast.error("Couldn't reject the suggestion — try again.");
        }
      } finally {
        setBusy(null);
        if (fromCard) returnFocusToEditor();
      }
    },
    [chapterId, returnFocusToEditor],
  );

  const acceptSuggestion = useCallback(
    async (id: string, editedText?: string) => {
      const ed = editorRef.current;
      if (!ed || ed.isDestroyed) return;
      const fromCard = !!cardRef.current?.contains(document.activeElement);
      setBusy("apply");
      // Freeze typing for the round-trip: a keystroke landing between the
      // flush-serialize and applyServerChapter's setContent would be discarded.
      ed.setEditable(false);
      try {
        if (!(await autosaveRef.current.flush())) {
          toast.error("Couldn't save the chapter first — resolve the conflict.");
          return;
        }
        if (editedText !== undefined) {
          // Edit-then-accept: the author's own wording goes in locally; the
          // stored suggestion is marked rejected since its text wasn't used.
          const item = getSuggestionItems(ed).find((i) => i.suggestion.id === id);
          if (!item?.range) {
            toast.error("This suggestion no longer matches the text.");
            return;
          }
          ed.chain()
            .focus()
            .insertContentAt({ from: item.range.from, to: item.range.to }, editedText)
            .run();
          void postJson(`/api/chapters/${chapterId}/edits/${id}`, { action: "reject" });
          setSuggestions((prev) => prev.filter((s) => s.id !== id));
          setActiveId((cur) => (cur === id ? null : cur));
          setAnnouncement("Your edit was applied to the passage.");
          return;
        }
        const { status, data } = await postJson<SuggestionActionResponse & { error?: unknown }>(
          `/api/chapters/${chapterId}/edits/${id}`,
          { action: "accept" },
        );
        if (status === 200 && data.chapter) {
          applyServerChapter(data.chapter, data.pending ?? []);
          setAnnouncement("Suggestion applied to the chapter.");
        } else if (status === 409) {
          toast.error("The passage changed — this suggestion no longer applies.");
          setSuggestions((prev) => prev.filter((s) => s.id !== id));
          setActiveId((cur) => (cur === id ? null : cur));
        } else {
          toast.error("Couldn't apply the suggestion — try again.");
        }
      } finally {
        if (!ed.isDestroyed) ed.setEditable(true);
        setBusy(null);
        if (fromCard) returnFocusToEditor();
      }
    },
    [applyServerChapter, chapterId, returnFocusToEditor],
  );

  const acceptAll = useCallback(async () => {
    const ids = suggestions.map((s) => s.id);
    if (ids.length === 0) return;
    const ed = editorRef.current;
    setBusy("apply");
    // Freeze typing for the round-trips (see acceptSuggestion).
    ed?.setEditable(false);
    try {
      if (!(await autosaveRef.current.flush())) {
        toast.error("Couldn't save the chapter first — resolve the conflict.");
        return;
      }
      let lastChapter: { content: string; version: number; wordCount: number } | null = null;
      let pending: SuggestionDTO[] = [];
      let applied = 0;
      let skipped = 0;
      for (const id of ids) {
        const { status, data } = await postJson<SuggestionActionResponse>(
          `/api/chapters/${chapterId}/edits/${id}`,
          { action: "accept" },
        );
        if (status === 200 && data.chapter) {
          lastChapter = data.chapter;
          pending = data.pending ?? [];
          applied += 1;
        } else {
          skipped += 1;
        }
      }
      if (lastChapter) applyServerChapter(lastChapter, pending);
      if (skipped > 0) {
        toast.warning(`Applied ${applied} suggestions — ${skipped} no longer matched.`);
      } else {
        toast.success(`Applied ${applied} suggestion${applied === 1 ? "" : "s"}.`);
      }
    } finally {
      if (ed && !ed.isDestroyed) ed.setEditable(true);
      setBusy(null);
    }
  }, [applyServerChapter, chapterId, suggestions]);

  const rejectAll = useCallback(async () => {
    const ids = suggestions.map((s) => s.id);
    if (ids.length === 0) return;
    setBusy("apply");
    try {
      await Promise.allSettled(
        ids.map((id) => postJson(`/api/chapters/${chapterId}/edits/${id}`, { action: "reject" })),
      );
      setSuggestions([]);
      setActiveId(null);
      setAnnouncement(`Dismissed ${ids.length} suggestion${ids.length === 1 ? "" : "s"}.`);
    } finally {
      setBusy(null);
    }
  }, [chapterId, suggestions]);

  const runReview = useCallback(
    async (instruction?: string) => {
      setBusy("review");
      setAnnouncement(`The editor is reading chapter ${chapterNumber}…`);
      try {
        if (!(await autosaveRef.current.flush())) {
          toast.error("Couldn't save the chapter first — resolve the conflict.");
          return;
        }
        const { status, data } = await postJson<ReviewResponse & { error?: unknown }>(
          `/api/chapters/${chapterId}/review`,
          { instruction },
        );
        if (status !== 200 || !data.suggestions) {
          toast.error(
            status === 402
              ? String(data.error ?? "Monthly budget reached.")
              : "The review didn't complete — try again.",
          );
          return;
        }
        setSuggestions((prev) => {
          const seen = new Set(prev.map((s) => s.id));
          return [...prev, ...data.suggestions.filter((s) => !seen.has(s.id))];
        });
        setAnnouncement(
          data.suggestions.length === 0
            ? "Review complete. Nothing flagged."
            : `Review complete. ${data.suggestions.length} suggestion${
                data.suggestions.length === 1 ? "" : "s"
              } in the suggestions panel.`,
        );
        if (data.skipped > 0) {
          toast.info(
            `${data.skipped} suggestion${data.skipped === 1 ? "" : "s"} couldn't be anchored and were skipped.`,
          );
        }
        if (data.suggestions.length === 0) {
          toast.success("The editor read the chapter and had nothing to flag.");
        }
      } finally {
        setBusy(null);
      }
    },
    [chapterId, chapterNumber],
  );

  const selectSuggestion = useCallback((id: string) => {
    setActiveId(id);
    setReviewOpen(false);
    const ed = editorRef.current;
    if (!ed || ed.isDestroyed) return;
    const item = getSuggestionItems(ed).find((i) => i.suggestion.id === id);
    if (item?.range) {
      try {
        const dom = ed.view.domAtPos(item.range.from);
        const el = dom.node instanceof HTMLElement ? dom.node : dom.node.parentElement;
        el?.scrollIntoView({
          block: "center",
          // scrollIntoView's explicit behaviour overrides the global
          // reduced-motion CSS, so opt out here too.
          behavior: prefersReducedMotion() ? "auto" : "smooth",
        });
      } catch {
        // Position no longer resolvable; the panel still shows the card.
      }
    }
  }, []);

  /** Close the inline card and keep focus on the manuscript rather than losing it. */
  const dismissCard = useCallback(() => {
    const fromCard = !!cardRef.current?.contains(document.activeElement);
    setActiveId(null);
    if (fromCard) returnFocusToEditor();
  }, [returnFocusToEditor]);

  const toggleZen = useCallback(() => {
    router.replace((zen ? pathname : `${pathname}?zen=1`) as Route, { scroll: false });
  }, [pathname, router, zen]);

  // Keyboard: ⌘S save, ⌘⏎ accept active, ⌘⌫ reject active, Esc exits zen/card.
  const keysRef = useRef({
    zen,
    activeId,
    toggleZen,
    acceptSuggestion,
    rejectSuggestion,
    dismissCard,
  });
  useEffect(() => {
    keysRef.current = {
      zen,
      activeId,
      toggleZen,
      acceptSuggestion,
      rejectSuggestion,
      dismissCard,
    };
  });
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // A popover, menu or dialog that already handled the key (typically
      // Escape) owns it — don't also close the card or drop out of zen.
      if (event.defaultPrevented) return;
      const k = keysRef.current;
      const mod = event.metaKey || event.ctrlKey;
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void autosaveRef.current.flush();
        return;
      }
      if (mod && event.key === "Enter" && k.activeId) {
        event.preventDefault();
        void k.acceptSuggestion(k.activeId);
        return;
      }
      if (mod && event.key === "Backspace" && k.activeId) {
        event.preventDefault();
        void k.rejectSuggestion(k.activeId);
        return;
      }
      if (event.key === "Escape") {
        if (k.zen) {
          event.preventDefault();
          k.toggleZen();
        } else if (k.activeId) {
          event.preventDefault();
          k.dismissCard();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Entering or leaving zen re-parents the editor's DOM, which drops focus on
  // the floor. Put it back on the manuscript when nothing else claimed it.
  const zenMountedRef = useRef(false);
  useEffect(() => {
    if (!zenMountedRef.current) {
      zenMountedRef.current = true;
      return;
    }
    returnFocusToEditor();
  }, [zen, returnFocusToEditor]);

  useEffect(() => {
    if (!zen || !zenRef.current) return;
    return hideBehindOverlay(zenRef.current);
  }, [zen]);

  // Move focus onto a suggestion card that arrived from an async request.
  useEffect(() => {
    const wanted = focusCardRef.current;
    if (!wanted) return;
    if (wanted !== activeId) {
      focusCardRef.current = null;
      return;
    }
    const el = cardRef.current;
    if (!el) return;
    focusCardRef.current = null;
    el.focus();
  });

  if (!isDesktop) {
    return <MobileInterstitial projectId={projectId} />;
  }

  const activeSuggestion = activeId ? suggestions.find((s) => s.id === activeId) : undefined;
  const activeItem = activeId ? items.find((i) => i.suggestion.id === activeId) : undefined;
  const cardPos = computeCardPosition(editor, activeItem, paperEl);

  const canvas = (
    <div className="relative h-full overflow-y-auto">
      <div className={cn("mx-auto max-w-[78ch] px-4 py-8", zen && "py-16")}>
        <div ref={setPaperEl} className="paper-surface relative px-8 py-12 sm:px-14 sm:py-16">
          <header className="mb-8">
            <p className="font-mono text-[10px] tracking-widest text-paper-muted uppercase">
              Chapter {chapterNumber}
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-balance">
              {chapterTitle ?? `Chapter ${chapterNumber}`}
            </h2>
          </header>

          {/* Keyboard help, announced when focus enters the manuscript. */}
          <p id={shortcutsId} className="sr-only">
            Rich text editor. Select a passage and press Tab to reach the AI editing tools. Press
            Control or Command S to save. When a suggestion is selected, press Control or Command
            Enter to accept it and Control or Command Backspace to reject it. Press Escape to close
            a suggestion or leave zen mode. Every suggestion is also listed in the suggestions
            panel.
          </p>

          <EditorContent editor={editor} />

          {editor ? (
            <SelectionToolbar
              editor={editor}
              busy={busy === "edit" || busy === "tool"}
              onEdit={requestSelectionEdit}
              onTool={runContentTool}
            />
          ) : null}

          {activeSuggestion && cardPos ? (
            <div
              ref={cardRef}
              role="group"
              aria-label="Editor suggestion"
              tabIndex={-1}
              className="absolute z-20 w-96 max-w-[calc(100%-2rem)]"
              style={{ top: cardPos.top, left: cardPos.left }}
            >
              <SuggestionCard
                key={activeSuggestion.id}
                suggestion={activeSuggestion}
                busy={busy === "apply"}
                onAccept={() => void acceptSuggestion(activeSuggestion.id)}
                onAcceptEdited={(text) => void acceptSuggestion(activeSuggestion.id, text)}
                onReject={() => void rejectSuggestion(activeSuggestion.id)}
                onDismiss={dismissCard}
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );

  const reviewPanel = (
    <ReviewPanel
      chapterNumber={chapterNumber}
      suggestions={suggestions}
      unanchored={unanchored}
      activeId={activeId}
      reviewing={busy === "review"}
      busy={busy === "apply"}
      onReview={(instruction) => void runReview(instruction)}
      onSelect={selectSuggestion}
      onHover={setHoverId}
      onAccept={(id) => void acceptSuggestion(id)}
      onReject={(id) => void rejectSuggestion(id)}
      onAcceptAll={() => void acceptAll()}
      onRejectAll={() => void rejectAll()}
    />
  );

  const statusBar = (
    <StatusBar
      editor={editor}
      saveState={autosave.state}
      targetWords={targetWords}
      pendingCount={suggestions.length}
      zen={zen}
      onToggleZen={toggleZen}
      onOpenReview={!zen && !isXl ? () => setReviewOpen(true) : undefined}
    />
  );

  return (
    <>
      {zen ? (
        <div ref={zenRef} className="fixed inset-0 z-50 flex flex-col bg-background">
          <div className="min-h-0 flex-1 overflow-hidden">{canvas}</div>
          {statusBar}
        </div>
      ) : (
        <div className="flex h-[calc(100dvh-13rem)] min-h-[520px] flex-col overflow-hidden rounded-xl border border-border bg-card">
          <div className="min-h-0 flex-1">
            <ResizablePanelGroup orientation="horizontal">
              <ResizablePanel defaultSize={230} minSize={180} maxSize={340}>
                <ChapterSidebar
                  projectId={projectId}
                  bookTitle={bookTitle}
                  chapters={chapters}
                  activeChapterNumber={chapterNumber}
                />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel minSize={360}>{canvas}</ResizablePanel>
              {isXl ? (
                <>
                  <ResizableHandle />
                  <ResizablePanel defaultSize={330} minSize={260} maxSize={460}>
                    {reviewPanel}
                  </ResizablePanel>
                </>
              ) : null}
            </ResizablePanelGroup>
          </div>
          {statusBar}
        </div>
      )}

      {!isXl && !zen ? (
        <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
          <SheetContent side="right" className="w-[380px] p-0 sm:max-w-[380px]">
            <SheetHeader className="sr-only">
              <SheetTitle>Suggestions</SheetTitle>
            </SheetHeader>
            {reviewPanel}
          </SheetContent>
        </Sheet>
      ) : null}

      <AlertDialog open={conflict !== null} onOpenChange={(open) => !open && setConflict(null)}>
        <AlertDialogContent size="sm">
          <AlertDialogHeader>
            <AlertDialogTitle>This chapter changed somewhere else</AlertDialogTitle>
            <AlertDialogDescription>
              Another tab or a generation run saved a newer version
              {conflict ? ` (v${conflict.currentVersion})` : ""}. Keep what you have here, or reload
              the newer version and lose your unsaved edits.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => window.location.reload()}>
              Reload theirs
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConflict(null);
                void autosave.keepMine();
              }}
            >
              Keep mine
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Outcomes only — never the manuscript or streaming text. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <Toaster position="bottom-center" />
    </>
  );
}
