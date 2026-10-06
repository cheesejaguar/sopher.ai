import { deflateRawSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import { measureZipUncompressedBytes } from "./zip";

type Entry = {
  name: string;
  data: Uint8Array;
  method?: 0 | 8;
  /** What the central directory claims; defaults to the truth. */
  claimedSize?: number;
};

/** Builds a minimal zip: local headers + data, central directory, EOCD. CRCs are not checked. */
function zip(entries: Entry[]): Uint8Array {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const method = entry.method ?? 8;
    const payload = method === 8 ? deflateRawSync(entry.data) : Buffer.from(entry.data);
    const name = Buffer.from(entry.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(method, 8);
    local.writeUInt32LE(payload.length, 18);
    local.writeUInt32LE(entry.claimedSize ?? entry.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, payload);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(payload.length, 20);
    central.writeUInt32LE(entry.claimedSize ?? entry.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + payload.length;
  }
  const directory = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(directory.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return new Uint8Array(Buffer.concat([...locals, directory, eocd]));
}

describe("measureZipUncompressedBytes", () => {
  it("measures a normal document", () => {
    const xml = new TextEncoder().encode("<w:document>".repeat(1000));
    const result = measureZipUncompressedBytes(
      zip([
        { name: "[Content_Types].xml", data: new TextEncoder().encode("<Types/>"), method: 0 },
        { name: "word/document.xml", data: xml },
      ]),
    );
    expect(result).toEqual({ ok: true, uncompressedBytes: xml.length + 8 });
  });

  it("catches a bomb even when the central directory lies about its size", () => {
    const zeros = new Uint8Array(4 * 1024 * 1024);
    const bomb = zip([{ name: "word/document.xml", data: zeros, claimedSize: 10 }]);
    expect(bomb.length).toBeLessThan(64 * 1024);
    expect(measureZipUncompressedBytes(bomb, 1024 * 1024)).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("counts the running total across entries", () => {
    const chunk = new Uint8Array(600 * 1024);
    const result = measureZipUncompressedBytes(
      zip([
        { name: "a.xml", data: chunk },
        { name: "b.xml", data: chunk },
      ]),
      1024 * 1024,
    );
    expect(result).toEqual({ ok: false, reason: "too_large" });
  });

  it("rejects non-zip bytes and ZIP64 markers as unreadable", () => {
    expect(measureZipUncompressedBytes(new TextEncoder().encode("plain text, not a zip"))).toEqual({
      ok: false,
      reason: "invalid",
    });
    const zip64 = zip([{ name: "a.xml", data: new Uint8Array(10) }]);
    new DataView(zip64.buffer).setUint16(zip64.length - 22 + 10, 0xffff, true);
    expect(measureZipUncompressedBytes(zip64)).toEqual({ ok: false, reason: "invalid" });
  });
});
