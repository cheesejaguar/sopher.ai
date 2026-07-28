/**
 * Word-level diff for suggestion cards: LCS over word tokens, merged into
 * runs of same / deleted / inserted text. Pure and dependency-free.
 */

export type WordDiffOp = { type: "same" | "del" | "ins"; text: string };

/** Beyond this many tokens per side we skip LCS and show a whole-span swap. */
const MAX_TOKENS = 400;

function tokenize(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

function pushOp(ops: WordDiffOp[], type: WordDiffOp["type"], word: string) {
  const last = ops[ops.length - 1];
  if (last && last.type === type) {
    last.text += ` ${word}`;
  } else {
    ops.push({ type, text: word });
  }
}

/**
 * Diff two prose spans at word granularity. Whitespace is normalized to
 * single spaces — suggestion anchors are short spans where this is lossless
 * enough for display purposes.
 */
export function wordDiff(before: string, after: string): WordDiffOp[] {
  const a = tokenize(before);
  const b = tokenize(after);

  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return [{ type: "ins", text: b.join(" ") }];
  if (b.length === 0) return [{ type: "del", text: a.join(" ") }];
  if (a.length > MAX_TOKENS || b.length > MAX_TOKENS) {
    return [
      { type: "del", text: a.join(" ") },
      { type: "ins", text: b.join(" ") },
    ];
  }

  // LCS lengths table.
  const rows = a.length + 1;
  const cols = b.length + 1;
  const table = new Uint16Array(rows * cols);
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      table[i * cols + j] =
        a[i] === b[j]
          ? table[(i + 1) * cols + j + 1] + 1
          : Math.max(table[(i + 1) * cols + j], table[i * cols + j + 1]);
    }
  }

  // Walk the table emitting ops.
  const ops: WordDiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pushOp(ops, "same", a[i]);
      i++;
      j++;
    } else if (table[(i + 1) * cols + j] >= table[i * cols + j + 1]) {
      pushOp(ops, "del", a[i]);
      i++;
    } else {
      pushOp(ops, "ins", b[j]);
      j++;
    }
  }
  while (i < a.length) pushOp(ops, "del", a[i++]);
  while (j < b.length) pushOp(ops, "ins", b[j++]);

  return ops;
}
