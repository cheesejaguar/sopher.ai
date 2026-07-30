import { MODEL_PRICING } from "@/lib/billing/pricing";
import type { EntityKind } from "@/ai/schemas/entities";

/**
 * Entity portraits are opt-in per entity, never automatic.
 *
 * The image model bills a flat rate per image, so a book with 15–40 entities
 * would add $1.00–$2.70 to a standard-tier book costing roughly $4.70 — a
 * 20–55% increase for what is decoration. Generating them on demand keeps that
 * a choice the author makes with the price in front of them.
 */

export const PORTRAIT_USD = MODEL_PRICING["google/gemini-3.1-flash-image"]?.perImageUsd ?? 0.067;

/**
 * Kinds worth illustrating. An "organization" or "event" portrait is rarely
 * more than an abstract smear, so those are excluded.
 */
export const PORTRAIT_KINDS: EntityKind[] = ["character", "location", "object"];

/** One shared style so a book's portraits read as a set rather than a jumble. */
const HOUSE_STYLE =
  "atmospheric literary book illustration, painterly, muted palette, soft directional light, no text, no lettering, no watermark";

/**
 * Builds the image prompt from the entity's structured attributes rather than
 * from prose — the bible already holds exactly the concrete visual facts an
 * image model needs.
 */
export function portraitPrompt(input: {
  kind: EntityKind;
  name: string;
  attrs: Record<string, unknown>;
  genre?: string | null;
}): string {
  const attr = (key: string): string | null => {
    const value = input.attrs[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };
  const list = (key: string): string[] =>
    Array.isArray(input.attrs[key])
      ? (input.attrs[key] as unknown[]).filter((v): v is string => typeof v === "string")
      : [];

  const parts: string[] = [];

  if (input.kind === "character") {
    parts.push(
      `Three-quarter literary character study of ${input.name}, showing face, posture, build, clothing, and recurring accessories.`,
    );
    const appearance = attr("appearance");
    const heritage = attr("heritage");
    const age = attr("age");
    const occupation = attr("occupation");
    const visualCanon = [
      ["Apparent age", age],
      ["Build and movement", attr("build")],
      ["Face", attr("face")],
      ["Hair", attr("hair")],
      ["Eyes", attr("eyes")],
      ["Complexion", attr("complexion")],
      ["Wardrobe and accessories", attr("wardrobe")],
      ["Posture", attr("posture")],
    ]
      .filter((entry): entry is [string, string] => Boolean(entry[1]))
      .map(([label, value]) => `${label}: ${value}.`);
    const distinguishingFeatures = list("distinguishingFeatures").slice(0, 8);

    if (appearance) parts.push(`Overall appearance: ${appearance}.`);
    if (visualCanon.length) parts.push(`Visual canon: ${visualCanon.join(" ")}`);
    if (distinguishingFeatures.length) {
      parts.push(`Distinguishing features: ${distinguishingFeatures.join(", ")}.`);
    }
    if (heritage) parts.push(`Cultural context: ${heritage}.`);
    if (occupation) parts.push(`Occupation context: ${occupation}.`);
  } else if (input.kind === "location") {
    parts.push(`Establishing view of ${input.name}.`);
    const description = attr("description");
    const type = attr("locationType");
    const atmosphere = attr("atmosphere");
    const features = list("features").slice(0, 5);
    if (type) parts.push(`A ${type}.`);
    if (description) parts.push(description);
    if (features.length) parts.push(`Notable features: ${features.join(", ")}.`);
    if (atmosphere) parts.push(`Atmosphere: ${atmosphere}.`);
  } else {
    parts.push(`Still life study of ${input.name}, a single object, centred.`);
    const description = attr("description");
    const provenance = attr("provenance");
    if (description) parts.push(description);
    if (provenance) parts.push(`Origin: ${provenance}.`);
  }

  if (input.genre) parts.push(`Genre: ${input.genre}.`);
  parts.push(HOUSE_STYLE);

  return parts.join(" ");
}
