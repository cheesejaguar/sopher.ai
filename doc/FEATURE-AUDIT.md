# Feature audit — gaps to "fully fledged book authoring tool for the average person"

Audited 2026-08-03 against `origin/main` (`a65196e`), not the local working tree,
which is 45 commits behind. Every claim below cites the file that establishes it.

## What already exists (so the gaps below are credible)

The product is far past MVP. Setup wizard (genre → brief → shape → estimate),
durable five-stage workflow with outline approval and creative-decision pause,
Story Bible with author-editable canon and portraits, a real TipTap editor with
autosave/conflict handling/undo/history/suggestions/content tools, manuscript
reader, four export formats, immutable reader share links, book front/back
matter, credit ledger with per-run metering, admin console, trial short story,
and a public site with genre libraries and guides. Accessibility and reliability
work is unusually thorough.

The gaps are therefore not "build the product." They are the specific places
where a person who has never written a book gets stuck, gets an amateur-looking
result, or cannot finish the job they came to do.

---

## P0 — Blocks the core promise for the target user

### 1. The genre catalog does not cover the books the homepage sells

**Missing:** children's / middle-grade, memoir & narrative non-fiction, young
adult, historical fiction, and any "other / describe it yourself" escape hatch.

**Evidence:** `GENRE_IDS` is seven adult fiction genres — romance, mystery,
fantasy, thriller, literary fiction, science fiction, horror
(`src/ai/knowledge/genres.ts:969`). The wizard's genre step renders exactly that
list with no free-text option (`src/components/wizard/step-genre.tsx:20`).
Meanwhile the homepage leads with *"a bedtime adventure, a hometown mystery, a
family memory"* (`src/components/marketing/hero.tsx:32`) and its three flagship
sample briefs are a children's bedtime story, a mystery, and a family memoir
(`src/components/marketing/brief-demo.tsx:12,23,29`).

**Why it matters:** two of the three books the landing page uses to sell the
product cannot be selected in the product. The average person's first book is
overwhelmingly a memoir, a kids' book for their own child, or a how-to — not a
thriller. A visitor who is sold by "Biscuit Saves Trash Day" and clicks *Start
your book* lands on a genre picker with no children's option.

**Effort:** medium. A genre is a `GenreTemplate`, but children's needs shorter
chapters than the 800-word floor comfortably implies and memoir/non-fiction
breaks assumptions in the outline agent (plot arcs) and entity bible (fictional
characters). Treat non-fiction as its own pipeline variant, not a template.
**Risk:** medium. **Impact:** highest in this document — it is a conversion leak
at the top of the funnel.

*Cheap partial fix worth doing immediately:* add "Other — tell us what you're
writing" as a genre option that accepts free text. `createProjectSchema` already
accepts any genre string up to 60 chars (`src/lib/validation/project.ts`), so the
back end does not need to change to stop turning these authors away.

### 2. No way to bring in an existing draft

**Missing:** import of a manuscript, chapters, notes, or an outline from
DOCX / Markdown / plain text / Google Docs.

**Evidence:** no import route anywhere under `src/app/api`; no DOCX-parsing
dependency in the tree. Every project must originate from a brief.

**Why it matters:** a large share of "average people who want to write a book"
already have something — 30 abandoned pages, a folder of notes, a NaNoWriMo
draft. Today the product has nothing to say to them. It also unlocks a second
wedge — *"fix the book I already wrote"* — using machinery that already exists
(editor, continuity review, whole-manuscript direction pass, exports) with no new
AI pipeline. Export is a one-way door right now.

**Effort:** medium. **Risk:** low–medium (chapter splitting heuristics, size
limits). **Impact:** high.

### 3. Cover generation produces art, not a cover

**Missing:** title and author typography composited onto the generated image.

**Evidence:** the cover prompt explicitly ends with *"No text, no lettering, no
watermark, no borders"* and asks for *"space at the top third where a title would
sit"* — then nothing ever puts a title there
(`src/app/api/projects/[projectId]/cover/route.ts:52`).

**Why it matters:** a novice cannot open Photoshop. The gap between "a nice
illustration" and "my book cover" is one typographic layer, and it is the single
most shareable artifact the product makes. The data is already on hand: title on
`books`, author in `bookMatter.author` (`src/lib/book-package.ts`).

**Effort:** low–medium — server-side SVG or canvas overlay with three or four
layout presets and a font pair per genre. **Risk:** low. **Impact:** high and
highly visible. Best impact-per-day item in P0.

