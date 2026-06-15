/**
 * The structural invariant checker. Runs on the deterministic skeleton before
 * any model spend, so a generation bug is caught for free rather than after
 * paying for prose. Every violation is named specifically.
 *
 * The invariants: every lie has a reachable refuter, every mistake has a
 * reachable corrector, every gated question's preconditions are satisfiable
 * along the intended path, the cited chain meets the scoringSpec under the
 * strength hierarchy, null cases carry enough corroboration for a "no perp"
 * conclusion, and trait vectors are present and clamped with the ME and DA
 * exempt. An unanchored lie, an unreachable refuter, or an unsatisfiable
 * confront precondition is a generation bug, not a valid case.
 */

import type { CaseBible, Id } from "../types/caseBible.js";
import type { IntendedSolution } from "./skeleton.js";
import { initialLocation } from "../runner/state.js";
import { evidenceStrength, meFactIds } from "../runner/rules.js";

export interface ReachabilitySets {
  reachableClueIds: Set<Id>;
  reachableFactIds: Set<Id>;
  askedQuestionIds: Set<Id>;
}

/** What a player can actually obtain along the intended plan. */
export function computeReachability(bible: CaseBible, solution: IntendedSolution): ReachabilitySets {
  // Simulate the plan's location to find where searches happen.
  const searchedLocations = new Set<Id>();
  let loc = initialLocation(bible);
  const askedQuestionIds = new Set<Id>();
  for (const step of solution.steps) {
    if (step.kind === "travel") loc = step.locationId;
    else if (step.kind === "search") searchedLocations.add(loc);
    else askedQuestionIds.add(step.questionId);
  }

  const locById = new Map(bible.locations.map((l) => [l.locationId, l]));
  const reachableClueIds = new Set<Id>();
  for (const clue of bible.clues) {
    const clueLoc = locById.get(clue.locationId);
    if ((clueLoc && clueLoc.mandatoryPass) || searchedLocations.has(clue.locationId)) {
      reachableClueIds.add(clue.clueId);
    }
  }

  // Facts the player can learn: revealed by an asked question, supported by a
  // reachable clue, or an ME finding revealed by an asked ME question.
  const reachableFactIds = new Set<Id>();
  const claimById = new Map(bible.claims.map((c) => [c.claimId, c]));
  for (const q of bible.questions) {
    if (!askedQuestionIds.has(q.questionId)) continue;
    for (const claimId of q.effects?.revealsClaimIds ?? []) {
      const claim = claimById.get(claimId);
      if (claim) reachableFactIds.add(claim.factId);
    }
  }
  for (const clue of bible.clues) {
    if (!reachableClueIds.has(clue.clueId)) continue;
    for (const f of clue.supportsFactIds) reachableFactIds.add(f);
  }

  return { reachableClueIds, reachableFactIds, askedQuestionIds };
}

function evidenceExists(bible: CaseBible, id: Id): boolean {
  return bible.clues.some((c) => c.clueId === id) || bible.facts.some((f) => f.factId === id);
}

function isReachable(reach: ReachabilitySets, id: Id): boolean {
  return reach.reachableClueIds.has(id) || reach.reachableFactIds.has(id);
}

