/**
 * The solvability solver. Replays a case's intended solution through the actual
 * step-three runner rules and returns the verdict. This orchestrates the runner
 * (doSearch, doTravel, doAsk) and the canonical scorer (scoreVerdict); it does
 * not reimplement any of them. The generator uses it as the solvability guard:
 * a case must prove it can be won from its own evidence before it ships.
 */

import type { CaseBible } from "../types/caseBible.js";
import type { IntendedSolution } from "./skeleton.js";
import { initialState } from "../runner/state.js";
import { doAsk, doSearch, doTravel } from "../runner/actions.js";
import { canAsk, scoreVerdict, type VerdictResult } from "../runner/rules.js";

export interface SolveResult {
  win: boolean;
  /** A human-readable reason when the case could not be solved by its intended plan. */
  reason: string;
  verdict?: VerdictResult;
}

/** Replay the intended plan, then accuse. Any blocked step is a solvability failure. */
export function solveWithPlan(bible: CaseBible, solution: IntendedSolution): SolveResult {
  const state = initialState(bible);

  for (const step of solution.steps) {
    if (step.kind === "travel") {
      const r = doTravel(bible, state, step.locationId);
      if (!r.ok) return { win: false, reason: `travel to ${step.locationId} failed: ${r.messages.join(" ")}` };
    } else if (step.kind === "search") {
      doSearch(bible, state);
    } else {
      const question = bible.questions.find((q) => q.questionId === step.questionId);
      if (!question) return { win: false, reason: `intended question ${step.questionId} does not exist` };
      if (!canAsk(bible, state, step.characterId, question)) {
        return {
          win: false,
          reason: `intended question ${step.questionId} was not askable for ${step.characterId} when the plan reached it (precondition or budget)`,
        };
      }
      const r = doAsk(bible, state, step.characterId, step.questionId);
      if (!r.ok) return { win: false, reason: `asking ${step.questionId} failed: ${r.messages.join(" ")}` };
    }
  }

  const verdict = scoreVerdict(bible, solution.accusation);
  if (verdict.outcome !== "win") {
    return { win: false, reason: `verdict was a loss: ${verdict.reasons.join(" | ")}`, verdict };
  }
  return { win: true, reason: "solved by intended plan", verdict };
}
