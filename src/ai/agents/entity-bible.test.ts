import { describe, expect, it, vi } from "vitest";

import type { BookConcept, BookOutline } from "@/ai/schemas";

const mocks = vi.hoisted(() => ({
  outputs: [] as unknown[],
  calls: [] as { schema: unknown }[],
}));

vi.mock("ai", () => ({
  generateText: vi.fn(async (options: { output?: { schema?: unknown } }) => {
    mocks.calls.push({ schema: options.output?.schema });
    if (mocks.outputs.length === 0) throw new Error("No mocked bible output remains");
    return { output: mocks.outputs.shift() };
  }),
  Output: { object: vi.fn(({ schema }: { schema: unknown }) => ({ schema })) },
}));

vi.mock("@/ai/metering", () => ({
  gatewayOptions: vi.fn(() => ({})),
  metered: vi.fn(
    async (_meter: unknown, _info: unknown, run: () => Promise<unknown>) => await run(),
  ),
}));

import { bibleSchema, bibleWireSchema, generateEntityBible, normalizeBible } from "./entity-bible";

/**
 * Every payload below is an answer the model plausibly gives to the story-bible
 * prompt. Anthropic's structured-output path strips `.min` / `.max` / `.length`
 * and does not enforce `z.enum`, so the model never sees the caps `bibleSchema`
 * holds it to. Each case therefore asserts twice: that the strict schema — the
 * schema this call used to hand the provider — rejects the payload outright,
 * and that the wire schema plus `normalizeBible` land it on the domain shape.
 *
 * This call runs before any chapter exists and sits outside the workflow's
 * degradation boundary, so every rejection below used to kill the whole run.
 */

const characterAttrsFixture = {
  role: "protagonist",
  background: "Raised on the salt docks after the flood took her mother.",
  occupation: "Ledger-keeper for the harbour authority",
  appearance: "Weather-worn and quick-eyed",
  build: "A head taller than everyone in the room",
  face: "Square jaw under the family's heavy black brows",
  hair: "Black, cropped at the jaw",
  eyes: "Storm-gray, always moving",
  complexion: "Sun-darkened",
  distinguishingFeatures: ["A rope burn across the left palm"],
  wardrobe: "Oiled canvas coat over a ledger satchel",
  posture: "Stands square, weight on the back foot",
  heritage: "Harbour-born, of Verran stock",
  age: "Twenty-nine",
  speech: "Clipped, numerate, allergic to flourish",
  personality: ["Exacting", "Unsentimental"],
  mannerisms: ["Taps a tally against her thigh"],
  goals: ["Balance her father's last ledger"],
  fears: ["Owing anyone anything"],
  secrets: ["She forged the final entry herself"],
  arc: "Learns that a debt can be forgiven rather than paid",
  nameRationale: "Verran harbour naming; carries her father's surname",
  facts: [],
};

const locationAttrsFixture = {
  locationType: "Harbour counting house",
  description: "Three storeys of tarred timber over the tide line",
  features: ["A brass tide-gauge bolted to the seaward wall"],
  contents: ["The salt ledger", "A wall of numbered pigeonholes"],
  atmosphere: "Cold, papery, and always faintly of brine",
  owner: "Mira Verran",
  facts: [],
};

const character = (name: string) => ({
  kind: "character",
  name,
  aliases: [],
  attrs: characterAttrsFixture,
});

const wellFormed = {
  entities: [
    character("Mira Verran"),
    { kind: "location", name: "The Salt Ledger", aliases: [], attrs: locationAttrsFixture },
  ],
  relationships: [
    {
      from: "Mira Verran",
      to: "The Salt Ledger",
      type: "owns",
      description: "Her father's post, inherited with its unbalanced books.",
    },
  ],
};

const concept: BookConcept = {
  title: "The Salt Ledger",
  logline: "A harbour clerk inherits a debt she cannot pay.",
  synopsis: "She balances the books or the harbour takes the house.",
  themes: ["Debt", "Inheritance"],
  setting: "A tidal harbour town",
  centralConflict: "The ledger does not balance and the tide is rising.",
  uniqueElements: ["Tide-keyed accounting"],
  characters: [
    {
      name: "Mira Verran",
      role: "protagonist",
      description: "Ledger-keeper for the harbour authority.",
      arc: "Learns a debt can be forgiven.",
    },
  ],
  moderation: { flagged: false },
};