/** Returns a list of named invariant violations. Empty means the skeleton is sound. */
export function checkInvariants(bible: CaseBible, solution: IntendedSolution): string[] {
  const violations: string[] = [];
  const reach = computeReachability(bible, solution);

  // 1 and 2: anchored, reachable lies and mistakes.
  for (const claim of bible.claims) {
    if (claim.veracity === "lie") {
      const refuters = claim.refutedBy ?? [];
      if (refuters.length === 0) {
        violations.push(`lie ${claim.claimId} has no refutedBy (unanchored lie)`);
        continue;
      }
      for (const id of refuters) {
        if (!evidenceExists(bible, id)) violations.push(`lie ${claim.claimId}: refuter ${id} does not exist`);
      }
      if (!refuters.some((id) => isReachable(reach, id))) {
        violations.push(`lie ${claim.claimId}: no refuter is reachable along the intended path (unreachable refuter)`);
      }
    }
    if (claim.veracity === "mistaken") {
      const correctors = claim.correctedBy ?? [];
      if (correctors.length === 0) {
        violations.push(`mistake ${claim.claimId} has no correctedBy (unanchored mistake)`);
        continue;
      }
      for (const id of correctors) {
        if (!evidenceExists(bible, id)) violations.push(`mistake ${claim.claimId}: corrector ${id} does not exist`);
      }
      if (!correctors.some((id) => isReachable(reach, id))) {
        violations.push(`mistake ${claim.claimId}: no corrector is reachable along the intended path`);
      }
    }
  }

  // 3: gated question preconditions satisfiable along the path.
  for (const q of bible.questions) {
    if (q.tier === 1) continue;
    for (const id of q.preconditions?.cluesHeld ?? []) {
      if (!reach.reachableClueIds.has(id)) {
        violations.push(`question ${q.questionId} (tier ${q.tier}): precondition clue ${id} is unreachable`);
      }
    }
    for (const id of q.preconditions?.contradictionsFound ?? []) {
      // The contradiction around a claim is findable only if that claim and a
      // refuter/corrector are both reachable.
      const claim = bible.claims.find((c) => c.claimId === id);
      const anchors = claim ? [...(claim.refutedBy ?? []), ...(claim.correctedBy ?? [])] : [];
      if (!anchors.some((a) => isReachable(reach, a))) {
        violations.push(`question ${q.questionId} (tier ${q.tier}): contradiction precondition ${id} is unsatisfiable`);
      }
    }
  }

  // 4: the cited chain meets the scoringSpec under the strength hierarchy.
  const core = bible.scoringSpec.minimumSufficientChain ?? bible.scoringSpec.requiredEvidenceChain;
  const citedIds = new Set(solution.accusation.citedChain.map((r) => r.id));
  for (const ref of core) {
    if (!citedIds.has(ref.id)) violations.push(`intended chain omits required core evidence ${ref.id}`);
    if (!isReachable(reach, ref.id)) violations.push(`required core evidence ${ref.id} is unreachable`);
  }
  const hasStrongCited = solution.accusation.citedChain.some((ref) => evidenceStrength(bible, ref) === 3);
  if (!hasStrongCited) {
    violations.push("intended chain rests only on testimony; it needs a physical or ME item (strength hierarchy)");
  }

  // 5: null cases need enough corroboration for a confident "no perp".
  if (["accident", "suicide", "natural"].includes(bible.resolution.class)) {
    if (solution.accusation.accusedId !== null) {
      violations.push("null-resolution case has a non-null accused in its intended solution");
    }
    const corroboratedFacts = bible.corroborationMap.filter((e) => e.bearing.length >= 2).length;
    if (corroboratedFacts < 2) {
      violations.push("null-resolution case lacks enough corroboratable evidence for a confident no-perp conclusion");
    }
  }

  // 6: trait vectors present and clamped, with ME and DA exempt.
  const meFacts = meFactIds(bible); // touch rules so the dependency is explicit
  void meFacts;
  for (const c of bible.characters) {
    const exemptRole = c.role === "medicalExaminer" || c.role === "districtAttorney";
    if (exemptRole) {
      if (!c.traitExempt) violations.push(`character ${c.characterId} (${c.role}) must be traitExempt`);
      continue;
    }
    if (c.traitExempt) violations.push(`character ${c.characterId} (${c.role}) must not be traitExempt`);
    if (!c.traits) {
      violations.push(`character ${c.characterId} is missing a trait vector`);
      continue;
    }
    for (const [trait, value] of Object.entries(c.traits)) {
      if (typeof value !== "number" || value < 0 || value > 100) {
        violations.push(`character ${c.characterId}: trait ${trait} out of range (${value})`);
      }
    }
  }

  return violations;
}
