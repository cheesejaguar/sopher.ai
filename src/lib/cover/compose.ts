/**
 * Lettering for a generated cover: pure layout math plus the SVG text layer.
 *
 * The painting costs a metered image call. The type costs nothing. Keeping the
 * two apart is the whole point — an author can try every arrangement without
 * paying four times for one painting — so everything here is deterministic,
 * dependency-free and safe to re-run on demand.
 */

export const COVER_LAYOUT_IDS = ["top-band", "centered-plate", "lower-third", "minimal"] as const;
export type CoverLayoutId = (typeof COVER_LAYOUT_IDS)[number];

export const COVER_PALETTE_IDS = ["ink", "paper"] as const;
export type CoverPaletteId = (typeof COVER_PALETTE_IDS)[number];

/** The art prompt reserves the top third, so the default lettering claims it. */
export const DEFAULT_COVER_LAYOUT: CoverLayoutId = "top-band";
export const DEFAULT_COVER_PALETTE: CoverPaletteId = "ink";

export const COVER_LAYOUTS: Record<CoverLayoutId, { label: string; description: string }> = {
  "top-band": {
    label: "Top band",
    description: "A full-width panel across the reserved top third",
  },
  "centered-plate": {
    label: "Centred plate",
    description: "A ruled plate floating over the upper half",
  },
  "lower-third": {
    label: "Lower third",
    description: "Left-aligned type rising out of a bottom scrim",
  },
  minimal: {
    label: "Minimal",
    description: "No panel — tracked capitals at the head and foot",
  },
};

export const COVER_PALETTES: Record<CoverPaletteId, { label: string }> = {
  ink: { label: "Light type on dark" },
  paper: { label: "Dark type on light" },
};

const DEFAULT_CANVAS = { width: 1024, height: 1536 };

/**
 * Literal sRGB, not design tokens: this layer is rasterised into a PNG that
 * ships inside EPUB and PDF files, where no stylesheet — and therefore no CSS
 * custom property — is ever resolved. The values are the `paper` tokens'
 * printed equivalents, and `compose.test.ts` holds them to WCAG AA against the
 * worst-case art each scrim can end up sitting on.
 */
const PALETTE_COLORS: Record<
  CoverPaletteId,
  { text: string; muted: string; scrim: string; rule: string; halo: string }
> = {
  ink: {
    text: "#f6f1e6",
    muted: "#dbd2c1",
    scrim: "#100d0a",
    rule: "#c9bda4",
    halo: "#100d0a",
  },
  paper: {
    text: "#221c14",
    muted: "#423a30",
    scrim: "#f6f1e6",
    rule: "#8c7d63",
    halo: "#f6f1e6",
  },
};

const SERIF_STACK = "'Source Serif 4', 'Source Serif Pro', Georgia, serif";
const SANS_STACK = "Archivo, Geist, 'Helvetica Neue', system-ui, sans-serif";

/** Mirrors the field limits in `bookMatterSchema`; longer input is a mistake. */
const MAX_CHARS = { title: 300, subtitle: 300, author: 200 } as const;

export type CoverTextRole = "title" | "subtitle" | "author";

type RoleSpec = {
  family: string;
  weight: number;
  italic?: boolean;
  uppercase?: boolean;
  /** Font size bounds and tracking, as fractions of the canvas width. */
  maxSize: number;
  minSize: number;
  tracking: number;
  lineGap: number;
  maxLines: number;
  color: "text" | "muted";
  /** Space above this role when it follows another, as a fraction of width. */
  gapAbove: number;
};

type GroupSpec = {
  roles: CoverTextRole[];
  /** Which edge of the stack the anchor pins, and where that anchor sits. */
  anchor: "top" | "center" | "bottom";
  anchorY: number;
  align: "start" | "middle" | "end";
  x: number;
  maxWidth: number;
  /** Ceiling on the whole stack's height, as a fraction of the canvas. */
  maxStack: number;
};

type ScrimSpec =
  | { kind: "none" }
  | { kind: "band"; padY: number; opacity: number; rule: boolean }
  | { kind: "plate"; padX: number; padY: number; opacity: number; minWidth: number }
  | { kind: "gradient"; rise: number; opacity: number };

