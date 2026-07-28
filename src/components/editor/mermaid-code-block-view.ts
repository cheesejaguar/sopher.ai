import type { Node as PMNode } from "@tiptap/pm/model";
import type { NodeView } from "@tiptap/pm/view";

/**
 * A vanilla ProseMirror node view for code blocks. Non-mermaid languages get
 * the default pre/code rendering; ```mermaid blocks render a live diagram and
 * keep the source collapsed until the block has focus, so a finished diagram
 * reads as a diagram rather than a diagram stacked on its own source.
 *
 * The collapsed source stays in the DOM (height 0, not display:none) so
 * ProseMirror can still place a cursor in it and keyboard navigation through
 * the document is unaffected — focusing it expands it.
 *
 * On each successful render the SVG plus a PNG rasterization are posted to
 * /api/assets/diagram. Mermaid needs a DOM, so this is the only place a render
 * can happen; the server-side surfaces (reading view, EPUB, PDF, DOCX) read
 * that cache instead of re-rendering.
 */

let initializedTheme: "default" | "dark" | null = null;
let viewCounter = 0;

/** Source hashes already uploaded this session — avoids re-posting on every keystroke. */
const uploaded = new Set<string>();

const PREVIEW_CLASS =
  "flex justify-center overflow-x-auto rounded-md border border-paper-edge bg-paper p-4 [&_svg]:h-auto [&_svg]:max-w-full";
const ERROR_CLASS =
  "mt-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 font-sans text-xs leading-relaxed text-destructive";
const SOURCE_CLASS =
  "mt-2 overflow-x-auto rounded-md bg-muted/70 p-3 font-mono text-xs leading-relaxed";
// Collapsed: removed from view but still focusable and cursor-addressable.
const SOURCE_COLLAPSED_CLASS = "h-0 overflow-hidden opacity-0 mt-0 p-0 border-0";
const TOGGLE_CLASS =
  "mt-1 inline-flex items-center rounded px-1.5 py-0.5 font-sans text-[0.68rem] text-muted-foreground hover:text-foreground";

const RENDER_DEBOUNCE_MS = 600;
const RASTER_SCALE = 2;

