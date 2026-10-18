import { inflateRawSync } from "node:zlib";

/**
 * Zip-bomb guard for .docx imports.
 *
 * A .docx is a zip, and the 4 MB upload cap says nothing about what it
 * expands to: DEFLATE reaches ~1000:1, so one upload can inflate to gigabytes
 * inside mammoth (via JSZip, which only notices a size mismatch *after*
 * inflating). The central directory's declared sizes are attacker-written
 * claims, so this inflates every entry itself with zlib's `maxOutputLength`
 * cap — real bytes, bounded work — and refuses the file once the running
 * total passes the budget. Server-only (node:zlib).
 */

/**
 * Generous for a manuscript: Word XML runs a few hundred bytes of markup per
 * paragraph, so even the 500k-word import ceiling lands well under this, and
 * embedded images (already compressed) count roughly at their upload size.
 */
export const MAX_DOCX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 5_000;

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN_BYTES = 22;
const MAX_COMMENT_BYTES = 0xffff;

export type ZipMeasurement =
  { ok: true; uncompressedBytes: number } | { ok: false; reason: "invalid" | "too_large" };

function findEndOfCentralDirectory(view: DataView): number {
  const last = view.byteLength - EOCD_MIN_BYTES;
  const first = Math.max(0, last - MAX_COMMENT_BYTES);
  for (let offset = last; offset >= first; offset--) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  return -1;
}

export function measureZipUncompressedBytes(
  bytes: Uint8Array,
  maxBytes: number = MAX_DOCX_UNCOMPRESSED_BYTES,
): ZipMeasurement {
  const invalid = { ok: false, reason: "invalid" } as const;
  const tooLarge = { ok: false, reason: "too_large" } as const;
  if (bytes.byteLength < EOCD_MIN_BYTES) return invalid;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  const eocd = findEndOfCentralDirectory(view);
  if (eocd < 0) return invalid;
  const entryCount = view.getUint16(eocd + 10, true);
  const directorySize = view.getUint32(eocd + 12, true);
  const directoryOffset = view.getUint32(eocd + 16, true);
  // ZIP64 markers: no Word document needs them, and they would let the
  // sizes below lie past 4 GB.
  if (entryCount === 0xffff || directorySize === 0xffffffff || directoryOffset === 0xffffffff) {
    return invalid;
  }
  if (entryCount > MAX_ZIP_ENTRIES) return tooLarge;
  if (directoryOffset + directorySize > eocd) return invalid;

  let total = 0;
  let cursor = directoryOffset;
  for (let entry = 0; entry < entryCount; entry++) {
    if (cursor + 46 > eocd || view.getUint32(cursor, true) !== CENTRAL_SIGNATURE) return invalid;
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    cursor += 46 + nameLength + extraLength + commentLength;

    if (localOffset + 30 > bytes.byteLength) return invalid;
    if (view.getUint32(localOffset, true) !== LOCAL_SIGNATURE) return invalid;
    const dataStart =
      localOffset +
      30 +
      view.getUint16(localOffset + 26, true) +
      view.getUint16(localOffset + 28, true);
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > bytes.byteLength) return invalid;

    const remaining = maxBytes - total;
    if (method === 0) {
      total += compressedSize;
    } else if (method === 8) {
      try {
        // One byte over the budget is enough to prove "too large" without
        // inflating any further.
        total += inflateRawSync(bytes.subarray(dataStart, dataEnd), {
          maxOutputLength: Math.max(1, remaining + 1),
        }).byteLength;
      } catch (error) {
        if (error instanceof RangeError) return tooLarge;
        return invalid;
      }
    } else {
      return invalid;
    }
    if (total > maxBytes) return tooLarge;
  }
  return { ok: true, uncompressedBytes: total };
}
