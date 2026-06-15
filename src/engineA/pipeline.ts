/**
 * The generation pipeline. Orchestrates the eight stages in exact order and
 * wraps them in a reject-and-retry loop. The deterministic stages (skeleton,
 * schema, invariants) gate before any model tokens are spent. The model only
 * fills prose; the comparator, Engine B, and the runner rules are orchestrated,
 * not reimplemented.
 *
 *   1. deterministic skeleton from template + seed
 *   2. schema validation of the structural bible
 *   3. invariant check (reject and reseed before any model spend)
 *   4. content fill (model writes prose into defined slots)
 *   5. comparator enrich (contradiction matrix + corroboration map)
 *   6. Engine B bake (leak-guarded performed dialogue)
 *   7. solvability guard (autosolve the intended chain under rules.ts)
 *   8. final schema validation of the complete enriched bible
 */

import type { CaseBible } from "../types/caseBible.js";
import type { CrimeTemplate } from "./template.js";
import type { ModelClient } from "../engineB/client.js";
import type { Verifier } from "../engineB/guard.js";
import { generateSkeleton, type IntendedSolution } from "./skeleton.js";
import { checkInvariants } from "./invariants.js";
import { fillContent } from "./contentFill.js";
import { solveWithPlan } from "./solve.js";
import { validateBible } from "../validate.js";
import { computeDerived } from "../comparator/index.js";
import { bakeBible } from "../engineB/bake.js";
import { emptyArtifact, type DialogueArtifact } from "../engineB/cache.js";
import { PERFORMER_MODEL, VERIFIER_MODEL } from "../engineB/config.js";

export interface GeneratorDeps {
  /** Model that fills prose into the skeleton's slots. */
  fillClient: ModelClient;
  /** Engine B performer for the dialogue bake. */
  performer: ModelClient;
  /** Engine B leak verifier. */
  verifier: Verifier;
}

export interface GeneratedCase {
  bible: CaseBible;
  dialogue: DialogueArtifact;
  solution: IntendedSolution;
  seed: number;
  attempts: number;
}

export interface AttemptResult {
  ok: boolean;
  stage: string;
  reasons: string[];
}

export class GenerationError extends Error {
  constructor(
    public readonly templateId: string,
    public readonly seedsTried: number[],
    public readonly reasons: string[],
  ) {
    super(
      `Generation failed for template "${templateId}" after ${seedsTried.length} seed(s) [${seedsTried.join(", ")}]. ` +
        `Reasons: ${reasons.join(" | ")}`,
    );
    this.name = "GenerationError";
  }
}

/** One seed attempt through the full pipeline. No retry here. */
export async function generateOne(
  template: CrimeTemplate,
  seed: number,
  deps: GeneratorDeps,
): Promise<{ ok: true; case: GeneratedCase } | { ok: false; result: AttemptResult }> {
  // 1. Deterministic skeleton.
  const { bible: skeletonBible, solution } = generateSkeleton(template, seed);

  // 2. Schema validation of the structural bible.
  const structuralErrors = validateBible(skeletonBible);
  if (structuralErrors.length > 0) {
    return { ok: false, result: { ok: false, stage: "schema(structural)", reasons: structuralErrors } };
  }

  // 3. Invariant check. Reject before any model spend.
  const violations = checkInvariants(skeletonBible, solution);
  if (violations.length > 0) {
    return { ok: false, result: { ok: false, stage: "invariants", reasons: violations } };
  }

  // 4. Content fill (first model spend). Fill a clone; the skeleton stays pure.
  const bible = structuredClone(skeletonBible);
  await fillContent(deps.fillClient, bible);

  // 5. Comparator enrich.
  bible.derived = computeDerived(bible);

  // 6. Engine B bake.
  const dialogue = emptyArtifact(bible.caseId, PERFORMER_MODEL, VERIFIER_MODEL);
  await bakeBible(
    { performer: deps.performer, verifier: deps.verifier, performerModel: PERFORMER_MODEL },
    bible,
    dialogue,
  );

  // 7. Solvability guard.
  const solved = solveWithPlan(bible, solution);
  if (!solved.win) {
    return { ok: false, result: { ok: false, stage: "solvability", reasons: [solved.reason] } };
  }

  // 8. Final schema validation of the enriched bible.
  const finalErrors = validateBible(bible);
  if (finalErrors.length > 0) {
    return { ok: false, result: { ok: false, stage: "schema(final)", reasons: finalErrors } };
  }

  return { ok: true, case: { bible, dialogue, solution, seed, attempts: 1 } };
}

export interface GenerateOptions {
  startSeed?: number;
  maxAttempts?: number;
  /** Optional progress sink (defaults to console.error for rejections). */
  onReject?: (seed: number, result: AttemptResult) => void;
}

/**
 * Generate one shippable case, retrying with new seeds on rejection up to the
 * cap. On hitting the cap it throws a GenerationError naming the template and
 * every seed tried, so a generation bug is reproducible rather than silent.
 */
export async function generateCase(
  template: CrimeTemplate,
  deps: GeneratorDeps,
  options: GenerateOptions = {},
): Promise<GeneratedCase> {
  const startSeed = options.startSeed ?? 1;
  const maxAttempts = options.maxAttempts ?? 8;
  const seedsTried: number[] = [];
  const reasons: string[] = [];

  for (let i = 0; i < maxAttempts; i++) {
    const seed = startSeed + i;
    seedsTried.push(seed);
    const outcome = await generateOne(template, seed, deps);
    if (outcome.ok) {
      return { ...outcome.case, attempts: i + 1 };
    }
    const detail = `seed ${seed} rejected at ${outcome.result.stage}: ${outcome.result.reasons.join("; ")}`;
    reasons.push(detail);
    (options.onReject ?? defaultOnReject)(seed, outcome.result);
  }

  const error = new GenerationError(template.templateId, seedsTried, reasons);
  console.error(`GENERATION FAILED: ${error.message}`);
  throw error;
}

function defaultOnReject(seed: number, result: AttemptResult): void {
  console.error(`  rejected seed ${seed} at ${result.stage}: ${result.reasons[0] ?? "unknown"}`);
}
