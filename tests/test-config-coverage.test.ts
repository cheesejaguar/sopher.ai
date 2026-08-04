import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import dbIntegrationConfig from "../vitest.db-integration.config";
import workflowIntegrationConfig from "../vitest.integration.config";
import unitConfig from "../vitest.config";

/**
 * Guards the test runners against the failure mode that is worst in CI: a test
 * file that exists, looks like it runs, and is never executed by anything.
 *
 * The db-integration runner had exactly that bug — a hardcoded thirteen-path
 * include list that silently ignored any newly added integration test. These
 * assertions are about runner *coverage*, not about any individual test.
 *
 * "Covered" deliberately means executed by CI, not merely matched by some
 * config's glob. An earlier version of this file only imported
 * vitest.db-integration.config.ts and hardcoded an excuse for the one file it
 * did not claim, which made the orphan it was supposed to catch invisible: no
 * package script passes `--config vitest.integration.config.ts`, so a file only
 * that config matches runs nowhere.
 */

const repoRoot = path.resolve(__dirname, "..");
const readRepoFile = (relative: string): string =>
  readFileSync(path.join(repoRoot, relative), "utf8");

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
  test: { name: string; include: string[]; exclude?: string[] };
};

const unitProjects = (unitConfig as unknown as { test: { projects: ProjectConfig[] } }).test
  .projects;

const claims = (project: ProjectConfig, file: string): boolean =>
  matchesAny(file, project.test.include) && !matchesAny(file, project.test.exclude ?? []);

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

describe("integration runner coverage", () => {
  const packageScripts: Record<string, string> = JSON.parse(readRepoFile("package.json")).scripts;
  const ciWorkflow = readRepoFile(".github/workflows/ci.yml");

  const escapeRegExp = (value: string) => value.replace(/[\\^$.|?*+()[\]{}]/g, "\\$&");

  type Runner = ProjectConfig & { configFile: string; executedInCi: boolean };

  /**
   * A config file is inert on its own. It becomes a runner only when a package
   * script passes it to vitest *and* a CI job invokes that script by name —
   * either half missing means the tests it claims never run on a pull request.
   */
  function runner(configFile: string, config: unknown): Runner {
    const scripts = Object.entries(packageScripts)
      .filter(([, command]) => command.includes(configFile))
      .map(([name]) => name);
    const executedInCi = scripts.some((name) =>
      // `(?![\w:.-])` stops `pnpm test` from looking like `pnpm test:db-integration`.
      new RegExp(String.raw`pnpm (?:run )?${escapeRegExp(name)}(?![\w:.-])`).test(ciWorkflow),
    );

    return {
      configFile,
      executedInCi,
      test: { ...(config as ProjectConfig).test, name: configFile },
    };
  }

  const runners = [
    runner("vitest.db-integration.config.ts", dbIntegrationConfig),
    runner("vitest.integration.config.ts", workflowIntegrationConfig),
  ];
  const ciRunners = runners.filter((r) => r.executedInCi);

  it("knows about every vitest config in the repo", () => {
    // The assertions below reason only about the configs imported at the top of
    // this file, so a config added without being imported would be invisible to
    // them. Fail here instead, with the fix being obvious.
    const onDisk = readdirSync(repoRoot)
      .filter((name) => /^vitest\..*config\.ts$/.test(name))
      .sort();

    expect(onDisk).toEqual([
      "vitest.config.ts",
      "vitest.db-integration.config.ts",
      "vitest.integration.config.ts",
    ]);
  });

  it("runs every integration test in exactly one CI runner", () => {
    const misrouted = integrationTestFiles
      .map((file) => ({
        file,
        runners: ciRunners.filter((r) => claims(r, file)).map((r) => r.configFile),
      }))
      .filter(({ runners: claimed }) => claimed.length !== 1);

    expect(misrouted).toEqual([]);
  });

  it("lets no config CI never invokes be a test's only claimant", () => {
    // Both integration configs match some of the same files — the workflow
    // config's include is unanchored — so overlap alone is not the bug. The bug
    // is a file whose *only* claimant is a config nothing executes.
    const stranded = runners
      .filter((r) => !r.executedInCi)
      .flatMap((r) =>
        integrationTestFiles
          .filter((file) => claims(r, file) && !ciRunners.some((ci) => claims(ci, file)))
          .map((file) => ({ file, onlyClaimedBy: r.configFile })),
      );

    expect(stranded).toEqual([]);
  });

  it("picks up a newly added integration test without editing the config", () => {
    // The regression this file exists for: an enumerated include list matches
    // only the paths someone remembered to add, so a new file runs nowhere.
    // This is the assertion that actually discriminates — every other one here
    // passes just as happily against a hardcoded list of the files that exist
    // today.
    const newFiles = [
      "src/lib/newly-added-guard.integration.test.ts",
      "src/lib/nested/newly-added-guard.integration.test.ts",
      "src/db/newly-added-guard.integration.test.ts",
    ];

    const unclaimed = newFiles.filter((file) => !ciRunners.some((r) => claims(r, file)));

    expect(unclaimed).toEqual([]);
  });
});

describe("browser globals live in the jsdom project", () => {
  /**
   * Globals a `jsdom` test may use that some Node versions also happen to
   * provide. `document` and `window` are deliberately absent: those already
   * fail loudly under `environment: "node"` on every Node version, so the
   * environment split cannot get them wrong.
   *
   * These can. Node ships its own `sessionStorage`, which is why
   * src/lib/client/idempotent-paid-fetch.test.ts passed on a developer's
   * Node 26 and failed on CI's Node 24 — the split had put a browser test in
   * the node project and nothing local said so.
   */
  const NODE_POLYFILLED_BROWSER_GLOBALS = [
    "sessionStorage",
    "localStorage",
    "navigator",
    "crypto.subtle",
  ];

  const nodeProject = unitProjects.find((project) => project.test.name === "node");

  it.each(NODE_POLYFILLED_BROWSER_GLOBALS)(
    "no node-project test relies on %s, whose presence varies by Node version",
    (global) => {
      // Anchored on a word boundary so "window.sessionStorage" in a string or a
      // comment about the global still counts — a false positive here costs one
      // directive, a false negative costs a green local run and a red CI.
      const escaped = global.split(".").join("\\.");
      const pattern = new RegExp("(^|[^.\\w])" + escaped + "\\s*[.([]", "m");
      const offenders = unitTestFiles
        .filter((file) => nodeProject && claims(nodeProject, file))
        // The directive string is split deliberately. Vitest scans a test
        // file's SOURCE for this comment, so spelling it out here would switch
        // this file to jsdom — whose TextEncoder then breaks the esbuild
        // invariant that @vitejs/plugin-react trips on import, and the file
        // fails to load at all.
        .filter((file) => !readRepoFile(file).includes(`@vitest-${"environment"} jsdom`))
        .filter((file) => pattern.test(readRepoFile(file)));
      expect(offenders).toEqual([]);
    },
  );
});
