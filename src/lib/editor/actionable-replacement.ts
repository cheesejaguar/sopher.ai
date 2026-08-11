/**
 * Canonicalize only text encodings that cannot represent an intentional prose
 * change. Whitespace otherwise stays byte-for-byte significant: a paragraph
 * break, indentation change, or deliberate space edit can be the whole point
 * of a replacement.
 */
function canonicalReplacementText(value: string): string {
  return value.normalize("NFC").replace(/\r\n?/g, "\n");
}

/** True when applying `replacement` would actually change the anchored prose. */
export function isActionableReplacement(original: string, replacement: string): boolean {
  return canonicalReplacementText(original) !== canonicalReplacementText(replacement);
}