### 4. No final proofread pass — the plumbing exists and is unused

**Missing:** a line-level copyedit/proofread producer.

**Evidence:** `suggestions.pass_type` includes `"proofread"`
(`src/db/schema.ts:841`) and `SuggestionPassType` declares it
(`src/lib/editor/types.ts:9`), but a repo-wide grep finds **zero** code that ever
writes a proofread suggestion. Only `selection` and `review` are produced
(`src/app/api/chapters/[chapterId]/review/route.ts:211`).

**Why it matters:** the editorial pass works on craft — pacing, voice, tension.
Nothing does typos, comma splices, dialogue punctuation, tense slips, or repeated
words. Those are exactly what makes a manuscript read amateur, and exactly what a
first-time author cannot catch alone.

**Effort:** **low** — the anchored-suggestion storage, accept/reject UI, metering,
and idempotency all already work. This is a prompt, a producer, and a button.
**Risk:** low. **Impact:** high. *Best effort-to-impact ratio in the entire
audit — do this first.*

### 5. The book ends at "export," not at "published"

**Missing:** print-ready output and the publishing kit — trim-size PDF, back-cover
blurb, book description, categories/keywords, author bio.

**Evidence:** PDF export uses one fixed page size with uniform margins on all four
sides (`src/lib/export/pdf.ts:37-38`) — no 6×9 trim, no mirrored gutter for the
binding edge, no bleed, no embedded fonts (it relies on WinAnsi standard fonts and
substitutes glyphs, `src/lib/export/pdf.ts:15`). There is no blurb, description,
keyword, or bio generation anywhere.

**Why it matters:** "fully fledged" for this user means *and then I can actually
publish it*. Upload that PDF to KDP today and it is rejected or prints wrong. The
blurb and category fields are free wins — they are one small LLM call each off
data you already store, and they are the part of self-publishing novices find
hardest.

**Effort:** medium for print PDF, low for the copy kit. **Risk:** low.
**Impact:** high — it completes the job the product started.

---

## P1 — Large impact, real work

### 6. No audiobook or read-aloud

No TTS anywhere in the tree. For children's books it is the point of the book; for
everyone else it is both an accessibility feature and a natural per-credit upsell
against an asset (the finished manuscript) you already have. Chapter text is
already clean Markdown. **Effort:** medium. **Impact:** high.

### 7. No series or multi-book support

No series concept in the schema; `entities`, `outlines`, and continuity are all
keyed to a single `book_id` (`src/db/schema.ts:337,267`). A hobbyist who finishes
one book and loved it has no path to book two that carries the cast, world, and
voice forward — so the highest-intent repeat customer starts from zero.
**Effort:** medium–high. **Impact:** high on retention and LTV.

### 8. English only