type LayoutSpec = {
  roles: Record<CoverTextRole, RoleSpec>;
  groups: GroupSpec[];
  scrim: ScrimSpec;
  /** Outline behind glyphs, for the preset that letters straight onto art. */
  halo: number;
};

const TITLE_BASE: RoleSpec = {
  family: SERIF_STACK,
  weight: 600,
  maxSize: 0.108,
  minSize: 0.048,
  tracking: 0,
  lineGap: 1.14,
  maxLines: 3,
  color: "text",
  gapAbove: 0,
};

const SUBTITLE_BASE: RoleSpec = {
  family: SERIF_STACK,
  weight: 400,
  italic: true,
  maxSize: 0.044,
  minSize: 0.026,
  tracking: 0,
  lineGap: 1.3,
  maxLines: 2,
  color: "muted",
  gapAbove: 0.03,
};

const AUTHOR_BASE: RoleSpec = {
  family: SANS_STACK,
  weight: 500,
  uppercase: true,
  maxSize: 0.034,
  minSize: 0.022,
  tracking: 0.14,
  lineGap: 1.2,
  maxLines: 1,
  color: "text",
  gapAbove: 0.052,
};

const LAYOUTS: Record<CoverLayoutId, LayoutSpec> = {
  "top-band": {
    roles: {
      title: { ...TITLE_BASE, family: SANS_STACK, maxSize: 0.098, tracking: 0.01 },
      subtitle: SUBTITLE_BASE,
      author: AUTHOR_BASE,
    },
    groups: [
      {
        roles: ["title", "subtitle", "author"],
        anchor: "top",
        anchorY: 0.072,
        align: "middle",
        x: 0.5,
        maxWidth: 0.82,
        maxStack: 0.36,
      },
    ],
    scrim: { kind: "band", padY: 0.05, opacity: 0.72, rule: true },
    halo: 0,
  },
  "centered-plate": {
    roles: { title: TITLE_BASE, subtitle: SUBTITLE_BASE, author: AUTHOR_BASE },
    groups: [
      {
        roles: ["title", "subtitle", "author"],
        anchor: "center",
        anchorY: 0.34,
        align: "middle",
        x: 0.5,
        maxWidth: 0.64,
        maxStack: 0.4,
      },
    ],
    scrim: { kind: "plate", padX: 0.06, padY: 0.055, opacity: 0.88, minWidth: 0.6 },
    halo: 0,
  },
  "lower-third": {
    roles: {
      title: { ...TITLE_BASE, maxSize: 0.1 },
      subtitle: SUBTITLE_BASE,
      author: AUTHOR_BASE,
    },
    groups: [
      {
        roles: ["title", "subtitle", "author"],
        anchor: "bottom",
        anchorY: 0.9,
        align: "start",
        x: 0.09,
        maxWidth: 0.82,
        maxStack: 0.38,
      },
    ],
    scrim: { kind: "gradient", rise: 0.55, opacity: 0.86 },
    halo: 0,
  },
  minimal: {
    roles: {
      title: {
        ...TITLE_BASE,
        family: SANS_STACK,
        uppercase: true,
        maxSize: 0.062,
        minSize: 0.032,
        tracking: 0.1,
        lineGap: 1.35,
      },
      subtitle: { ...SUBTITLE_BASE, maxSize: 0.034, minSize: 0.022 },
      author: AUTHOR_BASE,
    },
    groups: [
      {
        roles: ["title", "subtitle"],
        anchor: "top",
        anchorY: 0.075,
        align: "middle",
        x: 0.5,
        maxWidth: 0.78,
        maxStack: 0.3,
      },
      {
        roles: ["author"],
        anchor: "bottom",
        anchorY: 0.935,
        align: "middle",
        x: 0.5,
        maxWidth: 0.7,
        maxStack: 0.08,
      },
    ],
    scrim: { kind: "none" },
    // Nothing darkens the art here, so every glyph carries its own contrast.
    halo: 0.1,
  },
};

/* ---------------------------------------------------------------- metrics */

/**
 * Advance widths in ems, good to a few percent for the stacks above. Real
 * shaping happens inside the rasteriser, which exposes no measurement API, so
 * the fitting loop needs its own estimate — one that errs slightly wide, so a
 * bad guess leaves a gap rather than running off the edge.
 */
