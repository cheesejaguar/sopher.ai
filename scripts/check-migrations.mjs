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

if (problems.length > 0) {
  console.error("Migration check failed:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`Migrations OK — ${tags.length} entries, all present and sequential.`);
