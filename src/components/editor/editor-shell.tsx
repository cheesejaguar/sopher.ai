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
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import StarterKit from "@tiptap/starter-kit";
import CharacterCount from "@tiptap/extension-character-count";
import { Markdown } from "tiptap-markdown";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { acknowledgePaidResponse, idempotentPaidFetch } from "@/lib/client/idempotent-paid-fetch";

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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import type {
  ChapterNavItem,
  ContentToolResponse,
  EditorProductionStatus,
  ReviewResponse,
  SelectionEditResponse,
  SuggestionActionResponse,
  SuggestionDTO,
} from "@/lib/editor/types";
import { markdownSelection } from "@/lib/editor/markdown-offsets";

import { ChapterSidebar } from "./chapter-sidebar";
import { editorContainsContentToolOutput } from "./content-tool-delivery";
import { ImageNode } from "./image-node";
import { mermaidCodeBlockView } from "./mermaid-code-block-view";
import { ReviewPanel } from "./review-panel";
import { SelectionToolbar, SelectionToolsSheet, type ContentToolId } from "./selection-toolbar";
import {
  CompactProductionStatus,
  MobileEditorHeader,
  MobileEditorToolbar,
  StatusBar,
} from "./status-bar";
import { HistoryPanel } from "./history-panel";
import { FindReplace } from "./find-replace";
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
  productionStatus: EditorProductionStatus | null;
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

/** Elements that themselves must stay reachable while an editor overlay covers the app. */
const KEEP_REACHABLE = '[aria-live],[role="dialog"],[role="alertdialog"]';

/**
 * Zen mode paints a full-screen overlay over the studio chrome, but that chrome
 * stays in the tab order underneath it — keyboard focus would land on controls
 * the user cannot see (WCAG 2.4.11). Mark the covered siblings inert while zen
 * is on. Body-level portals (dialogs, menus) sit outside this walk, and live
 * regions such as the toaster are skipped explicitly. A covered sibling is
 * still inert when it merely contains a live-region descendant; otherwise one
 * hidden status node can leave the entire project shell keyboard-reachable.
 */