const outline: BookOutline = {
  title: "The Salt Ledger",
  logline: "A harbour clerk inherits a debt she cannot pay.",
  synopsis: "She balances the books or the harbour takes the house.",
  themes: ["Debt"],
  plotStructure: "three-act",
  chapters: [
    {
      number: 1,
      title: "Low Water",
      summary: "Mira reaches the counting house.",
      keyEvents: ["The ledger is opened"],
      charactersPresent: ["Mira Verran"],
      emotionalArc: "exposition",
      openingHook: "The tide-gauge reads wrong.",
      closingHook: "The last entry is in her own hand.",
      targetWords: 2_400,
    },
  ],
};

const bibleInput: Parameters<typeof generateEntityBible>[0] = {
  meter: { userId: "user_1", projectId: "proj_1", runId: "run_1" },
  bookId: "book_1",
  tier: "standard",
  concept,
  outline,
};

async function generated(modelOutput: unknown) {
  mocks.calls.length = 0;
  mocks.outputs.length = 0;
  mocks.outputs.push(modelOutput);
  return await generateEntityBible(bibleInput);
}

/** Proof the case is a regression: this is what the call used to send. */
function strictlyRejected(payload: unknown) {
  expect(bibleSchema.safeParse(payload).success).toBe(false);
  return payload;
}

describe("bibleWireSchema", () => {
  it("accepts the well-formed bible the strict schema accepts", () => {
    expect(bibleSchema.safeParse(wellFormed).success).toBe(true);
    expect(bibleWireSchema.safeParse(wellFormed).success).toBe(true);
  });

  it("accepts a bible missing every optional field, which the strict schema rejects", () => {
    const sparse = { entities: [{ kind: "character", name: "Mira Verran" }] };
    strictlyRejected(sparse);
    expect(bibleWireSchema.safeParse(sparse).success).toBe(true);
  });

  it("accepts a kind and a relationship type outside the enums", () => {
    const offEnum = {
      entities: [{ kind: "creature", name: "The Tidewatcher", attrs: { description: "Vast." } }],
      relationships: [
        { from: "The Tidewatcher", to: "Mira Verran", type: "grandparent", description: "Old." },
      ],
    };
    strictlyRejected(offEnum);
    expect(bibleWireSchema.safeParse(offEnum).success).toBe(true);
  });
});