const CHAR_WIDTHS: Record<string, number> = {
  " ": 0.26,
  " ": 0.26,
  i: 0.29,
  j: 0.31,
  l: 0.29,
  t: 0.37,
  f: 0.36,
  r: 0.4,
  I: 0.36,
  J: 0.5,
  m: 0.86,
  w: 0.76,
  M: 0.92,
  W: 0.94,
  ".": 0.27,
  ",": 0.27,
  ";": 0.27,
  ":": 0.27,
  "!": 0.31,
  "|": 0.27,
  "'": 0.23,
  "‘": 0.23,
  "’": 0.23,
  '"': 0.38,
  "“": 0.38,
  "”": 0.38,
  "(": 0.34,
  ")": 0.34,
  "[": 0.34,
  "]": 0.34,
  "-": 0.36,
  "–": 0.5,
  "—": 1,
  "…": 0.92,
};

/** East Asian Wide and Fullwidth: one em per glyph, and never space-separated. */
const WIDE =
  /[\u1100-\u115f\u2e80-\u303e\u3041-\u33ff\u3400-\u4dbf\u4e00-\u9fff\ua960-\ua97f\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe6f\uff00-\uff60\uffe0-\uffe6]/;
const COMBINING = /[\u0300-\u036f\u1ab0-\u1aff\u20d0-\u20ff\ufe00-\ufe0f]/;
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;

function charWidth(char: string): number {
  const known = CHAR_WIDTHS[char];
  if (known !== undefined) return known;
  if (COMBINING.test(char)) return 0;
  if (WIDE.test(char)) return 1;
  const code = char.codePointAt(0) ?? 0;
  // Astral planes are emoji and historic scripts; both are effectively square.
  if (code > 0xffff) return 1;
  if (char >= "0" && char <= "9") return 0.56;
  if (char >= "A" && char <= "Z") return 0.68;
  if (char >= "a" && char <= "z") return 0.52;
  return 0.55;
}

/**
 * Weight costs width. When the rasteriser has no bold face for a family it
 * synthesises one, and a synthesised bold measured here runs up to 16% wider
 * than its regular. Which face is available depends on the host, so the
 * estimate assumes the expensive answer.
 */
function weightFactor(fontWeight: number): number {
  if (fontWeight >= 600) return 1.16;
  if (fontWeight >= 500) return 1.05;
  return 1;
}

/** Width of one line in px, including the tracking added between glyphs. */
export function measureCoverText(
  text: string,
  fontSize: number,
  tracking = 0,
  fontWeight = 400,
): number {
  const chars = [...text];
  if (chars.length === 0) return 0;
  let ems = 0;
  for (const char of chars) ems += charWidth(char);
  return ems * fontSize * weightFactor(fontWeight) + Math.max(0, chars.length - 1) * tracking;
}

/* ------------------------------------------------------------- text shaping */

function normalize(value: string | null | undefined, limit: number): string {
  if (typeof value !== "string") return "";
  return value.replace(CONTROL, " ").replace(/\s+/g, " ").trim().slice(0, limit).trim();
}

/** One resolved set of type metrics, in px, for measuring a single role. */
export type CoverTypeMetrics = { fontSize: number; tracking: number; fontWeight: number };

function widthOf(text: string, metrics: CoverTypeMetrics): number {
  return measureCoverText(text, metrics.fontSize, metrics.tracking, metrics.fontWeight);
}

/** Split a token too wide for any line into pieces that do fit. */
function breakToken(token: string, metrics: CoverTypeMetrics, maxWidth: number): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const char of token) {
    const next = current + char;
    if (current && widthOf(next, metrics) > maxWidth) {
      pieces.push(current);
      current = char;
    } else {
      current = next;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

/**
 * Greedy wrap. Scripts written without spaces — Chinese, Japanese, Thai —
 * arrive as one enormous token and are broken per character, which is how they
 * wrap anyway.
 */
export function wrapCoverText(text: string, metrics: CoverTypeMetrics, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ").filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (widthOf(candidate, metrics) <= maxWidth) {
      line = candidate;
      continue;
    }
    if (line) lines.push(line);
    if (widthOf(word, metrics) <= maxWidth) {
      line = word;
      continue;
    }
    const pieces = breakToken(word, metrics, maxWidth);
    lines.push(...pieces.slice(0, -1));
    line = pieces[pieces.length - 1] ?? "";
  }
  if (line) lines.push(line);
  return lines;
}

