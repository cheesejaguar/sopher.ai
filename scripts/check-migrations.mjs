/**
 * Every journal entry must have its .sql file, and every .sql file must be in
 * the journal.
 *
 * This exists because a rebase plus macOS filesystem sync renamed
 * 0010_backfill_completed_at.sql to "...at 2.sql"; the apparent duplicate was
 * deleted and the real file went with it. The journal still referenced it, so
 * `drizzle-kit migrate` failed at deploy time on three branches — long after
 * typecheck, lint, tests and `next build` had all passed, none of which look at
 * migration files.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, existsSync } from "node:fs";

const JOURNAL = "drizzle/meta/_journal.json";
const journal = JSON.parse(readFileSync(JOURNAL, "utf8"));
const problems = [];

const tags = journal.entries.map((entry) => entry.tag);

for (const tag of tags) {
  if (!existsSync(`drizzle/${tag}.sql`)) {
    problems.push(`journal references ${tag} but drizzle/${tag}.sql does not exist`);
  }
}

const onDisk = readdirSync("drizzle").filter((f) => f.endsWith(".sql"));
for (const file of onDisk) {
  const tag = file.replace(/\.sql$/, "");
  if (!tags.includes(tag)) {
    problems.push(`drizzle/${file} exists but is not in the journal (it will never run)`);
  }
}

// Duplicate or gapped indices mean drizzle applies them in an order nobody
// intended, which is how a data migration lands before the column it fills.
const indices = journal.entries.map((entry) => entry.idx);
if (new Set(indices).size !== indices.length) {
  problems.push(`journal has duplicate idx values: ${indices.join(", ")}`);
}
for (let i = 0; i < indices.length; i += 1) {
  if (indices[i] !== i) {
    problems.push(`journal idx values are not sequential from 0: ${indices.join(", ")}`);
    break;
  }
}

// `when` must strictly increase. drizzle applies only migrations whose `when`
// exceeds the newest created_at already in __drizzle_migrations, so an
// out-of-order value is not applied late — it is never applied at all, silently.
const whens = journal.entries.map((entry) => entry.when);
for (let i = 1; i < whens.length; i += 1) {
  if (whens[i] <= whens[i - 1]) {
    problems.push(
      `${journal.entries[i].tag} has when=${whens[i]}, not greater than ` +
        `${journal.entries[i - 1].tag} (when=${whens[i - 1]}) — drizzle would skip it`,
    );
  }
}

// Two entries with byte-identical SQL share a hash, and drizzle keys "already
// applied" on the hash. That is how renaming an applied migration strands a
// genuinely new one: the rename looks applied, its later `when` becomes the
// watermark, and the new migration below that line is skipped forever. This
// cost a production backfill that reported success and did nothing.
const hashes = new Map();
for (const tag of tags) {
  const path = `drizzle/${tag}.sql`;
  if (!existsSync(path)) continue;
  const hash = createHash("sha256").update(readFileSync(path, "utf8")).digest("hex");
  if (hashes.has(hash)) {
    problems.push(
      `${tag} has SQL byte-identical to ${hashes.get(hash)} — drizzle keys applied ` +
        `state on the hash, so one of them will never run`,
    );
  }
  hashes.set(hash, tag);
}

if (problems.length > 0) {
  console.error("Migration check failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(
  `Migrations OK — ${tags.length} entries: files present, indices sequential, ` +
    `timestamps increasing, no duplicate SQL.`,
);