describe("normalizeBible", () => {
  it("keeps a well-formed bible intact", () => {
    const bible = normalizeBible(wellFormed);
    expect(bible.entities.map((e) => e.name)).toEqual(["Mira Verran", "The Salt Ledger"]);
    expect(bible.entities[0].kind).toBe("character");
    expect(bible.entities[0].attrs?.eyes).toBe("Storm-gray, always moving");
    expect(bible.relationships).toEqual([
      {
        from: "Mira Verran",
        to: "The Salt Ledger",
        type: "owns",
        description: "Her father's post, inherited with its unbalanced books.",
      },
    ]);
  });

  it("drops an entity with no usable name rather than inventing one", () => {
    const payload = strictlyRejected({
      entities: [
        character("Mira Verran"),
        { kind: "character", name: "   ", attrs: characterAttrsFixture },
        { kind: "location", name: null, attrs: locationAttrsFixture },
        { kind: "object", attrs: { description: "A brass tide-gauge." } },
      ],
    });
    const bible = normalizeBible(payload);
    expect(bible.entities).toHaveLength(1);
    expect(bible.entities[0].name).toBe("Mira Verran");
    // Nothing stood in for the missing names.
    expect(bible.entities.map((e) => e.name)).not.toContain("");
    expect(bible.entities.map((e) => e.name)).not.toContain("unknown");
  });

  it("drops a relationship whose endpoints do not both survive", () => {
    const payload = strictlyRejected({
      entities: [character("Mira Verran"), { kind: "character", name: "", attrs: {} }],
      relationships: [
        // The sister never arrived with a usable name, so this links nothing.
        { from: "Mira Verran", to: "Coran Verran", type: "sibling", description: "Estranged." },
        { from: "Nobody", to: "Mira Verran", type: "rival", description: "Unknown." },
        { from: "Mira Verran", to: null, type: "owns", description: "Missing end." },
      ],
    });
    expect(normalizeBible(payload).relationships).toEqual([]);
  });

  it("keeps a relationship once both endpoints survive", () => {
    const bible = normalizeBible({
      entities: [character("Mira Verran"), character("Coran Verran")],
      relationships: [
        { from: "Mira Verran", to: "Coran Verran", type: "sibling", description: "Estranged." },
      ],
    });
    expect(bible.relationships).toHaveLength(1);
  });

  it("resolves endpoints through aliases and repairs case drift", () => {
    const bible = normalizeBible({
      entities: [
        { ...character("Mira Verran"), aliases: ["The Ledger-Keeper"] },
        { kind: "location", name: "The Salt Ledger", attrs: locationAttrsFixture },
      ],
      relationships: [
        {
          from: "the ledger-keeper",
          to: "the salt ledger",
          type: "owns",
          description: "Inherited with its unbalanced books.",
        },
      ],
    });
    expect(bible.relationships[0].from).toBe("Mira Verran");
    expect(bible.relationships[0].to).toBe("The Salt Ledger");
  });

  it("drops a relationship that loops back to the same entity", () => {
    const bible = normalizeBible({
      entities: [{ ...character("Mira Verran"), aliases: ["Mira"] }],
      relationships: [
        { from: "Mira", to: "Mira Verran", type: "rival", description: "Her own worst creditor." },
      ],
    });
    expect(bible.relationships).toEqual([]);
  });

  it("files an unrecognized kind whose attributes name no kind under the least-committal one", () => {
    const payload = strictlyRejected({
      entities: [
        // `description` belongs to both location and object, so it points nowhere.
        { kind: "creature", name: "The Tidewatcher", attrs: { description: "Vast and patient." } },
        // `facts` belongs to every kind, so it is evidence of none of them.
        { kind: "presence", name: "The Undertow", attrs: { facts: ["It takes what it is owed."] } },
      ],
    });
    const bible = normalizeBible(payload);
    expect(bible.entities.map((e) => e.kind)).toEqual(["object", "object"]);
    // The claim it does make survives; "object" is a slot, not a description.
    expect(bible.entities[0].attrs?.description).toBe("Vast and patient.");
    expect(bible.entities[1].attrs?.facts).toEqual(["It takes what it is owed."]);
  });

  it("infers the kind from the attribute group the model actually answered", () => {
    const payload = strictlyRejected({
      entities: [
        { kind: "protagonist", name: "Coran Verran", attrs: characterAttrsFixture },
        { kind: "setting", name: "The Salt Ledger", attrs: locationAttrsFixture },
        {
          kind: "faction",
          name: "The Harbour Authority",
          attrs: { purpose: "Collects the tide tolls.", structure: "A board of five wardens." },
        },
        {
          kind: "incident",
          name: "The Spring Audit",
          attrs: { when: "The equinox after the flood", outcome: "The books are sealed." },
        },
      ],
    });
    expect(normalizeBible(payload).entities.map((e) => e.kind)).toEqual([
      "character",
      "location",
      "organization",
      "event",
    ]);
  });

  it("keeps the whole profile of a character the model labelled with an off-enum kind", () => {
    // Nobody by this name is in the concept cast, so the profile itself is the
    // only evidence of what it is — and filing it as an object would drop every
    // character field with the label.
    const payload = strictlyRejected({
      entities: [{ kind: "protagonist", name: "Coran Verran", attrs: characterAttrsFixture }],
    });
    const attrs = normalizeBible(payload).entities[0].attrs ?? {};
    expect(attrs.eyes).toBe("Storm-gray, always moving");
    expect(attrs.heritage).toBe("Harbour-born, of Verran stock");
    expect(attrs.goals).toEqual(["Balance her father's last ledger"]);
  });

  it("is not pulled off a character profile by one stray attribute of another kind", () => {
    const payload = strictlyRejected({
      entities: [
        {
          kind: "protagonist",
          name: "Coran Verran",
          attrs: { ...characterAttrsFixture, owner: "The harbour authority" },
        },
      ],
    });
    expect(normalizeBible(payload).entities[0].kind).toBe("character");
  });

  it("prefers the concept cast over the attribute shape for an off-enum kind", () => {
    const bible = normalizeBible(
      { entities: [{ kind: "resident", name: "Mira Verran", attrs: locationAttrsFixture }] },
      { characterNames: ["Mira Verran"] },
    );
    // The author named her. A bag of location attributes is not evidence against
    // that, and filing her anywhere but "character" trips the completeness gate.
    expect(bible.entities[0].kind).toBe("character");
  });

  it("still drops an unnamed entity, and its relationships, however rich its profile", () => {
    const payload = strictlyRejected({
      entities: [
        character("Mira Verran"),
        // A complete profile is not a name, and the bible is keyed by name.
        { kind: "protagonist", name: "   ", attrs: characterAttrsFixture },
      ],
      relationships: [
        { from: "Mira Verran", to: "Coran Verran", type: "sibling", description: "Estranged." },
      ],
    });
    const bible = normalizeBible(payload);
    expect(bible.entities.map((e) => e.name)).toEqual(["Mira Verran"]);
    expect(bible.relationships).toEqual([]);
  });

  it("still recognizes a valid kind rather than falling back", () => {
    const bible = normalizeBible({
      entities: [
        { kind: "Location", name: "The Salt Ledger", attrs: locationAttrsFixture },
        { kind: " event ", name: "The Spring Audit", attrs: { when: "Equinox" } },
      ],
    });
    expect(bible.entities.map((e) => e.kind)).toEqual(["location", "event"]);
  });

  it("reads an unrecognized kind on a concept cast member as a character", () => {
    const payload = strictlyRejected({
      entities: [{ kind: "protagonist", name: "Mira Verran", attrs: characterAttrsFixture }],
    });
    const bible = normalizeBible(payload, { characterNames: ["Mira Verran"] });
    expect(bible.entities[0].kind).toBe("character");
  });

  it("does not read an unrecognized kind as a character for a name the cast never had", () => {
    const bible = normalizeBible(
      { entities: [{ kind: "creature", name: "The Tidewatcher", attrs: {} }] },
      { characterNames: ["Mira Verran"] },
    );
    expect(bible.entities[0].kind).toBe("object");
  });

  it("caps entities at 60 and drops the relationships that pointed past the cap", () => {
    const payload = strictlyRejected({
      entities: Array.from({ length: 61 }, (_, index) => character(`Extra ${index + 1}`)),
      relationships: [
        { from: "Extra 1", to: "Extra 61", type: "sibling", description: "Beyond the cap." },
        { from: "Extra 1", to: "Extra 2", type: "sibling", description: "Within the cap." },
      ],
    });
    const bible = normalizeBible(payload);
    expect(bible.entities).toHaveLength(60);
    expect(bible.relationships).toHaveLength(1);
    expect(bible.relationships[0].to).toBe("Extra 2");
  });

  it("caps relationships at 60", () => {
    const payload = strictlyRejected({
      entities: [character("Mira Verran"), character("Coran Verran")],
      relationships: Array.from({ length: 61 }, (_, index) => ({
        from: "Mira Verran",
        to: "Coran Verran",
        type: "sibling",
        description: `Tie ${index + 1}`,
      })),
    });
    expect(normalizeBible(payload).relationships).toHaveLength(60);
  });

  it("truncates a relationship description past the 300-character cap", () => {
    const payload = strictlyRejected({
      entities: [character("Mira Verran"), character("Coran Verran")],
      relationships: [
        {
          from: "Mira Verran",
          to: "Coran Verran",
          type: "sibling",
          description: "They have not spoken since the flood. ".repeat(20),
        },
      ],
    });
    const bible = normalizeBible(payload);
    expect(bible.relationships[0].description.length).toBeLessThanOrEqual(300);
    expect(bible.relationships[0].description.startsWith("They have not spoken")).toBe(true);
  });

  it("maps an unrecognized relationship type onto the least-committal type", () => {
    const payload = strictlyRejected({
      entities: [character("Mira Verran"), character("Coran Verran")],
      relationships: [
        { from: "Mira Verran", to: "Coran Verran", type: "half-sister", description: "Estranged." },
      ],
    });
    expect(normalizeBible(payload).relationships[0].type).toBe("other");
  });

  it("keeps a tie whose description the model omitted instead of losing the canon", () => {
    const payload = strictlyRejected({
      entities: [character("Mira Verran"), character("Coran Verran")],
      relationships: [{ from: "Mira Verran", to: "Coran Verran", type: "sibling" }],
    });
    const bible = normalizeBible(payload);
    expect(bible.relationships).toHaveLength(1);
    expect(bible.relationships[0]).toMatchObject({ type: "sibling", description: "" });
  });

  it("caps attribute lists and salvages the entries around an unusable one", () => {
    const payload = strictlyRejected({
      entities: [
        {
          kind: "character",
          name: "Mira Verran",
          attrs: {
            ...characterAttrsFixture,
            personality: Array.from({ length: 9 }, (_, index) => `Trait ${index + 1}`),
            goals: ["Balance the ledger", null, "Keep the house", 7],
          },
        },
      ],
    });
    const bible = normalizeBible(payload);
    expect(bible.entities[0].attrs?.personality).toHaveLength(8);
    expect(bible.entities[0].attrs?.goals).toEqual(["Balance the ledger", "Keep the house"]);
  });

  it("caps aliases at 8", () => {
    const payload = strictlyRejected({
      entities: [
        {
          ...character("Mira Verran"),
          aliases: Array.from({ length: 9 }, (_, index) => `Alias ${index + 1}`),
        },
      ],
    });
    expect(normalizeBible(payload).entities[0].aliases).toHaveLength(8);
  });

  it("keeps only the attributes that belong to the kind, and drops blank ones", () => {
    const bible = normalizeBible({
      entities: [
        {
          kind: "character",
          name: "Mira Verran",
          attrs: { ...characterAttrsFixture, face: "   ", locationType: "Harbour", atmosphere: "" },
        },
      ],
    });
    const attrs = bible.entities[0].attrs ?? {};
    expect(attrs.eyes).toBe("Storm-gray, always moving");
    expect("face" in attrs).toBe(false);
    expect("locationType" in attrs).toBe(false);
    expect("atmosphere" in attrs).toBe(false);
  });

  it("never throws, and never echoes what it rejected", () => {
    for (const garbage of [null, undefined, "prose", 7, [], { entities: "all of them" }]) {
      expect(normalizeBible(garbage)).toEqual({ entities: [], relationships: [] });
    }
    expect(
      normalizeBible({ entities: [{ kind: 3, name: {}, aliases: "none", attrs: "n/a" }] }),
    ).toEqual({ entities: [], relationships: [] });
  });
});

