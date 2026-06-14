/**
 * Unit tests for the pure runtime rules, written before the CLI (working style:
 * rules first). Covers question availability, budget and the relevance bonus,
 * flag visibility, timeline conflicts, and the verdict scorer (including the
 * required losing cases).
 */

import { describe, it, expect, beforeEach } from "vitest";
import { loadCase } from "./loadCase.js";
import { initialState, discoverClue, type PlayerState } from "./state.js";
import {
  availableQuestions,
  budgetInfo,
  canAsk,
  detectRelevanceBonus,
  evidenceStrength,
  isQuestionAvailable,
  newlyVisibleContradictions,
  questionCost,
  scoreVerdict,
  visibleContradictions,
  type Accusation,
} from "./rules.js";
import type { CaseBible, EvidenceRef } from "../types/caseBible.js";

const bible: CaseBible = loadCase();

const fullChain: EvidenceRef[] = bible.scoringSpec.requiredEvidenceChain;
const winningAccusation: Accusation = {
  accusedId: "CH_webb",
  citedChain: fullChain,
  resolvedContradictions: ["CL_webb_alibi"],
};

describe("question availability", () => {
  let state: PlayerState;
  beforeEach(() => {
    state = initialState(bible);
  });

  it("baseline (tier 1) questions are available immediately", () => {
    const avail = availableQuestions(bible, state, "CH_dolores").map((q) => q.questionId);
    expect(avail).toContain("Q_dol_1");
  });

  it("a clue-gated question is unavailable until its clue is held", () => {
    expect(isQuestionAvailable(bible, state, bible.questions.find((q) => q.questionId === "Q_dol_2")!)).toBe(false);
    discoverClue(state, "C_backdoor_latch");
    expect(isQuestionAvailable(bible, state, bible.questions.find((q) => q.questionId === "Q_dol_2")!)).toBe(true);
  });

  it("a tier-3 confront stays gated until it is unlocked and its clue is held", () => {
    discoverClue(state, "C_pawnticket");
    const q3 = bible.questions.find((q) => q.questionId === "Q_sid_3")!;
    // Holding the clue is not enough; Q_sid_2 must unlock it first.
    expect(isQuestionAvailable(bible, state, q3)).toBe(false);
    state.unlockedQuestions.push("Q_sid_3");
    expect(isQuestionAvailable(bible, state, q3)).toBe(true);
  });
});

describe("budget and the relevance bonus", () => {
  let state: PlayerState;
  beforeEach(() => {
    state = initialState(bible);
  });

  it("starts each witness at the base budget of 10", () => {
    expect(budgetInfo(state, "CH_dolores").limit).toBe(10);
  });

  it("a probing question costs 1 and a confront costs 0", () => {
    expect(questionCost(bible.questions.find((q) => q.questionId === "Q_dol_1")!)).toBe(1);
    expect(questionCost(bible.questions.find((q) => q.questionId === "Q_dol_3")!)).toBe(0);
  });

  it("grants +3 only to the witness the new evidence is relevant to", () => {
    discoverClue(state, "C_backdoor_latch");
    const deltas = detectRelevanceBonus(bible, state);
    const recipients = deltas.map((d) => d.characterId);
    expect(recipients).toContain("CH_dolores"); // unlocks Q_dol_2 and Q_dol_3
    expect(recipients).not.toContain("CH_sid"); // that clue unlocks nothing for Sid
  });

  it("grants no bonus for a clue that unlocks no question for anyone", () => {
    // C_phone_slip is referenced by no question's preconditions.
    discoverClue(state, "C_phone_slip");
    expect(detectRelevanceBonus(bible, state)).toHaveLength(0);
  });

  it("does not re-grant the bonus for evidence already counted", () => {
    discoverClue(state, "C_pawnticket");
    const first = detectRelevanceBonus(bible, state);
    expect(first.find((d) => d.characterId === "CH_sid")).toBeDefined();
    // Mark them counted, as applyRelevanceBonus would.
    state.bonusCountedQuestions["CH_sid"] = first.find((d) => d.characterId === "CH_sid")!.triggeringQuestionIds;
    expect(detectRelevanceBonus(bible, state).find((d) => d.characterId === "CH_sid")).toBeUndefined();
  });

  it("blocks a probing question when the budget is exhausted, but never a free confront", () => {
    state.budgetSpent["CH_dolores"] = 10; // exhausted
    expect(canAsk(bible, state, "CH_dolores", bible.questions.find((q) => q.questionId === "Q_dol_1")!)).toBe(false);
    // A free confront, once available, is still askable.
    discoverClue(state, "C_backdoor_latch");
    state.unlockedQuestions.push("Q_dol_3");
    expect(canAsk(bible, state, "CH_dolores", bible.questions.find((q) => q.questionId === "Q_dol_3")!)).toBe(true);
  });
});

describe("contradiction flag visibility", () => {
  it("shows nothing until both sources are held, then surfaces the flag", () => {
    const state = initialState(bible);
    state.claimsHeard.push("CL_sid_departtime"); // one source only
    expect(visibleContradictions(bible, state).some((e) => e.sourceA === "CL_sid_departtime" || e.sourceB === "CL_sid_departtime")).toBe(false);
    discoverClue(state, "C_pawnticket"); // now hold both
    const flags = newlyVisibleContradictions(bible, state);
    expect(flags.some((e) => e.factId === "F_sid_presence")).toBe(true);
  });
});

describe("verdict scorer", () => {
  it("returns a win for the correct accusation with a sufficient, strong chain", () => {
    const v = scoreVerdict(bible, winningAccusation);
    expect(v.outcome).toBe("win");
    expect(v.targetCorrect).toBe(true);
    expect(v.chainSufficient).toBe(true);
    expect(v.strengthOk).toBe(true);
  });

  it("loses on a wrong accusation and explains why", () => {
    const v = scoreVerdict(bible, { ...winningAccusation, accusedId: "CH_sid" });
    expect(v.outcome).toBe("lose");
    expect(v.targetCorrect).toBe(false);
    expect(v.reasons.join(" ")).toMatch(/CH_sid/);
  });

  it("loses when declaring no perp on a case that has one", () => {
    const v = scoreVerdict(bible, { ...winningAccusation, accusedId: null });
    expect(v.outcome).toBe("lose");
    expect(v.reasons.join(" ")).toMatch(/no perp/i);
  });

  it("loses when the cited chain misses the minimum core", () => {
    const v = scoreVerdict(bible, { accusedId: "CH_webb", citedChain: [{ kind: "fact", id: "F_webb_debt" }] });
    expect(v.outcome).toBe("lose");
    expect(v.chainSufficient).toBe(false);
    expect(v.missingCore.length).toBeGreaterThan(0);
  });

  it("loses when the chain rests only on a single uncorroborated statement", () => {
    // F_crash_time is neither an ME fact nor corroborated by two sources here.
    const v = scoreVerdict(bible, { accusedId: "CH_webb", citedChain: [{ kind: "fact", id: "F_crash_time" }] });
    expect(v.strengthOk).toBe(false);
    expect(v.outcome).toBe("lose");
  });

  it("rates physical and ME evidence above testimony", () => {
    expect(evidenceStrength(bible, { kind: "clue", id: "C_bottle_prints" })).toBe(3);
    expect(evidenceStrength(bible, { kind: "fact", id: "F_tod" })).toBe(3); // ME finding
    expect(evidenceStrength(bible, { kind: "fact", id: "F_dolores_departure" })).toBe(2); // corroborated
    expect(evidenceStrength(bible, { kind: "fact", id: "F_crash_time" })).toBe(1); // single statement
  });
});