/** Normalization must match `normalizeDiagramSource` on the server exactly. */
function normalizeSource(source: string): string {
  return source
    .trim()
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Node labels from the rendered SVG make a far better alt text than the source. */
function altTextFrom(svgEl: SVGElement | null, fallback: string): string {
  const labels = Array.from(svgEl?.querySelectorAll("text, .nodeLabel") ?? [])
    .map((el) => (el.textContent ?? "").trim())
    .filter(Boolean);
  const unique = Array.from(new Set(labels));
  if (unique.length === 0) return fallback;
  return `Diagram: ${unique.slice(0, 12).join(", ")}`.slice(0, 480);
}

/** Rasterizes an SVG string to base64 PNG. Returns null when the browser refuses. */
async function rasterize(svg: string, svgEl: SVGElement | null): Promise<string | null> {
  const viewBox = svgEl
    ?.getAttribute("viewBox")
    ?.split(/[\s,]+/)
    .map(Number);
  const width = viewBox && viewBox.length === 4 ? viewBox[2] : (svgEl?.clientWidth ?? 800);
  const height = viewBox && viewBox.length === 4 ? viewBox[3] : (svgEl?.clientHeight ?? 600);
  if (!width || !height) return null;

  // Explicit dimensions: mermaid emits width="100%", which canvas cannot size from.
  const sized = svg.replace(/<svg([^>]*)>/, (match, attrs: string) => {
    const cleaned = attrs.replace(/\s(width|height)="[^"]*"/g, "");
    return `<svg${cleaned} width="${width}" height="${height}">`;
  });

  const blob = new Blob([sized], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("SVG failed to load"));
      image.src = url;
    });

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width * RASTER_SCALE);
    canvas.height = Math.round(height * RASTER_SCALE);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    // Diagrams are line art on transparent ground; flatten onto white so the
    // PNG reads correctly in PDF and DOCX.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png").split(",")[1] ?? null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export class MermaidCodeBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;

  private node: PMNode;
  private preview: HTMLDivElement | null = null;
  private errorEl: HTMLDivElement | null = null;
  private sourceEl: HTMLPreElement | null = null;
  private toggle: HTMLButtonElement | null = null;
  private timer: number | null = null;
  private renderedSource: string | null = null;
  private lastRenderId: string | null = null;
  private destroyed = false;
  private expanded = false;
  private readonly viewId = `editor-mermaid-${++viewCounter}`;

  constructor(
    node: PMNode,
    private readonly chapterId?: string,
  ) {
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
      // Hide it from assistive tech; the figcaption carries the description.
      this.preview = document.createElement("div");
      this.preview.className = PREVIEW_CLASS;
      this.preview.contentEditable = "false";
      this.preview.setAttribute("aria-hidden", "true");

      this.errorEl = document.createElement("div");
      this.errorEl.className = `${ERROR_CLASS} hidden`;
      this.errorEl.contentEditable = "false";
      this.errorEl.setAttribute("role", "alert");

      this.sourceEl = pre;
      pre.className = `${SOURCE_CLASS} ${SOURCE_COLLAPSED_CLASS}`;
      code.className = "language-mermaid";

      this.toggle = document.createElement("button");
      this.toggle.type = "button";
      this.toggle.className = TOGGLE_CLASS;
      this.toggle.contentEditable = "false";
      this.toggle.textContent = "Edit source";
      this.toggle.setAttribute("aria-expanded", "false");
      this.toggle.addEventListener("mousedown", (event) => {
        // Keep the editor selection intact when toggling.
        event.preventDefault();
        this.setExpanded(!this.expanded);
        if (this.expanded) this.contentDOM.focus();
      });

      const caption = document.createElement("figcaption");
      caption.className = "sr-only";
      caption.contentEditable = "false";
      caption.textContent = "Diagram. Its Mermaid source follows and is editable.";

      // Focus anywhere inside the figure (including the source) expands it.
      figure.addEventListener("focusin", () => this.setExpanded(true));
      figure.addEventListener("focusout", () => {
        window.setTimeout(() => {
          if (this.destroyed) return;
          if (!figure.contains(document.activeElement)) this.setExpanded(false);
        }, 0);
      });

      figure.append(this.preview, this.errorEl, pre, this.toggle, caption);
      this.dom = figure;
      this.scheduleRender(0);
    } else {
      pre.className = SOURCE_CLASS;
      if (language) code.className = `language-${language}`;
      this.dom = pre;
    }
  }

  private setExpanded(expanded: boolean): void {
    if (!this.sourceEl || this.expanded === expanded) return;
    this.expanded = expanded;
    this.sourceEl.className = expanded ? SOURCE_CLASS : `${SOURCE_CLASS} ${SOURCE_COLLAPSED_CLASS}`;
    this.toggle?.setAttribute("aria-expanded", String(expanded));
    if (this.toggle) this.toggle.textContent = expanded ? "Hide source" : "Edit source";
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

      void this.cache(source, svg);
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
      // Expand so the source the reader must fix is actually visible.
      this.setExpanded(true);
      if (!this.preview.innerHTML) this.preview.classList.add("hidden");
    }
  }

  /**
   * Uploads the render so server-rendered surfaces can show a diagram. Entirely
   * best-effort: a failure here only means an export falls back to source text.
   */
  private async cache(source: string, svg: string): Promise<void> {
    if (!this.chapterId || this.destroyed) return;
    try {
      const normalized = normalizeSource(source);
      const hash = await sha256Hex(normalized);
      if (uploaded.has(hash)) return;
      uploaded.add(hash);

      const svgEl = this.preview?.querySelector("svg") ?? null;
      const pngBase64 = await rasterize(svg, svgEl);
      if (!pngBase64) {
        uploaded.delete(hash);
        return;
      }

      const response = await fetch("/api/assets/diagram", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapterId: this.chapterId,
          source: normalized,
          svg,
          pngBase64,
          alt: altTextFrom(svgEl, "Diagram"),
        }),
      });
      // Allow a retry on the next render if the server rejected it.
      if (!response.ok) uploaded.delete(hash);
    } catch {
      // Non-fatal by design.
    }
  }
}

/** `editorProps.nodeViews` factory for the codeBlock node. */
export function mermaidCodeBlockView(chapterId?: string) {
  return (node: PMNode): NodeView => new MermaidCodeBlockView(node, chapterId);
}