function ellipsize(line: string, metrics: CoverTypeMetrics, maxWidth: number): string {
  let chars = [...line];
  while (chars.length > 0 && widthOf(`${chars.join("")}…`, metrics) > maxWidth) {
    chars = chars.slice(0, -1);
  }
  return `${chars.join("").trimEnd()}…`;
}

/**
 * Estimated widths are within a few percent of what the rasteriser paints, and
 * a few percent of a cover's width is the difference between a tight line and
 * a title running off the edge. Fit into slightly less than the box.
 */
const FIT_SAFETY = 0.96;

/** Largest size at which the text fits its box; truncated only as a last resort. */
function fitLines(
  text: string,
  spec: RoleSpec,
  width: number,
  maxWidth: number,
  ceiling: number,
): { metrics: CoverTypeMetrics; lines: string[]; truncated: boolean } {
  const box = maxWidth * FIT_SAFETY;
  const minSize = spec.minSize * width;
  const maxSize = Math.max(minSize, spec.maxSize * width * ceiling);
  const step = Math.max(0.5, width * 0.004);
  const metricsAt = (fontSize: number): CoverTypeMetrics => ({
    fontSize,
    tracking: spec.tracking * fontSize,
    fontWeight: spec.weight,
  });
  for (let fontSize = maxSize; fontSize > minSize; fontSize -= step) {
    const metrics = metricsAt(fontSize);
    const lines = wrapCoverText(text, metrics, box);
    if (lines.length <= spec.maxLines) return { metrics, lines, truncated: false };
  }
  const metrics = metricsAt(minSize);
  const lines = wrapCoverText(text, metrics, box);
  if (lines.length <= spec.maxLines) return { metrics, lines, truncated: false };
  const kept = lines.slice(0, spec.maxLines);
  kept[kept.length - 1] = ellipsize(kept[kept.length - 1]!, metrics, box);
  return { metrics, lines: kept, truncated: true };
}

/* ----------------------------------------------------------------- the plan */

export type CoverTextLine = { text: string; x: number; y: number; width: number };

export type CoverTextBlock = {
  role: CoverTextRole;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  /** Letter spacing in px, already resolved from the role's em value. */
  tracking: number;
  anchor: "start" | "middle" | "end";
  color: string;
  lines: CoverTextLine[];
  /** Painted extent, ascender to descender, which is what sizes the scrim. */
  top: number;
  bottom: number;
  truncated: boolean;
};

export type CoverScrim =
  | { kind: "none" }
  | {
      kind: "band";
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      opacity: number;
    }
  | {
      kind: "plate";
      x: number;
      y: number;
      width: number;
      height: number;
      color: string;
      opacity: number;
      border: string;
    }
  | {
      kind: "gradient";
      y: number;
      height: number;
      color: string;
      stops: Array<{ offset: number; opacity: number }>;
    };

export type CoverRule = { x1: number; y1: number; x2: number; y2: number; color: string };

export type CoverTypePlan = {
  layout: CoverLayoutId;
  palette: CoverPaletteId;
  width: number;
  height: number;
  scrim: CoverScrim;
  rules: CoverRule[];
  blocks: CoverTextBlock[];
  halo: { color: string; width: number } | null;
  /** True when a field was too long to set even at its smallest size. */
  truncated: boolean;
};

export type CoverTypeRequest = {
  title: string;
  subtitle?: string | null;
  author?: string | null;
  layout?: CoverLayoutId;
  palette?: CoverPaletteId;
  width?: number;
  height?: number;
};

const ASCENT = 0.78;
const DESCENT = 0.24;

