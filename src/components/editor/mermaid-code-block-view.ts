import type { Node as PMNode } from "@tiptap/pm/model";
import type { NodeView } from "@tiptap/pm/view";

/**
 * A vanilla ProseMirror node view for code blocks. Non-mermaid languages get
 * the default pre/code rendering; ```mermaid blocks additionally render a
 * live diagram preview above the (still editable) source, with a designed
 * error state when the source does not parse. Mermaid itself is lazy-loaded
 * on first render. The document keeps storing a plain fenced code block, so
 * everything round-trips through markdown untouched.
 */

let initializedTheme: "default" | "dark" | null = null;
let viewCounter = 0;

const PREVIEW_CLASS =
  "flex justify-center overflow-x-auto rounded-md border border-paper-edge bg-paper p-4 [&_svg]:h-auto [&_svg]:max-w-full";
const ERROR_CLASS =
  "mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 font-sans text-xs leading-relaxed text-destructive";
const SOURCE_CLASS =
  "mt-2 overflow-x-auto rounded-md bg-muted/70 p-3 font-mono text-xs leading-relaxed";

const RENDER_DEBOUNCE_MS = 600;

export class MermaidCodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;

  private node: PMNode;
  private preview: HTMLDivElement | null = null;
  private errorEl: HTMLDivElement | null = null;
  private timer: number | null = null;
  private renderedSource: string | null = null;
  private lastRenderId: string | null = null;
  private destroyed = false;
  private readonly viewId = `editor-mermaid-${++viewCounter}`;

  constructor(node: PMNode) {
    this.node = node;
    const language: string = node.attrs.language ?? "";

    const pre = document.createElement("pre");
    const code = document.createElement("code");
    pre.appendChild(code);
    this.contentDOM = code;

    if (language === "mermaid") {
      const figure = document.createElement("figure");
      figure.className = "my-6";
      figure.setAttribute("data-mermaid-figure", "true");

      // The rendered SVG is an unlabelled blob of shapes and stray text runs.
      // Hide it from assistive tech and let the Mermaid source below act as
      // the text alternative — it is right there in the figure, and editable.
      this.preview = document.createElement("div");
      this.preview.className = PREVIEW_CLASS;
      this.preview.contentEditable = "false";
      this.preview.setAttribute("aria-hidden", "true");

      this.errorEl = document.createElement("div");
      this.errorEl.className = `${ERROR_CLASS} hidden`;
      this.errorEl.contentEditable = "false";
      this.errorEl.setAttribute("role", "alert");

      pre.className = SOURCE_CLASS;
      code.className = "language-mermaid";

      const caption = document.createElement("figcaption");
      caption.className = "sr-only";
      caption.contentEditable = "false";
      caption.textContent = "Diagram, described by the Mermaid source below.";

      figure.append(this.preview, this.errorEl, pre, caption);
      this.dom = figure;
      this.scheduleRender(0);
    } else {
      pre.className = SOURCE_CLASS;
      if (language) code.className = `language-${language}`;
      this.dom = pre;
    }
  }

  update(node: PMNode): boolean {
    if (node.type !== this.node.type) return false;
    // Language switches rebuild the whole view (adds/removes the preview).
    if (node.attrs.language !== this.node.attrs.language) return false;
    this.node = node;
    if (this.preview) this.scheduleRender(RENDER_DEBOUNCE_MS);
    return true;
  }

  ignoreMutation(mutation: MutationRecord | { type: "selection"; target: Node }): boolean {
    if (mutation.type === "selection") return false;
    // Preview/error updates must not be treated as document edits.
    return !this.contentDOM.contains(mutation.target);
  }

  destroy(): void {
    this.destroyed = true;
    if (this.timer !== null) window.clearTimeout(this.timer);
  }

  private scheduleRender(delay: number): void {
    if (this.timer !== null) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      this.timer = null;
      void this.render();
    }, delay);
  }

  private async render(): Promise<void> {
    if (!this.preview || !this.errorEl || this.destroyed) return;
    const source = this.node.textContent.trim();
    if (!source || source === this.renderedSource) return;

    try {
      const mermaid = (await import("mermaid")).default;
      const theme = document.documentElement.classList.contains("dark") ? "dark" : "default";
      if (initializedTheme !== theme) {
        mermaid.initialize({ startOnLoad: false, securityLevel: "strict", theme });
        initializedTheme = theme;
      }

      const renderId = `${this.viewId}-${Date.now()}`;
      this.lastRenderId = renderId;
      const { svg } = await mermaid.render(renderId, source);
      if (this.destroyed) return;

      this.renderedSource = source;
      this.preview.innerHTML = svg;
      this.preview.classList.remove("hidden");
      this.errorEl.classList.add("hidden");
    } catch (error) {
      if (this.destroyed) return;
      // Mermaid can leave an orphaned scratch element behind on parse errors.
      if (this.lastRenderId) {
        document.getElementById(this.lastRenderId)?.remove();
        document.getElementById(`d${this.lastRenderId}`)?.remove();
      }
      this.renderedSource = null;
      const message =
        error instanceof Error ? error.message.split("\n")[0] : "Invalid Mermaid syntax";
      const text = `Diagram won't render: ${message} — fix the source below.`;
      // Rewriting identical text re-fires the alert; only touch it on a change
      // so typing through a broken diagram doesn't interrupt over and over.
      if (this.errorEl.textContent !== text) this.errorEl.textContent = text;
      this.errorEl.classList.remove("hidden");
      if (!this.preview.innerHTML) this.preview.classList.add("hidden");
    }
  }
}

/** `editorProps.nodeViews` factory for the codeBlock node. */
export function mermaidCodeBlockView(node: PMNode): NodeView {
  return new MermaidCodeBlockView(node);
}
