/**
 * Automated solvability playthrough. Drives the real engine (travel, search,
 * interview, build, accuse) along the intended solution from SOLUTION.md and
 * asserts a winning verdict.
 *
 * This is a regression guard that the reference case stays solvable as the
 * engine changes, and the seed of the solvability guard the generator will need
 * in step five. If following the intended path does not win, the failure is
 * loud and names the step that broke: that is a real bug in the fixture, the
 * comparator, or the runner.
 */

import type { CaseBible, EvidenceRef, Id } from "../types/caseBible.js";
import { pathToFileURL } from "node:url";
import { loadCase, referenceFixturePath } from "./loadCase.js";
import { initialState, type PlayerState } from "./state.js";
import { doAsk, doSearch, doTravel } from "./actions.js";
import { canAsk, characterById, scoreVerdict, type Accusation, type VerdictResult } from "./rules.js";

class SolveError extends Error {}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new SolveError(message);
}

interface SolveOutcome {
  verdict: VerdictResult;
  steps: string[];
}

/** Ask a question, asserting it was available and (optionally) that it revealed a claim. */
function ask(
  bible: CaseBible,
  state: PlayerState,
  steps: string[],
  characterId: Id,
  questionId: Id,
  expectClaims: Id[] = [],
): void {
  const q = bible.questions.find((x) => x.questionId === questionId);
  assert(!!q, `Question ${questionId} does not exist in the bible.`);
  assert(
    canAsk(bible, state, characterId, q!),
    `Step failed: ${questionId} was not askable for ${characterId} when the solution expected it.`,
  );
  const res = doAsk(bible, state, characterId, questionId);
  assert(res.ok, `Step failed: asking ${questionId} returned an error: ${res.messages.join(" ")}`);
  for (const claimId of expectClaims) {
    assert(
      state.claimsHeard.includes(claimId),
      `Step failed: asking ${questionId} did not reveal expected claim ${claimId}.`,
    );
  }
  steps.push(`asked ${questionId} (${characterId})`);
}

export function runAutosolve(path: string = referenceFixturePath): SolveOutcome {
  const bible = loadCase(path);
  const state = initialState(bible);
  const steps: string[] = [];

  assert(bible.resolution.class === "perp", `Autosolve expects a perp case, got ${bible.resolution.class}.`);
  const perp = bible.resolution.perpCharacterId;

  // 1. Start at the crime scene and search it. The shop holds every physical clue.
  const scene = bible.locations.find((l) => l.kind === "crimeScene")!;
  assert(state.currentLocation === scene.locationId, `Expected to start at the crime scene.`);
  const search = doSearch(bible, state);
  assert(search.ok, `Searching the crime scene failed.`);
  for (const clueId of ["C_pawnticket", "C_backdoor_latch", "C_stopped_watch", "C_bottle_prints", "C_ledger_debt"]) {
    assert(state.cluesHeld.includes(clueId), `Step failed: search did not turn up ${clueId}.`);
  }
  steps.push("searched the crime scene");

  // 2. The Medical Examiner: time of death, cause, and that it is a homicide.
  assert(doTravel(bible, state, "LOC_me").ok, `Could not travel to the ME office.`);
  ask(bible, state, steps, "CH_me", "Q_me_1", ["CL_me_tod", "CL_me_cause"]);
  ask(bible, state, steps, "CH_me", "Q_me_2", ["CL_me_defensive"]);

  // 3. Dolores at the shop: baseline, clue-gated, confront.
  assert(doTravel(bible, state, "LOC_shop").ok, `Could not travel to the shop.`);
  ask(bible, state, steps, "CH_dolores", "Q_dol_1", ["CL_dolores_departtime"]);
  ask(bible, state, steps, "CH_dolores", "Q_dol_2", ["CL_dolores_backdoor"]);
  ask(bible, state, steps, "CH_dolores", "Q_dol_3");

  // 4. Sid and Etta at the diner.
  assert(doTravel(bible, state, "LOC_diner").ok, `Could not travel to the diner.`);
  ask(bible, state, steps, "CH_sid", "Q_sid_1", ["CL_sid_departtime"]);
  ask(bible, state, steps, "CH_sid", "Q_sid_2");
  ask(bible, state, steps, "CH_sid", "Q_sid_3", ["CL_sid_sawcar"]); // cracking the lie yields the sighting
  ask(bible, state, steps, "CH_etta", "Q_etta_1", ["CL_etta_crashtime", "CL_etta_seedolores"]);
  ask(bible, state, steps, "CH_etta", "Q_etta_2");
  ask(bible, state, steps, "CH_etta", "Q_etta_3");

  // 5. Webb at the station: alibi, ledger, the confront on the prints.
  assert(doTravel(bible, state, "LOC_station").ok, `Could not travel to the station.`);
  ask(bible, state, steps, "CH_webb", "Q_webb_1", ["CL_webb_alibi", "CL_webb_alibi_time", "CL_webb_debt_denial"]);
  ask(bible, state, steps, "CH_webb", "Q_webb_2");
  ask(bible, state, steps, "CH_webb", "Q_webb_3");

  // 6. Accuse Webb, citing the required evidence chain, with the confronts resolved.
  const citedChain: EvidenceRef[] = bible.scoringSpec.requiredEvidenceChain;
  const accusation: Accusation = {
    accusedId: perp,
    citedChain,
    resolvedContradictions: state.resolvedContradictions,
  };
  const verdict = scoreVerdict(bible, accusation);
  assert(
    verdict.outcome === "win",
    `Step failed: following SOLUTION.md did not win. Reasons: ${verdict.reasons.join(" | ")}`,
  );
  steps.push(`accused ${characterById(bible, perp)?.name ?? perp}: ${verdict.outcome}`);

  return { verdict, steps };
}

function main(): void {
  try {
    const { verdict, steps } = runAutosolve();
    console.log("Autosolve playthrough:");
    for (const s of steps) console.log(`  - ${s}`);
    console.log(`\nVerdict: ${verdict.outcome.toUpperCase()}`);
    for (const r of verdict.reasons) console.log(`  ${r}`);
    console.log(`\nPASS: the reference case is solvable by its intended path.`);
    process.exit(0);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`FAIL: autosolve could not solve the reference case.`);
    console.error(`  ${message}`);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
