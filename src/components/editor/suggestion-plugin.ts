import { Extension, type Editor } from "@tiptap/react";
import type { Node as PMNode } from "@tiptap/pm/model";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

import { findAnchorRangeInDoc } from "@/lib/editor/doc-text";
import type { SuggestionDTO } from "@/lib/editor/types";

/**
 * ProseMirror plugin behind the suggestion underlines. Pending suggestions
 * are located by searching for their quoted original text in the current doc
 * (see doc-text.ts); located ranges are then kept up to date cheaply by
 * mapping them through each transaction. Suggestions whose quote no longer
 * appears keep a null range and only show in the review panel ("unanchored").
 *
 * React owns the suggestion list/active state and pushes it in via metas;
 * clicks flow back out through the onActivate option.
 */

export type SuggestionItem = {
  suggestion: SuggestionDTO;
  range: { from: number; to: number } | null;
};

type PluginState = {
  items: SuggestionItem[];
  activeId: string | null;
  hoverId: string | null;
  decorations: DecorationSet;
};

type PluginMeta =
  | { type: "set"; suggestions: SuggestionDTO[] }
  | { type: "focus"; activeId: string | null; hoverId: string | null };

export const suggestionPluginKey = new PluginKey<PluginState>("suggestionHighlights");

const BASE_CLASS =
  "cursor-pointer border-b-2 border-dashed border-ai/70 bg-ai-soft/30 transition-colors";
const HOVER_CLASS = "bg-ai-soft/60";
const ACTIVE_CLASS = "border-solid border-ai bg-ai-soft/70";

function buildDecorations(
  doc: PMNode,
  items: SuggestionItem[],
  activeId: string | null,
  hoverId: string | null,
): DecorationSet {
  const decorations: Decoration[] = [];
  for (const item of items) {
    if (!item.range) continue;
    const id = item.suggestion.id;
    const cls = [BASE_CLASS, id === activeId ? ACTIVE_CLASS : id === hoverId ? HOVER_CLASS : ""]
      .filter(Boolean)
      .join(" ");
    decorations.push(
      Decoration.inline(item.range.from, item.range.to, {
        class: cls,
        "data-suggestion-id": id,
      }),
    );
  }
  return DecorationSet.create(doc, decorations);
}

function createSuggestionPlugin(onActivate?: (id: string | null) => void): Plugin<PluginState> {
  return new Plugin<PluginState>({
    key: suggestionPluginKey,
    state: {
      init: () => ({
        items: [],
        activeId: null,
        hoverId: null,
        decorations: DecorationSet.empty,
      }),
      apply(tr, prev, _oldState, newState) {
        let { items, activeId, hoverId } = prev;
        let changed = false;

        if (tr.docChanged && items.length > 0) {
          items = items.map((item) => {
            if (!item.range) return item;
            const from = tr.mapping.map(item.range.from, 1);
            const to = tr.mapping.map(item.range.to, -1);
            return { ...item, range: to > from ? { from, to } : null };
          });
          changed = true;
        }

        const meta = tr.getMeta(suggestionPluginKey) as PluginMeta | undefined;
        if (meta?.type === "set") {
          items = meta.suggestions.map((suggestion) => ({
            suggestion,
            range: findAnchorRangeInDoc(
              newState.doc,
              suggestion.anchor.originalText,
              suggestion.anchor.occurrence ?? 0,
            ),
          }));
          if (activeId && !items.some((i) => i.suggestion.id === activeId)) activeId = null;
          if (hoverId && !items.some((i) => i.suggestion.id === hoverId)) hoverId = null;
          changed = true;
        } else if (meta?.type === "focus") {
          activeId = meta.activeId;
          hoverId = meta.hoverId;
          changed = true;
        }

        if (!changed) return prev;
        return {
          items,
          activeId,
          hoverId,
          decorations: buildDecorations(newState.doc, items, activeId, hoverId),
        };
      },
    },
    props: {
      decorations(state) {
        return suggestionPluginKey.getState(state)?.decorations ?? null;
      },
      handleClick(view, pos) {
        const state = suggestionPluginKey.getState(view.state);
        if (!state || state.items.length === 0) return false;
        const hit = state.items.find((i) => i.range && pos >= i.range.from && pos <= i.range.to);
        onActivate?.(hit ? hit.suggestion.id : null);
        return false;
      },
    },
  });
}

export type SuggestionHighlightsOptions = {
  onActivate?: (id: string | null) => void;
};

export const SuggestionHighlights = Extension.create<SuggestionHighlightsOptions>({
  name: "suggestionHighlights",

  addOptions() {
    return { onActivate: undefined };
  },

  addProseMirrorPlugins() {
    return [createSuggestionPlugin(this.options.onActivate)];
  },
});

/** Replace the plugin's suggestion list (re-anchors everything by text search). */
export function setPluginSuggestions(editor: Editor, suggestions: SuggestionDTO[]): void {
  editor.view.dispatch(editor.state.tr.setMeta(suggestionPluginKey, { type: "set", suggestions }));
}

/** Update which suggestion is active/hovered (styling only). */
export function setPluginFocus(
  editor: Editor,
  activeId: string | null,
  hoverId: string | null,
): void {
  editor.view.dispatch(
    editor.state.tr.setMeta(suggestionPluginKey, { type: "focus", activeId, hoverId }),
  );
}

export function getSuggestionItems(editor: Editor): SuggestionItem[] {
  return suggestionPluginKey.getState(editor.state)?.items ?? [];
}