function hideBehindOverlay(overlay: HTMLElement): () => void {
  const hidden: HTMLElement[] = [];
  let node: HTMLElement | null = overlay;
  while (node?.parentElement && node.parentElement !== document.body) {
    for (const sibling of Array.from(node.parentElement.children)) {
      if (sibling === node || !(sibling instanceof HTMLElement) || sibling.inert) continue;
      if (sibling.matches(KEEP_REACHABLE)) continue;
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

async function postJson<T>(
  url: string,
  body: unknown,
  paid = false,
): Promise<{ status: number; data: T; acknowledge: () => void }> {
  try {
    const serializedBody = JSON.stringify(body);
    const init = {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: serializedBody,
    };
    const res = paid ? await idempotentPaidFetch(url, init) : await fetch(url, init);
    const data = (await res.json().catch(() => ({}))) as T;
    return {
      status: res.status,
      data,
      acknowledge: () => {
        if (paid) acknowledgePaidResponse(res);
      },
    };
  } catch {
    // Mutation handlers already map non-success statuses to a visible toast or
    // partial-success message. Returning a synthetic offline status keeps a
    // rejected fetch from becoming an unhandled promise when callbacks are
    // intentionally invoked with `void`.
    return {
      status: 0,
      data: { error: "Network unavailable. Check your connection and try again." } as T,
      acknowledge: () => undefined,
    };
  }
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
  productionStatus,
}: EditorShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const zen = searchParams.get("zen") === "1";
  const isPhone = useMediaQuery("(max-width: 767px)");
  const isWideWorkbench = useMediaQuery("(min-width: 1280px)");

  const [suggestions, setSuggestions] = useState<SuggestionDTO[]>(() =>
    initialSuggestions.filter((s) => s.status === "pending"),
  );
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [conflict, setConflict] = useState<{ currentVersion: number } | null>(null);
  const [chaptersOpen, setChaptersOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [selectionToolsOpen, setSelectionToolsOpen] = useState(false);
  const [, forceLayout] = useReducer((n: number) => n + 1, 0);

  const [paperEl, setPaperEl] = useState<HTMLDivElement | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const suppressDirtyRef = useRef(false);
  const zenRef = useRef<HTMLDivElement | null>(null);
  const phoneShellRef = useRef<HTMLDivElement | null>(null);
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
      nodeViews: { codeBlock: mermaidCodeBlockView(chapterId) },
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
          const message = "Couldn't save the chapter before editing — resolve the conflict first.";
          toast.error(message);
          setAnnouncement(message);
          return;
        }
        const selection = markdownSelection(ed.state, serializeDoc, from, to);
        if (!selection) {
          const message = "Couldn't map that selection — try selecting a slightly larger passage.";
          toast.error(message);
          setAnnouncement(message);
          return;
        }
        const { status, data, acknowledge } = await postJson<
          SelectionEditResponse & { error?: unknown }
        >(`/api/chapters/${chapterId}/edits`, { selection, instruction }, true);
        if (status === 201 && data.suggestion) {
          setSuggestions((prev) => [...prev, data.suggestion]);
          setActiveId(data.suggestion.id);
          // The toolbar the user was standing on unmounts while busy; hand
          // focus to the result instead of dropping it on the body.
          focusCardRef.current = data.suggestion.id;
          setAnnouncement("A suggestion is ready below the passage.");
          acknowledge();
        } else if (status === 402) {
          const message = String(data.error ?? "Monthly budget reached.");
          toast.error(message);
          setAnnouncement(message);
        } else if (status === 409) {
          const message = "The saved chapter moved under you — try again.";
          toast.error(message);
          setAnnouncement(message);
        } else {
          const message = "The editor couldn't produce a suggestion. Try again.";
          toast.error(message);
          setAnnouncement(message);
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
          const message = "Couldn't save the chapter first — resolve the conflict.";
          toast.error(message);
          setAnnouncement(message);
          return;
        }
        const selection = markdownSelection(ed.state, serializeDoc, from, to);
        if (!selection) {
          const message = "Couldn't read that selection — try reselecting.";
          toast.error(message);
          setAnnouncement(message);
          return;
        }
        const { status, data, acknowledge } = await postJson<
          ContentToolResponse & { error?: unknown }
        >(`/api/content-tools/${toolId}`, { chapterId, text: selection.text }, true);
        if (status !== 200 || !data.output) {
          const message =
            status === 402
              ? String(data.error ?? "Monthly budget reached.")
              : String(data.error ?? "The tool didn't produce a result.");
          toast.error(message);
          setAnnouncement(message);
          return;
        }
        const alreadyInserted =
          data.replayed === true && editorContainsContentToolOutput(ed.state.doc, data.output);
        let inserted = alreadyInserted;
        if (!alreadyInserted) {
          const insertPos = ed.state.selection.$to.after(1);
          if (data.output.kind === "mermaid") {
            inserted = ed
              .chain()
              .focus()
              .insertContentAt(insertPos, {
                type: "codeBlock",
                attrs: { language: "mermaid" },
                content: [{ type: "text", text: data.output.source }],
              })
              .run();
          } else {
            const { url, alt } = data.output;
            inserted = ed
              .chain()
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
          }
        }
        if (!inserted) {
          const message = "The result is ready, but it could not be inserted. Try again.";
          toast.error(message);
          setAnnouncement(message);
          return;
        }
        if (!(await autosaveRef.current.flush())) {
          const message =
            "The result was inserted locally but could not be saved. Resolve the save conflict before leaving this chapter.";
          toast.warning(message);
          setAnnouncement(message);
          return;
        }
        const successMessage = alreadyInserted
          ? data.output.kind === "mermaid"
            ? "Diagram was already added."
            : "Illustration was already added."
          : data.output.kind === "mermaid"
            ? "Diagram added below the passage."
            : "Illustration added below the passage.";
        toast.success(successMessage);
        setAnnouncement(successMessage);
        acknowledge();
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
          const message = "Couldn't save the chapter first — resolve the conflict.";
          toast.error(message);
          setAnnouncement(message);
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
          try {
            const { status: dismissStatus } = await postJson(
              `/api/chapters/${chapterId}/edits/${id}`,
              { action: "reject" },
            );
            if (dismissStatus === 200 || dismissStatus === 409) {
              setSuggestions((prev) => prev.filter((s) => s.id !== id));
              setActiveId((cur) => (cur === id ? null : cur));
              setAnnouncement("Your edit was applied to the passage.");
            } else {
              setActiveId((cur) => (cur === id ? null : cur));
              toast.warning(
                "Your wording was applied, but the suggestion could not be dismissed. You can retry from Suggestions.",
              );
              setAnnouncement(
                "Your edit was applied, but the suggestion is still pending and can be dismissed from Suggestions.",
              );
            }
          } catch {
            setActiveId((cur) => (cur === id ? null : cur));
            toast.warning(
              "Your wording was applied, but the suggestion could not be dismissed. You can retry from Suggestions.",
            );
            setAnnouncement(
              "Your edit was applied, but the suggestion is still pending and can be dismissed from Suggestions.",
            );
          }
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
      const results = await Promise.allSettled(
        ids.map((id) => postJson(`/api/chapters/${chapterId}/edits/${id}`, { action: "reject" })),
      );
      const dismissed = new Set<string>();
      results.forEach((result, index) => {
        if (
          result.status === "fulfilled" &&
          (result.value.status === 200 || result.value.status === 409)
        ) {
          dismissed.add(ids[index]);
        }
      });
      const failed = ids.length - dismissed.size;
      setSuggestions((prev) => prev.filter((suggestion) => !dismissed.has(suggestion.id)));
      setActiveId((current) => (current && dismissed.has(current) ? null : current));
      if (failed > 0) {
        toast.warning(
          `Dismissed ${dismissed.size}; ${failed} suggestion${failed === 1 ? "" : "s"} could not be dismissed. Try again.`,
        );
        setAnnouncement(
          `${failed} suggestion${failed === 1 ? " remains" : "s remain"} pending after a partial dismissal.`,
        );
      } else {
        setAnnouncement(`Dismissed ${ids.length} suggestion${ids.length === 1 ? "" : "s"}.`);
      }
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
          const message = "Couldn't save the chapter first — resolve the conflict.";
          toast.error(message);
          setAnnouncement(message);
          return;
        }
        const { status, data, acknowledge } = await postJson<ReviewResponse & { error?: unknown }>(
          `/api/chapters/${chapterId}/review`,
          { instruction },
          true,
        );
        if (status !== 200 || !data.suggestions) {
          const message =
            status === 402
              ? String(data.error ?? "Monthly budget reached.")
              : "The review didn't complete — try again.";
          toast.error(message);
          setAnnouncement(message);
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
        acknowledge();
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
  const openFind = useCallback(() => setFindOpen(true), []);
  const keysRef = useRef({
    zen,
    activeId,
    toggleZen,
    acceptSuggestion,
    rejectSuggestion,
    dismissCard,
    openFind,
  });
  useEffect(() => {
    keysRef.current = {
      zen,
      activeId,
      toggleZen,
      acceptSuggestion,
      rejectSuggestion,
      dismissCard,
      openFind,
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
      if (mod && event.key.toLowerCase() === "f") {
        event.preventDefault();
        keysRef.current.openFind();
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

  // The phone editor is a focused full-viewport workspace. Until the product
  // shell omits its mobile chrome on editor routes, keep that covered chrome
  // out of the accessibility tree as well as visually behind this surface.
  useEffect(() => {
    if (!isPhone || zen || !phoneShellRef.current) return;
    return hideBehindOverlay(phoneShellRef.current);
  }, [isPhone, zen]);

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

  const activeSuggestion = activeId ? suggestions.find((s) => s.id === activeId) : undefined;
  const activeItem = activeId ? items.find((i) => i.suggestion.id === activeId) : undefined;
  const cardPos = isWideWorkbench ? computeCardPosition(editor, activeItem, paperEl) : null;

  const canvas = (
    <div
      className={cn(
        "instrument-canvas relative h-full min-w-0 overflow-y-auto overscroll-contain",
        isPhone && "bg-paper",
      )}
    >
      <div
        className={cn(
          "mx-auto max-w-[78ch] px-4 py-8",
          zen && !isPhone && "py-16",
          isPhone && "min-h-full max-w-none p-0",
        )}
      >
        <div
          ref={setPaperEl}
          className={cn(
            "relative px-8 py-12 sm:px-14 sm:py-16",
            isPhone
              ? "paper-surface min-h-full rounded-none border-x-0 border-y-0 px-5 pt-7 pb-28 shadow-none"
              : "manuscript-sheet",
          )}
        >
          <header className={cn("mb-8", isPhone && "mb-6")}>
            <p className="folio-label text-paper-muted">Chapter {chapterNumber}</p>
            <h2
              className={cn(
                "mt-1 font-serif text-2xl font-semibold tracking-tight text-balance",
                isPhone && "text-xl",
              )}
            >
              {chapterTitle ?? `Chapter ${chapterNumber}`}
            </h2>
          </header>

          {/* Keyboard help, announced when focus enters the manuscript. */}
          <p id={shortcutsId} className="sr-only">
            Rich text editor. Select a passage and press Tab to reach the AI editing tools,
            including Diagram this and Illustrate this under More tools. Press Control or Command S
            to save, and Control or Command F to find and replace. When a suggestion is selected,
            press Control or Command Enter to accept it and Control or Command Backspace to reject
            it. Press Escape to close a suggestion, the find bar, or zen mode. Every suggestion is
            also listed in the suggestions panel, and past versions are in Chapter history. On a
            touch screen, select a passage and use Edit selected passage in the bottom toolbar for
            the same AI and content tools.
          </p>

          <EditorContent
            editor={editor}
            className={cn(
              isPhone &&
                "[&_.ProseMirror]:min-h-[calc(100dvh-15rem)] [&_.ProseMirror]:scroll-pb-32",
            )}
          />

          {editor && isWideWorkbench ? (
            <SelectionToolbar
              editor={editor}
              busy={busy === "edit" || busy === "tool"}
              onEdit={requestSelectionEdit}
              onTool={runContentTool}
            />
          ) : null}

          {activeSuggestion && cardPos && isWideWorkbench ? (
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
      touchFriendly={!isWideWorkbench}
    />
  );

  const restoreFromHistory = (restoredContent: string, restoredVersion: number) => {
    editor?.commands.setContent(restoredContent);
    autosave.markSynced(restoredVersion);
  };

  const statusBar = (
    <StatusBar
      editor={editor}
      saveState={autosave.state}
      targetWords={targetWords}
      pendingCount={suggestions.length}
      zen={zen}
      onToggleZen={toggleZen}
      extras={
        <>
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            aria-label="Find and replace (⌘F)"
            onClick={() => setFindOpen((prev) => !prev)}
          >
            <Search aria-hidden="true" className="size-3.5" />
          </Button>
          <HistoryPanel
            chapterId={chapterId}
            getCurrentContent={() => (editor ? serializeDoc(editor.state.doc) : "")}
            flush={() => autosave.flush()}
            onRestored={restoreFromHistory}
          />
        </>
      }
    />
  );

  const findBar =
    findOpen && editor && isWideWorkbench ? (
      <FindReplace editor={editor} onClose={() => setFindOpen(false)} />
    ) : null;

  const mobileToolbar = (
    <MobileEditorToolbar
      editor={editor}
      pendingCount={suggestions.length}
      zen={zen}
      reviewOpen={reviewOpen}
      selectionToolsOpen={selectionToolsOpen}
      findOpen={findOpen}
      onOpenSelectionTools={() => setSelectionToolsOpen(true)}
      onOpenReview={() => setReviewOpen(true)}
      onOpenFind={() => setFindOpen(true)}
      onToggleZen={toggleZen}
      history={
        <HistoryPanel
          compact
          chapterId={chapterId}
          getCurrentContent={() => (editor ? serializeDoc(editor.state.doc) : "")}
          flush={() => autosave.flush()}
          onRestored={restoreFromHistory}
        />
      }
    />
  );

  const mobileHeader = (
    <MobileEditorHeader
      chapterNumber={chapterNumber}
      chapterTitle={chapterTitle}
      saveState={autosave.state}
      chaptersOpen={chaptersOpen}
      onOpenChapters={() => setChaptersOpen(true)}
      productionStatus={productionStatus}
    />
  );

  return (
    <>
      {zen ? (
        <div ref={zenRef} className="fixed inset-0 z-50 flex flex-col bg-background">
          {isWideWorkbench ? findBar : mobileHeader}
          {isWideWorkbench && productionStatus ? (
            <CompactProductionStatus status={productionStatus} />
          ) : null}
          <div className="min-h-0 flex-1 overflow-hidden">{canvas}</div>
          {isWideWorkbench ? statusBar : mobileToolbar}
        </div>
      ) : isWideWorkbench ? (
        <div className="instrument-surface flex h-[calc(100dvh-13rem)] min-h-[520px] flex-col overflow-hidden">
          {productionStatus ? <CompactProductionStatus status={productionStatus} /> : null}
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
              <ResizablePanel minSize={360}>
                <div className="flex h-full min-h-0 flex-col">
                  {findBar}
                  <div className="min-h-0 flex-1">{canvas}</div>
                </div>
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize={330} minSize={260} maxSize={460}>
                {reviewPanel}
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
          {statusBar}
        </div>
      ) : (
        <div
          ref={phoneShellRef}
          data-editor-workbench="true"
          className={cn(
            "instrument-surface flex h-[calc(100dvh-13rem)] min-h-[520px] min-w-0 flex-col overflow-hidden",
            isPhone &&
              "fixed inset-0 z-[45] h-dvh min-h-0 w-full rounded-none border-0 bg-background",
          )}
        >
          {mobileHeader}
          <div className="min-h-0 min-w-0 flex-1 overflow-hidden">{canvas}</div>
          {mobileToolbar}
        </div>
      )}

      {!isWideWorkbench ? (
        <Sheet open={reviewOpen} onOpenChange={setReviewOpen}>
          <SheetContent
            side="right"
            className={cn(
              "w-[380px] gap-0 p-0 sm:max-w-[380px]",
              isPhone && "h-dvh w-full max-w-none sm:max-w-none",
            )}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Suggestions</SheetTitle>
              <SheetDescription>
                Review, accept, reject, or request editorial suggestions for this chapter.
              </SheetDescription>
            </SheetHeader>
            {reviewPanel}
          </SheetContent>
        </Sheet>
      ) : null}

      {!isWideWorkbench ? (
        <Sheet open={chaptersOpen} onOpenChange={setChaptersOpen}>
          <SheetContent
            side="left"
            className={cn(
              "w-[22rem] gap-0 p-0 sm:max-w-[22rem]",
              isPhone && "h-dvh w-[min(92vw,24rem)]",
            )}
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Choose a chapter</SheetTitle>
              <SheetDescription>Open another drafted chapter in the editor.</SheetDescription>
            </SheetHeader>
            <ChapterSidebar
              projectId={projectId}
              bookTitle={bookTitle}
              chapters={chapters}
              activeChapterNumber={chapterNumber}
              touchFriendly
              onNavigate={() => setChaptersOpen(false)}
            />
          </SheetContent>
        </Sheet>
      ) : null}

      {!isWideWorkbench && editor ? (
        <Sheet open={findOpen} onOpenChange={setFindOpen}>
          <SheetContent
            side="bottom"
            className="max-h-[min(86dvh,34rem)] gap-0 overflow-y-auto p-0"
          >
            <SheetHeader className="border-b border-border px-4 py-3 pr-14 text-left">
              <SheetTitle>Find and replace</SheetTitle>
              <SheetDescription>Search within chapter {chapterNumber}.</SheetDescription>
            </SheetHeader>
            <FindReplace editor={editor} onClose={() => setFindOpen(false)} touchLayout />
          </SheetContent>
        </Sheet>
      ) : null}

      {!isWideWorkbench ? (
        <SelectionToolsSheet
          open={selectionToolsOpen}
          onOpenChange={setSelectionToolsOpen}
          busy={busy === "edit" || busy === "tool"}
          onEdit={requestSelectionEdit}
          onTool={runContentTool}
        />
      ) : null}

      {!isWideWorkbench && activeSuggestion ? (
        <Sheet
          open
          onOpenChange={(open) => {
            if (!open) dismissCard();
          }}
        >
          <SheetContent
            side="bottom"
            showCloseButton={false}
            className="max-h-[min(88dvh,40rem)] gap-0 overflow-y-auto bg-popover p-0"
          >
            <SheetHeader className="sr-only">
              <SheetTitle>Editor suggestion</SheetTitle>
              <SheetDescription>
                Compare the proposed wording, then accept, edit, or reject it.
              </SheetDescription>
            </SheetHeader>
            <div
              ref={cardRef}
              role="group"
              aria-label="Editor suggestion"
              tabIndex={-1}
              className="focus:ring-2 focus:ring-inset focus:ring-ring focus:outline-none"
            >
              <SuggestionCard
                key={activeSuggestion.id}
                suggestion={activeSuggestion}
                busy={busy === "apply"}
                onAccept={() => void acceptSuggestion(activeSuggestion.id)}
                onAcceptEdited={(text) => void acceptSuggestion(activeSuggestion.id, text)}
                onReject={() => void rejectSuggestion(activeSuggestion.id)}
                onDismiss={dismissCard}
                touchFriendly
              />
            </div>
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
            <AlertDialogCancel
              className={cn(!isWideWorkbench && "min-h-11 rounded-sm")}
              onClick={() => window.location.reload()}
            >
              Reload theirs
            </AlertDialogCancel>
            <AlertDialogAction
              className={cn(!isWideWorkbench && "min-h-11 rounded-sm")}
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

      <Toaster position={isPhone ? "top-center" : "bottom-center"} />
    </>
  );
}
