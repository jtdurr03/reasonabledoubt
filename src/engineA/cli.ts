/**
 * Engine A CLI. Generates a batch of cases from a template across a seed range,
 * writes each validated case plus its dialogue sidecar, and reports rejections
 * and their reasons. Requires ANTHROPIC_API_KEY (the model fills prose and bakes
 * dialogue). Everything deterministic runs without a key in the test suite.
 *
 * Usage:
 *   tsx src/engineA/cli.ts [templateId] [count] [startSeed]
 *   (defaults: homicide-perp, 1, 1)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, join } from "node:path";
import { templates } from "./template.js";
import { generateCase, type GeneratorDeps } from "./pipeline.js";
import { createAnthropicClient } from "../engineB/client.js";
import { ModelVerifier } from "../engineB/guard.js";
import { VERIFIER_MODEL } from "../engineB/config.js";
import { FILL_MODEL, DEFAULT_MAX_ATTEMPTS } from "./config.js";
import { PERFORMER_MODEL } from "../engineB/config.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const outDir = resolve(repoRoot, "generated");

async function main(): Promise<void> {
  const templateId = process.argv[2] ?? "homicide-perp";
  const count = Number(process.argv[3] ?? "1");
  let startSeed = Number(process.argv[4] ?? "1");

  const template = templates[templateId];
  if (!template) {
    console.error(`Unknown template "${templateId}". Known: ${Object.keys(templates).join(", ")}`);
    process.exit(1);
  }

  console.log(`Engine A: generating ${count} case(s) from "${templateId}".`);
  console.log(`Fill model: ${FILL_MODEL}. Dialogue performer: ${PERFORMER_MODEL}. Verifier: ${VERIFIER_MODEL}.`);

  const deps: GeneratorDeps = {
    fillClient: createAnthropicClient(),
    performer: createAnthropicClient(),
    verifier: new ModelVerifier(createAnthropicClient(), VERIFIER_MODEL),
  };

  mkdirSync(outDir, { recursive: true });

  for (let n = 0; n < count; n++) {
    const generated = await generateCase(template, deps, {
      startSeed,
      maxAttempts: DEFAULT_MAX_ATTEMPTS,
    });
    // Advance past every seed this case consumed so the next case is distinct.
    startSeed = generated.seed + 1;

    const casePath = join(outDir, `${generated.bible.caseId}.case.json`);
    const dialoguePath = join(outDir, `${generated.bible.caseId}.dialogue.json`);
    writeFileSync(casePath, JSON.stringify(generated.bible, null, 2) + "\n");
    writeFileSync(dialoguePath, JSON.stringify(generated.dialogue, null, 2) + "\n");

    console.log(
      `\n[${n + 1}/${count}] ${generated.bible.caseId}: "${generated.bible.title}" ` +
        `(seed ${generated.seed}, ${generated.attempts} attempt(s))`,
    );
    console.log(`  case:     ${casePath}`);
    console.log(`  dialogue: ${dialoguePath}`);
  }

  console.log(`\nDone. Cases in ${outDir}.`);
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
