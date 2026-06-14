/**
 * The bake pass. Enumerates every reachable (character, question, claim, state)
 * tuple for a bible, performs each line, guards it, and stores only validated
 * lines into the dialogue artifact. Re-running reuses cached lines.
 *
 * Because the question menu is a finite gated set and each answer's content is
 * already authored, the full set of producible lines is enumerable. We bake it
 * once at generation time, which is the whole point of doing this here and not
 * at runtime: the runtime reads baked lines and makes no model calls.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import type { CaseBible, Claim, Question } from "../types/caseBible.js";
import { performForClaim, type PerformerDeps } from "./index.js";
import {
  buildKey,
  emptyArtifact,
  loadArtifact,
  saveArtifact,
  dialoguePathFor,
  type DialogueArtifact,
} from "./cache.js";
import { revealedStateFor } from "./prompt.js";
import { createAnthropicClient } from "./client.js";
import { ModelVerifier } from "./guard.js";
import { PERFORMER_MODEL, VERIFIER_MODEL } from "./config.js";

export interface BakeStats {
  total: number;
  performed: number;
  cached: number;
  fallbacks: number;
}

interface Tuple {
  question: Question;
  claim: Claim;
  stateKey: string;
}

/** Every reachable line: each claim a question reveals, under that question's state. */
export function reachableTuples(bible: CaseBible): Tuple[] {
  const claimById = new Map<string, Claim>(bible.claims.map((c) => [c.claimId, c]));
  const tuples: Tuple[] = [];
  for (const question of bible.questions) {
    const stateKey = revealedStateFor(question).key;
    for (const claimId of question.effects?.revealsClaimIds ?? []) {
      const claim = claimById.get(claimId);
      if (claim) tuples.push({ question, claim, stateKey });
    }
  }
  return tuples;
}

/** Bake all reachable lines into the artifact, reusing any already present. */
export async function bakeBible(
  deps: PerformerDeps,
  bible: CaseBible,
  artifact: DialogueArtifact,
  options: { force?: boolean } = {},
): Promise<BakeStats> {
  const characterById = new Map(bible.characters.map((c) => [c.characterId, c]));
  const tuples = reachableTuples(bible);
  const stats: BakeStats = { total: tuples.length, performed: 0, cached: 0, fallbacks: 0 };

  for (const { question, claim, stateKey } of tuples) {
    const key = buildKey(bible.caseId, claim.characterId, question.questionId, claim.claimId, stateKey);
    if (!options.force && artifact.lines[key]) {
      stats.cached++;
      continue;
    }
    const character = characterById.get(claim.characterId);
    if (!character) continue;

    const result = await performForClaim(deps, bible, character, question, claim);
    artifact.lines[key] = {
      characterId: claim.characterId,
      questionId: question.questionId,
      claimId: claim.claimId,
      stateKey,
      line: result.line,
      usedFallback: result.usedFallback,
    };
    stats.performed++;
    if (result.usedFallback) stats.fallbacks++;
  }

  return stats;
}

/* ------------------------------------------------------------------ */
/* CLI                                                                 */
/* ------------------------------------------------------------------ */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const defaultFixture = resolve(repoRoot, "fixtures/reference-homicide.case.json");

async function main(): Promise<void> {
  const { readFileSync } = await import("node:fs");
  const inputPath = process.argv[2] ? resolve(process.cwd(), process.argv[2]) : defaultFixture;
  const bible = JSON.parse(readFileSync(inputPath, "utf8")) as CaseBible;

  console.log(`Engine B bake: ${inputPath}`);
  console.log(`Performer model: ${PERFORMER_MODEL}. Verifier model: ${VERIFIER_MODEL}.`);

  const performer = createAnthropicClient();
  const verifier = new ModelVerifier(createAnthropicClient(), VERIFIER_MODEL);
  const deps: PerformerDeps = { performer, verifier, performerModel: PERFORMER_MODEL };

  const sidecar = dialoguePathFor(inputPath);
  const artifact = loadArtifact(sidecar) ?? emptyArtifact(bible.caseId, PERFORMER_MODEL, VERIFIER_MODEL);

  const stats = await bakeBible(deps, bible, artifact);
  saveArtifact(sidecar, artifact);

  console.log(`\nDialogue written to ${sidecar}`);
  console.log(`Lines: ${stats.total} total, ${stats.performed} performed, ${stats.cached} reused, ${stats.fallbacks} fell back to spine.`);
  if (stats.fallbacks > 0) {
    console.log(`(${stats.fallbacks} line(s) could not pass the leak guard and shipped the plain spine instead.)`);
  }
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