export function planCoverType(request: CoverTypeRequest): CoverTypePlan {
  const layout = request.layout && LAYOUTS[request.layout] ? request.layout : DEFAULT_COVER_LAYOUT;
  const palette =
    request.palette && PALETTE_COLORS[request.palette] ? request.palette : DEFAULT_COVER_PALETTE;
  const spec = LAYOUTS[layout];
  const colors = PALETTE_COLORS[palette];
  const width = Math.max(1, Math.round(request.width ?? DEFAULT_CANVAS.width));
  const height = Math.max(1, Math.round(request.height ?? DEFAULT_CANVAS.height));

  // A book always has a title; a blank one is a data accident, not a design.
  const text: Record<CoverTextRole, string> = {
    title: normalize(request.title, MAX_CHARS.title) || "Untitled",
    subtitle: normalize(request.subtitle, MAX_CHARS.subtitle),
    author: normalize(request.author, MAX_CHARS.author),
  };

  const blocks: CoverTextBlock[] = [];
  for (const group of spec.groups) {
    // A three-line title set at full size can swallow half the painting. Shrink
    // the whole stack together until it stays inside its share of the cover.
    let measured = fitGroup(group, spec, text, colors, width, 1);
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (measured.stackHeight <= group.maxStack * height) break;
      measured = fitGroup(group, spec, text, colors, width, 0.88 ** (attempt + 1));
    }
    const { entries, stackHeight } = measured;
    if (entries.length === 0) continue;

    const anchorY = group.anchorY * height;
    let cursor =
      group.anchor === "top"
        ? anchorY
        : group.anchor === "bottom"
          ? anchorY - stackHeight
          : anchorY - stackHeight / 2;
    entries.forEach((entry, index) => {
      if (index > 0) cursor += entry.spec.gapAbove * width;
      const top = cursor;
      const firstBaseline = top + entry.block.fontSize * ASCENT;
      entry.block.lines = entry.block.lines.map((line, lineIndex) => ({
        ...line,
        y: firstBaseline + lineIndex * entry.block.fontSize * entry.spec.lineGap,
      }));
      entry.block.top = top;
      entry.block.bottom = top + entry.height;
      cursor = entry.block.bottom;
      blocks.push(entry.block);
    });
  }

  const extent = textExtent(blocks, group0Roles(spec), width, height);

  return {
    layout,
    palette,
    width,
    height,
    scrim: buildScrim(spec.scrim, extent, width, height, colors),
    rules: buildRules(spec.scrim, extent, width, colors),
    blocks,
    halo: spec.halo > 0 ? { color: colors.halo, width: spec.halo } : null,
    truncated: blocks.some((block) => block.truncated),
  };
}

type FittedEntry = { spec: RoleSpec; block: CoverTextBlock; height: number };

/** Fit every present role in a group at one shared size ceiling. */
function fitGroup(
  group: GroupSpec,
  spec: LayoutSpec,
  text: Record<CoverTextRole, string>,
  colors: (typeof PALETTE_COLORS)[CoverPaletteId],
  width: number,
  ceiling: number,
): { entries: FittedEntry[]; stackHeight: number } {
  const maxWidth = group.maxWidth * width;
  const x = group.x * width;
  const entries: FittedEntry[] = [];
  let stackHeight = 0;

  for (const role of group.roles) {
    const roleSpec = spec.roles[role];
    const raw = text[role];
    // An author who has not named themselves gets no empty line — and no gap
    // where that line would have been.
    if (!raw) continue;
    const value = roleSpec.uppercase ? raw.toLocaleUpperCase() : raw;
    const fitted = fitLines(value, roleSpec, width, maxWidth, ceiling);
    const { fontSize } = fitted.metrics;
    const blockHeight =
      fontSize * ASCENT +
      fontSize * roleSpec.lineGap * (fitted.lines.length - 1) +
      fontSize * DESCENT;
    if (entries.length > 0) stackHeight += roleSpec.gapAbove * width;
    stackHeight += blockHeight;
    entries.push({
      spec: roleSpec,
      height: blockHeight,
      block: {
        role,
        fontFamily: roleSpec.family,
        fontSize,
        fontWeight: roleSpec.weight,
        italic: Boolean(roleSpec.italic),
        tracking: fitted.metrics.tracking,
        anchor: group.align,
        color: roleSpec.color === "muted" ? colors.muted : colors.text,
        lines: fitted.lines.map((line) => ({
          text: line,
          x,
          y: 0,
          width: measureCoverText(line, fontSize, fitted.metrics.tracking, roleSpec.weight),
        })),
        top: 0,
        bottom: 0,
        truncated: fitted.truncated,
      },
    });
  }
  return { entries, stackHeight };
}

/** Only the first group is ever backed by a scrim; `minimal` has no scrim. */
function group0Roles(spec: LayoutSpec): ReadonlySet<CoverTextRole> {
  return new Set(spec.groups[0]?.roles ?? []);
}

