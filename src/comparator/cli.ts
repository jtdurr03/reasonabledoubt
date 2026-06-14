/**
 * Comparator CLI: load a bible, compute derived data, write the enriched bible
 * plus a human-readable report, and confirm the enriched bible still validates
 * against the schema.
 *
 * Usage:
 *   tsx src/comparator/cli.ts                        (the reference fixture)
 *   tsx src/comparator/cli.ts path/to/some.case.json
 *
 * Writes <input>.enriched.json and <input>.report.md next to the input.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, basename, extname, join } from "node:path";
import type { CaseBible } from "../types/caseBible.js";
import { computeDerived } from "./index.js";
import { validateBible } from "../validate.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const defaultFixture = resolve(repoRoot, "fixtures/reference-homicide.case.json");

function outputPaths(inputPath: string): { enriched: string; report: string } {
  const dir = dirname(inputPath);
  const stem = basename(inputPath, extname(inputPath)).replace(/\.case$/, "");
  return {
    enriched: join(dir, `${stem}.enriched.json`),
    report: join(dir, `${stem}.report.md`),
  };
}

function buildReport(bible: CaseBible): string {
  const d = bible.derived!;
  const lines: string[] = [];
  lines.push(`# Comparator report: ${bible.title} (${bible.caseId})`);
  lines.push("");
  lines.push(`Comparator version ${d.comparatorVersion}.`);
  lines.push("");
  lines.push(
    "Distance and band are computed from values only. The hidden corroboration",
  );
  lines.push(
    "classification is read from authored veracity, never from magnitude.",
  );
  lines.push("");

  lines.push("## Contradictions (band moderate or major)");
  lines.push("");
  const flagged = d.contradictionMatrix
    .filter((e) => e.band === "moderate" || e.band === "major")
    .sort((a, b) => b.severity - a.severity);
  if (flagged.length === 0) {
    lines.push("None.");
  } else {
    for (const e of flagged) {
      lines.push(
        `- [${e.band}] ${e.sourceA} (${e.sourceAKind}) vs ${e.sourceB} (${e.sourceBKind}) ` +
          `on ${e.factId} (${e.type}): raw ${round(e.rawDistance)}, severity ${round(e.severity)}`,
      );
    }
  }
  lines.push("");

  lines.push("## All comparisons by fact");
  lines.push("");
  const byFact = new Map<string, typeof d.contradictionMatrix>();
  for (const e of d.contradictionMatrix) {
    const list = byFact.get(e.factId) ?? [];
    list.push(e);
    byFact.set(e.factId, list);
  }
  for (const [factId, list] of byFact) {
    lines.push(`### ${factId}`);
    for (const e of list) {
      lines.push(
        `- ${e.sourceA} vs ${e.sourceB}: ${e.band} (raw ${round(e.rawDistance)}, severity ${round(e.severity)})`,
      );
    }
    lines.push("");
  }

  lines.push("## Corroboration");
  lines.push("");
  for (const c of d.corroboration) {
    const memberList = c.members.map((m) => `${m.sourceId} (${m.kind})`).join(", ");
    lines.push(
      `- ${c.factId}: corroborated=${c.corroborated}, classification=${c.classification}`,
    );
    lines.push(`  members: ${memberList}`);
  }
  lines.push("");

  return lines.join("\n");
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function main(): void {
  const inputPath = process.argv[2]
    ? resolve(process.cwd(), process.argv[2])
    : defaultFixture;

  console.log(`Comparator: reading ${inputPath}`);
  const bible = JSON.parse(readFileSync(inputPath, "utf8")) as CaseBible;

  bible.derived = computeDerived(bible);

  const { enriched, report } = outputPaths(inputPath);
  writeFileSync(enriched, JSON.stringify(bible, null, 2) + "\n");
  writeFileSync(report, buildReport(bible));
  console.log(`Wrote enriched bible: ${enriched}`);
  console.log(`Wrote report:         ${report}`);
  console.log(
    `Derived: ${bible.derived.contradictionMatrix.length} comparisons, ` +
      `${bible.derived.corroboration.length} corroborated facts.`,
  );

  const errors = validateBible(bible);
  if (errors.length === 0) {
    console.log("\nPASS: enriched bible validates against the schema.");
    process.exit(0);
  }
  console.error(`\nFAIL: enriched bible has ${errors.length} validation error(s):\n`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
