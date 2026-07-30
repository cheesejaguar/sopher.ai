import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

type Oklch = { l: number; c: number; h: number };

function token(css: string, name: string): Oklch {
  const root = css.match(/:root\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  const match = root.match(
    new RegExp(`--${name}:\\s*oklch\\(([\\d.]+)\\s+([\\d.]+)\\s+([\\d.]+)\\)`),
  );
  if (!match) throw new Error(`Missing --${name} OKLCH token`);
  return { l: Number(match[1]), c: Number(match[2]), h: Number(match[3]) };
}

function linearRgb({ l: lightness, c, h }: Oklch): [number, number, number] {
  const radians = (h * Math.PI) / 180;
  const a = c * Math.cos(radians);
  const b = c * Math.sin(radians);
  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clamp = (value: number) => Math.min(1, Math.max(0, value));
  return [
    clamp(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    clamp(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    clamp(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function luminance(color: Oklch): number {
  const [red, green, blue] = linearRgb(color);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: Oklch, second: Oklch): number {
  const values = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return ((values[0] ?? 0) + 0.05) / ((values[1] ?? 0) + 0.05);
}

describe("light semantic color contrast", () => {
  it("keeps AI text readable on both soft and instrument surfaces", () => {
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const ai = token(css, "ai");

    expect(contrast(ai, token(css, "ai-soft"))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(ai, token(css, "instrument"))).toBeGreaterThanOrEqual(4.5);
  });
});