function textExtent(
  blocks: CoverTextBlock[],
  roles: ReadonlySet<CoverTextRole>,
  width: number,
  height: number,
): { top: number; bottom: number; left: number; right: number } {
  const scoped = blocks.filter((block) => roles.has(block.role));
  if (scoped.length === 0) return { top: 0, bottom: 0, left: 0, right: width };
  let top = height;
  let bottom = 0;
  let left = width;
  let right = 0;
  for (const block of scoped) {
    top = Math.min(top, block.top);
    bottom = Math.max(bottom, block.bottom);
    for (const line of block.lines) {
      const start =
        block.anchor === "middle"
          ? line.x - line.width / 2
          : block.anchor === "end"
            ? line.x - line.width
            : line.x;
      left = Math.min(left, start);
      right = Math.max(right, start + line.width);
    }
  }
  return { top, bottom, left, right };
}

type Extent = ReturnType<typeof textExtent>;

function buildScrim(
  spec: ScrimSpec,
  extent: Extent,
  width: number,
  height: number,
  colors: (typeof PALETTE_COLORS)[CoverPaletteId],
): CoverScrim {
  if (spec.kind === "none") return { kind: "none" };
  if (spec.kind === "band") {
    // The band grows with the title rather than clipping it, and always meets
    // the top edge so it reads as a printed panel, not a floating stripe.
    const bottom = Math.min(height, extent.bottom + spec.padY * width);
    return {
      kind: "band",
      x: 0,
      y: 0,
      width,
      height: bottom,
      color: colors.scrim,
      opacity: spec.opacity,
    };
  }
  if (spec.kind === "plate") {
    const padX = spec.padX * width;
    const padY = spec.padY * width;
    // A one-word title would otherwise get a plate the size of a postage
    // stamp; the plate is a design element, not shrink-wrap.
    const plateWidth = Math.min(
      width,
      Math.max(extent.right - extent.left + padX * 2, spec.minWidth * width),
    );
    const x = clamp((extent.left + extent.right) / 2 - plateWidth / 2, 0, width - plateWidth);
    const y = Math.max(0, extent.top - padY);
    return {
      kind: "plate",
      x,
      y,
      width: plateWidth,
      height: Math.min(height - y, extent.bottom - extent.top + padY * 2),
      color: colors.scrim,
      opacity: spec.opacity,
      border: colors.rule,
    };
  }
  const rise = (extent.bottom - extent.top) * spec.rise;
  const y = Math.max(0, extent.top - rise);
  const span = Math.max(1, height - y);
  return {
    kind: "gradient",
    y,
    height: span,
    color: colors.scrim,
    stops: [
      { offset: 0, opacity: 0 },
      { offset: clamp01(rise / span), opacity: spec.opacity },
      { offset: 1, opacity: Math.min(1, spec.opacity + 0.08) },
    ],
  };
}

function buildRules(
  spec: ScrimSpec,
  extent: Extent,
  width: number,
  colors: (typeof PALETTE_COLORS)[CoverPaletteId],
): CoverRule[] {
  if (spec.kind !== "band" || !spec.rule) return [];
  const inset = width * 0.09;
  const y = extent.bottom + spec.padY * width * 0.45;
  return [{ x1: inset, y1: y, x2: width - inset, y2: y, color: colors.rule }];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

/** Scrim coverage at a y coordinate — how much art shows through behind type. */
export function scrimOpacityAt(scrim: CoverScrim, y: number): number {
  if (scrim.kind === "none") return 0;
  if (scrim.kind === "band" || scrim.kind === "plate") {
    return y >= scrim.y && y <= scrim.y + scrim.height ? scrim.opacity : 0;
  }
  if (y <= scrim.y || scrim.height <= 0) return 0;
  const offset = clamp01((y - scrim.y) / scrim.height);
  let previous = scrim.stops[0]!;
  for (const stop of scrim.stops) {
    if (offset <= stop.offset) {
      const span = stop.offset - previous.offset;
      if (span <= 0) return stop.opacity;
      return (
        previous.opacity + (stop.opacity - previous.opacity) * ((offset - previous.offset) / span)
      );
    }
    previous = stop;
  }
  return previous.opacity;
}

/* ------------------------------------------------------------------- canvas */

/** Portrait-ish art keeps its own proportions; anything else takes a 2:3 crop. */
export function resolveCoverCanvas(art: Uint8Array): { width: number; height: number } {
  const size = readImageSize(art);
  if (!size || size.width < 256 || size.height < 256) return { ...DEFAULT_CANVAS };
  const ratio = size.width / size.height;
  if (ratio > 1 || ratio < 0.5) return { ...DEFAULT_CANVAS };
  const scale = Math.min(1, 2048 / Math.max(size.width, size.height));
  return { width: Math.round(size.width * scale), height: Math.round(size.height * scale) };
}

/** Enough of PNG and JPEG to read a size; anything else is simply unknown. */
export function readImageSize(bytes: Uint8Array): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 24 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1]!;
      // Standalone markers carry no length payload to skip over.
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }
      const length = view.getUint16(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
      }
      if (length < 2) return null;
      offset += 2 + length;
    }
  }
  return null;
}