`ProjectSettings` and `projectSettingsSchema` have no `language` field
(`src/db/schema.ts`, `src/lib/validation/project.ts`). Nothing in the prompt
layer selects an output language. One settings field plus prompt plumbing opens a
large market for a product whose value proposition ("I can't write, but I have a
story") is, if anything, stronger outside English. **Effort:** low–medium.
**Risk:** medium (quality validation per language). **Impact:** high.

### 9. Reader shares are one-way — no feedback loop

`readerShares` produces an immutable, revocable browser edition
(`src/lib/publication-editions.ts`), which is genuinely good. But a beta reader
cannot leave a reaction, a margin note, or a "this chapter dragged." Reader
feedback is what actually improves a first book, and a comment thread is the
mechanism by which the author's friends discover the product. **Effort:** medium.
**Impact:** high (product loop + organic acquisition).

### 10. No author-controlled drafts or book-level comparison

Chapter-level revisions and restore exist (`src/lib/actions/chapters.ts:349,377`).
Missing: named snapshots the author creates on purpose ("before I took the
editor's advice"), and any way to see what changed across the whole book between
two points. After a whole-manuscript direction pass, the author has no way to
review the aggregate effect. **Effort:** medium. **Impact:** medium–high — it is
what makes an inexperienced author brave enough to accept big changes.

---

## P2 — Low-hanging fruit: small-to-moderate impact, low risk, fast

These are individually modest and collectively make the product feel finished.

| # | Gap | Evidence | Note |
|---|-----|----------|------|
| 11 | **Book-wide find & replace** | find/replace is explicitly *"Chapter-scoped"* (`src/components/editor/find-replace.tsx:12`) | Renaming a character across 40 chapters is the most common mechanical need in book editing. Deterministic, free, no LLM. The whole-manuscript direction pass can do it, but it costs credits and is non-deterministic — wrong tool. |
| 12 | **Manuscript-wide search** | same component; chapters have an FTS index on `summary` only, not `content` (`src/db/schema.ts:163`) | "Where did I mention the lighthouse?" Add a GIN index on content and a search sheet. |
| 13 | **Word-count goals and progress** | `chapters.word_count` already stored (`src/db/schema.ts:151`) | Target vs actual, estimated page count, estimated reading time. Pure UI over existing data; strong motivational value for a first-time author. |
| 14 | **Split and merge chapters** | menu has rename / move / insert / regenerate / delete (`src/components/editor/chapter-menu.tsx:94-122`) | The two missing structural edits. Pure text operations, no AI. |
| 15 | **Export one chapter or a selection** | export is whole-book only (`src/app/api/projects/[projectId]/export/route.ts`) | "Send chapter one to my sister." Reuses the assembler. |
| 16 | **Plain-English suggestion explanations** | rubric uses craft vocabulary (`src/ai/prompts/review-rubric.ts`) | A novice does not know what "POV drift" or "beat" means. A glossary tooltip layer over existing suggestion types — no model changes. |
| 17 | **One-click drafts for dedication, acknowledgments, about-the-author** | fields exist in `bookMatter` (`src/lib/book-package.ts`) but present the author an empty box | Small LLM call from data already stored. |
| 18 | **Trim-size / mirrored-margin PDF preset** | `src/lib/export/pdf.ts:37-38` | The cheap slice of #5; worth shipping alone. |
| 19 | **Duplicate a project / start from an existing book's settings** | no duplicate action in `src/lib/actions/projects.ts` | Cheapest possible stand-in for series support (#7). |
| 20 | **Let a visitor generate one real chapter from *their own* brief before signing up** | trial requires a verified account (README, `src/lib/trial-story.ts`) | The homepage shows canned excerpts. Seeing *your own* idea come back as prose is a far stronger conversion event than reading someone else's. Gate on cost, not on account. |
| 21 | **Reading-order preview of front/back matter** | `bookMatterPageCount` exists (`src/lib/book-package.ts`) but there is no visual | Novices do not know what a half-title or copyright page is. Show the assembled book front-to-back. |

---

## P3 — Bigger bets, later

22. **A real non-fiction pipeline** — research and source handling, citations, no
    character bible, structure by argument rather than plot. The natural
    follow-through of #1 and the largest untapped audience.
23. **Illustrated children's book pipeline** — per-page images with a character
    that stays visually consistent across them. The image tooling
    (`src/ai/content-tools/image.ts`, entity portraits) is a real head start.
24. **Collaboration / co-author seats** — two people on one book; today ownership
    is strictly single-user (`projects.user_id`).
25. **Marketing kit** — social cards, query letter, agent synopsis, launch
    checklist. Extends #5 past the book itself.
26. **Sensitivity and content read** — distinct from the AUP moderation that
    already exists (`src/lib/moderation.ts`), which is a safety gate, not authorial
    feedback.
27. **"Write like me"** — style extraction from a sample of the author's own
    writing, feeding `styleProfile`. Strong differentiator; depends on #2 (import).
28. **Mobile drafting / offline** — the editor is responsive, but there is no
    offline or app-native capture for ideas away from a desk.

---

## Suggested sequence

**Ship first (days, not weeks):** #4 proofread pass, #3 cover typography,
#11 book-wide find & replace, #1's free-text genre escape hatch, #13 word-count
goals.

**Then (the quarter):** #1 genre coverage properly, #5 publishing kit + print PDF,
#2 manuscript import.

**Then:** #6 audiobook, #9 reader feedback, #7 series.

---

## Appendix — two repository findings, not features

1. **The local working tree is 45 commits behind `origin/main`** (`e240c83` vs
   `a65196e`). Anything audited or built from the local checkout will be against a
   stale product.
2. **56 orphaned filesystem-sync duplicate files** (`* 2.ts`, `* 2.tsx`) sit
   untracked under `src/`, `e2e/`, and `tests/` — copies of work that did land on
   `origin/main` via PR #154. `.gitignore:60` already ignores the pattern and CI
   enforces it, so they are inert, but they make local greps and file listings
   misleading. Safe to delete.