describe("generateEntityBible", () => {
  it("hands the provider the permissive wire schema, not the strict one", async () => {
    await generated(wellFormed);
    expect(mocks.calls[0].schema).toBe(bibleWireSchema);
    expect(mocks.calls[0].schema).not.toBe(bibleSchema);
  });

  it("keeps a well-formed bible intact end to end", async () => {
    const bible = await generated(wellFormed);
    expect(bible.entities).toHaveLength(2);
    expect(bible.relationships).toHaveLength(1);
  });

  it("survives 61 entities when the invisible cap is 60", async () => {
    const bible = await generated(
      strictlyRejected({
        entities: [
          character("Mira Verran"),
          ...Array.from({ length: 60 }, (_, index) => character(`Extra ${index + 1}`)),
        ],
      }),
    );
    expect(bible.entities).toHaveLength(60);
  });

  it('survives a relationship type of "half-sister", which is in no enum the model saw', async () => {
    const bible = await generated(
      strictlyRejected({
        ...wellFormed,
        relationships: [
          {
            from: "Mira Verran",
            to: "The Salt Ledger",
            type: "half-sister",
            description: "Inherited.",
          },
        ],
      }),
    );
    expect(bible.relationships[0].type).toBe("other");
  });

  it('survives a kind of "protagonist" on the main character without tripping the gate', async () => {
    const bible = await generated(
      strictlyRejected({
        entities: [{ kind: "protagonist", name: "Mira Verran", attrs: characterAttrsFixture }],
      }),
    );
    expect(bible.entities[0].kind).toBe("character");
  });

  it('keeps the profile of a supporting cast member answered as kind "antagonist"', async () => {
    const bible = await generated(
      strictlyRejected({
        entities: [
          character("Mira Verran"),
          { kind: "antagonist", name: "Coran Verran", attrs: characterAttrsFixture },
        ],
      }),
    );
    expect(bible.entities[1].kind).toBe("character");
    expect(bible.entities[1].attrs?.arc).toBe(
      "Learns that a debt can be forgiven rather than paid",
    );
  });

  it("survives a partial character profile the strict schema would have discarded", async () => {
    const bible = await generated(
      strictlyRejected({
        entities: [{ kind: "character", name: "Mira Verran", attrs: { role: "protagonist" } }],
      }),
    );
    expect(bible.entities[0].attrs).toEqual({ role: "protagonist" });
  });

  it("still refuses a bible that omits a main character outright", async () => {
    await expect(
      generated({
        entities: [{ kind: "location", name: "The Salt Ledger", attrs: locationAttrsFixture }],
      }),
    ).rejects.toThrow(/Mira Verran/);
  });
});
