import { readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import dbIntegrationConfig from "../vitest.db-integration.config";
import unitConfig from "../vitest.config";

/**
 * Guards the test runners against the failure mode that is worst in CI: a test
 * file that exists, looks like it runs, and is never executed by anything.
 *
 * The db-integration runner had exactly that bug — a hardcoded thirteen-path
 * include list that silently ignored any newly added integration test. These
 * assertions are about runner *coverage*, not about any individual test.
 */

const repoRoot = path.resolve(__dirname, "..");

/** Minimal glob matcher for the subset of syntax these configs use. */
function globToRegExp(glob: string): RegExp {
  let source = "";
  for (let i = 0; i < glob.length; i += 1) {
    const char = glob[i];
    if (char === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          // `**/` spans zero or more directories.
          source += "(?:[^/]+/)*";
          i += 2;
        } else {
          source += ".*";
          i += 1;
        }
      } else {
        source += "[^/]*";
      }
    } else if ("\\^$.|?+()[]{}".includes(char)) {
      source += `\\${char}`;
    } else {
      source += char;
    }
  }
  return new RegExp(`^${source}$`);
}

const matchesAny = (file: string, globs: readonly string[]): boolean =>
  globs.some((glob) => globToRegExp(glob).test(file));

/** Repo-relative POSIX paths of every test file under the given directories. */
function collectTestFiles(...roots: string[]): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(path.join(repoRoot, dir), { withFileTypes: true })) {
      const relative = `${dir}/${entry.name}`;
      if (entry.isDirectory()) {
        walk(relative);
      } else if (/\.test\.tsx?$/.test(entry.name)) {
        found.push(relative);
      }
    }
  };
  for (const root of roots) walk(root);
  return found.sort();
}

const allTestFiles = collectTestFiles("src", "tests");
const isIntegration = (file: string) => file.endsWith(".integration.test.ts");
const unitTestFiles = allTestFiles.filter((file) => !isIntegration(file));
const integrationTestFiles = allTestFiles.filter(isIntegration);

type ProjectConfig = {
  test: { name: string; include: string[]; exclude: string[] };
};

const unitProjects = (unitConfig as unknown as { test: { projects: ProjectConfig[] } }).test
  .projects;

const claims = (project: ProjectConfig, file: string): boolean =>
  matchesAny(file, project.test.include) && !matchesAny(file, project.test.exclude);

describe("unit runner coverage", () => {
  it("routes every unit test file to exactly one environment project", () => {
    const misrouted = unitTestFiles
      .map((file) => ({
        file,
        projects: unitProjects.filter((project) => claims(project, file)).map((p) => p.test.name),
      }))
      .filter(({ projects }) => projects.length !== 1);

    expect(misrouted).toEqual([]);
  });

  it("keeps integration tests out of the unit suite", () => {
    const leaked = integrationTestFiles.filter((file) =>
      unitProjects.some((project) => claims(project, file)),
    );

    expect(leaked).toEqual([]);
  });
});

describe("db-integration runner coverage", () => {
  const dbConfig = (dbIntegrationConfig as unknown as { test: ProjectConfig["test"] }).test;
  const dbProject: ProjectConfig = { test: { ...dbConfig, name: "db" } };

  it("runs every database integration test that exists today", () => {
    // src/workflows/ drives the Workflow DevKit runtime and belongs to
    // vitest.integration.config.ts, so it is deliberately not claimed here.
    const expected = integrationTestFiles.filter((file) => !file.startsWith("src/workflows/"));
    const claimed = integrationTestFiles.filter((file) => claims(dbProject, file));

    expect(claimed).toEqual(expected);
    expect(claimed.length).toBeGreaterThan(0);
  });

  it("picks up a newly added integration test without editing the config", () => {
    // The regression this file exists for: an enumerated include list matches
    // only the paths someone remembered to add, so a new file runs nowhere.
    const newFiles = [
      "src/lib/newly-added-guard.integration.test.ts",
      "src/lib/nested/newly-added-guard.integration.test.ts",
      "src/db/newly-added-guard.integration.test.ts",
    ];

    expect(newFiles.filter((file) => claims(dbProject, file))).toEqual(newFiles);
  });
});