/* ------------------------------------------------------------------- output */

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * The type layer as a standalone SVG. It is composited over the art, so every
 * pixel outside the scrim and the glyphs stays transparent.
 */
export function coverTypeSvg(plan: CoverTypePlan): string {
  const parts: string[] = [];
  const scrim = plan.scrim;
  if (scrim.kind === "band") {
    parts.push(
      `<rect x="0" y="0" width="${round(scrim.width)}" height="${round(scrim.height)}" fill="${scrim.color}" fill-opacity="${round(scrim.opacity)}"/>`,
    );
  } else if (scrim.kind === "plate") {
    parts.push(
      `<rect x="${round(scrim.x)}" y="${round(scrim.y)}" width="${round(scrim.width)}" height="${round(scrim.height)}" fill="${scrim.color}" fill-opacity="${round(scrim.opacity)}" stroke="${scrim.border}" stroke-opacity="0.5" stroke-width="${round(plan.width * 0.0035)}"/>`,
    );
  } else if (scrim.kind === "gradient") {
    const stops = scrim.stops
      .map(
        (stop) =>
          `<stop offset="${round(stop.offset)}" stop-color="${scrim.color}" stop-opacity="${round(stop.opacity)}"/>`,
      )
      .join("");
    parts.push(
      `<defs><linearGradient id="cover-scrim" x1="0" y1="0" x2="0" y2="1">${stops}</linearGradient></defs>`,
      `<rect x="0" y="${round(scrim.y)}" width="${round(plan.width)}" height="${round(scrim.height)}" fill="url(#cover-scrim)"/>`,
    );
  }

  for (const rule of plan.rules) {
    parts.push(
      `<line x1="${round(rule.x1)}" y1="${round(rule.y1)}" x2="${round(rule.x2)}" y2="${round(rule.y2)}" stroke="${rule.color}" stroke-opacity="0.6" stroke-width="${round(plan.width * 0.0025)}"/>`,
    );
  }

  for (const block of plan.blocks) {
    const halo = plan.halo
      ? ` stroke="${plan.halo.color}" stroke-opacity="0.55" stroke-width="${round(block.fontSize * plan.halo.width)}" stroke-linejoin="round" paint-order="stroke"`
      : "";
    const attrs = [
      `font-family="${escapeXml(block.fontFamily)}"`,
      `font-size="${round(block.fontSize)}"`,
      `font-weight="${block.fontWeight}"`,
      block.italic ? `font-style="italic"` : "",
      block.tracking ? `letter-spacing="${round(block.tracking)}"` : "",
      `fill="${block.color}"`,
      `text-anchor="${block.anchor}"`,
    ]
      .filter(Boolean)
      .join(" ");
    for (const line of block.lines) {
      parts.push(
        `<text x="${round(line.x)}" y="${round(line.y)}" ${attrs}${halo}>${escapeXml(line.text)}</text>`,
      );
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${plan.width}" height="${plan.height}" viewBox="0 0 ${plan.width} ${plan.height}">`,
    ...parts,
    `</svg>`,
  ].join("");
}

/** Plan and render in one step, for callers that only want the layer. */
export function composeCoverTypeLayer(request: CoverTypeRequest): {
  svg: string;
  plan: CoverTypePlan;
} {
  const plan = planCoverType(request);
  return { svg: coverTypeSvg(plan), plan };
}
