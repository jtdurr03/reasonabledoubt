/**
 * The pure runtime rules of the game. No terminal I/O lives here so the Unity
 * C# port can mirror this file exactly. Every rule below is specified in plain
 * language in RULES.md, which is the contract for the port.
 *
 * The runner does not compute distances or decide veracity. The comparator
 * (step two) baked the contradiction matrix and corroboration map into
 * bible.derived. These rules only decide visibility, availability, budget, and
 * the deterministic verdict.
 */

import type {
  CaseBible,
  Character,
  Claim,
  Clue,
  ContradictionEntry,
  EvidenceRef,
  Fact,
  Id,
  Question,
  Band,
} from "../types/caseBible.js";
import type { PlayerState } from "./state.js";

/* ------------------------------------------------------------------ */
/* Constants (all budget and severity tuning lives here)               */
/* ------------------------------------------------------------------ */

/** Base question budget per witness. */
export const BASE_BUDGET = 10;
/** Extra questions granted when newly found evidence is relevant to a witness. */
export const RELEVANCE_BONUS = 3;
/** Cost of a probing (budget) question. */
export const PROBE_COST = 1;
/** Cost of deploying an already found contradiction (a confront). */
export const CONFRONT_COST = 0;

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

export function factById(bible: CaseBible, id: Id): Fact | undefined {
  return bible.facts.find((f) => f.factId === id);
}
export function clueById(bible: CaseBible, id: Id): Clue | undefined {
  return bible.clues.find((c) => c.clueId === id);
}
export function claimById(bible: CaseBible, id: Id): Claim | undefined {
  return bible.claims.find((c) => c.claimId === id);
}
export function characterById(bible: CaseBible, id: Id): Character | undefined {
  return bible.characters.find((c) => c.characterId === id);
}

/** Fact ids that are ME findings (referenced by the ME report). */
export function meFactIds(bible: CaseBible): Set<Id> {
  const ids = new Set<Id>();
  const me = bible.meReport;
  if (!me) return ids;
  for (const id of [
    me.causeOfDeathFactId,
    me.timeOfDeathFactId,
    me.weaponClassFactId,
    me.defensiveWoundsFactId,
    me.toxicologyFactId,
  ]) {
    if (id) ids.add(id);
  }
  return ids;
}

/* ------------------------------------------------------------------ */
/* Travel and presence                                                 */
/* ------------------------------------------------------------------ */

/**
 * Where a character currently is. This runner keeps characters at their home
 * location. The model supports movement (placement.canMove and altLocationId),
 * but no movement trigger fires in this step; a later step can add triggers.
 */
export function characterLocation(character: Character): Id {
  return character.placement.homeLocationId;
}

export function charactersAt(bible: CaseBible, locationId: Id): Character[] {
  return bible.characters.filter((c) => characterLocation(c) === locationId);
}

/** Characters the player can interview here: present, not the victim, and with at least one question. */
export function interviewablesAt(bible: CaseBible, locationId: Id): Character[] {
  return charactersAt(bible, locationId).filter(
    (c) => c.role !== "victim" && questionsForCharacter(bible, c.characterId).length > 0,
  );
}

export function cluesAt(bible: CaseBible, locationId: Id): Clue[] {
  return bible.clues.filter((c) => c.locationId === locationId);
}

export function undiscoveredCluesAt(bible: CaseBible, state: PlayerState, locationId: Id): Clue[] {
  return cluesAt(bible, locationId).filter((c) => !state.cluesHeld.includes(c.clueId));
}

/* ------------------------------------------------------------------ */
/* Holding sources                                                     */
/* ------------------------------------------------------------------ */

/**
 * Whether the player holds a comparison source.
 *   claim: heard it.
 *   clue:  discovered it.
 *   fact:  knows it, defined as having heard a claim about it or holding a clue
 *          that supports it (this is how an ME finding becomes "held").
 */
export function holdsSource(
  bible: CaseBible,
  state: PlayerState,
  kind: "claim" | "clue" | "fact",
  id: Id,
): boolean {
  if (kind === "claim") return state.claimsHeard.includes(id);
  if (kind === "clue") return state.cluesHeld.includes(id);
  // fact
  if (state.claimsHeard.some((cid) => claimById(bible, cid)?.factId === id)) return true;
  if (state.cluesHeld.some((cid) => clueById(bible, cid)?.supportsFactIds.includes(id))) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Corroboration helpers (read the baked map)                          */
/* ------------------------------------------------------------------ */

export function isFactCorroborated(bible: CaseBible, factId: Id): boolean {
  return bible.derived?.corroboration.some((c) => c.factId === factId && c.corroborated) ?? false;
}

/** A claim id is "corroborated" when it is a member of a corroborated fact's group. */
export function isClaimCorroborated(bible: CaseBible, claimId: Id): boolean {
  return (
    bible.derived?.corroboration.some(
      (c) => c.corroborated && c.members.some((m) => m.sourceId === claimId),
    ) ?? false
  );
}

/** Satisfies a precondition id that may name either a fact or a claim. */
function corroborationSatisfied(bible: CaseBible, id: Id): boolean {
  return isFactCorroborated(bible, id) || isClaimCorroborated(bible, id);
}

/* ------------------------------------------------------------------ */
/* Question availability and budget                                    */
/* ------------------------------------------------------------------ */

export function questionsForCharacter(bible: CaseBible, characterId: Id): Question[] {
  const character = characterById(bible, characterId);
  return bible.questions.filter((q) => {
    if ("characterId" in q.target && q.target.characterId) return q.target.characterId === characterId;
    if ("role" in q.target && q.target.role) return character?.role === q.target.role;
    return false;
  });
}

/** Questions that are explicitly unlock-gated (some other question lists them in unlocksQuestionIds). */
export function unlockGatedQuestionIds(bible: CaseBible): Set<Id> {
  const ids = new Set<Id>();
  for (const q of bible.questions) {
    for (const id of q.effects?.unlocksQuestionIds ?? []) ids.add(id);
  }
  return ids;
}

/** Whether a question's evidence preconditions (clues, corroboration, contradictions) are met. */
export function preconditionsMet(bible: CaseBible, state: PlayerState, q: Question): boolean {
  const pre = q.preconditions;
  if (!pre) return true;
  for (const id of pre.cluesHeld ?? []) if (!state.cluesHeld.includes(id)) return false;
  for (const id of pre.claimsCorroborated ?? []) if (!corroborationSatisfied(bible, id)) return false;
  for (const id of pre.contradictionsFound ?? []) {
    // Satisfied when the player has found a contradiction involving that claim id.
    const found = state.contradictionsFound.some((key) => key.includes(id));
    if (!found) return false;
  }
  return true;
}

/** Full availability for asking: targeted, not asked, unlock satisfied, preconditions met. */
export function isQuestionAvailable(bible: CaseBible, state: PlayerState, q: Question): boolean {
  if (state.questionsAsked.includes(q.questionId)) return false;
  if (unlockGatedQuestionIds(bible).has(q.questionId) && !state.unlockedQuestions.includes(q.questionId)) {
    return false;
  }
  return preconditionsMet(bible, state, q);
}

export function availableQuestions(bible: CaseBible, state: PlayerState, characterId: Id): Question[] {
  return questionsForCharacter(bible, characterId).filter((q) => isQuestionAvailable(bible, state, q));
}

export function questionCost(q: Question): number {
  return q.costsBudget ? PROBE_COST : CONFRONT_COST;
}

export interface BudgetInfo {
  base: number;
  bonus: number;
  limit: number;
  spent: number;
  remaining: number;
}

export function budgetInfo(state: PlayerState, characterId: Id): BudgetInfo {
  const base = BASE_BUDGET;
  const bonus = state.bonusGranted[characterId] ?? 0;
  const spent = state.budgetSpent[characterId] ?? 0;
  const limit = base + bonus;
  return { base, bonus, limit, spent, remaining: limit - spent };
}

/** A question can be asked if available and either free or within remaining budget. */
export function canAsk(bible: CaseBible, state: PlayerState, characterId: Id, q: Question): boolean {
  if (!isQuestionAvailable(bible, state, q)) return false;
  const cost = questionCost(q);
  if (cost === 0) return true;
  return budgetInfo(state, characterId).remaining >= cost;
}

export function tierLabel(tier: 1 | 2 | 3): string {
  return tier === 1 ? "baseline" : tier === 2 ? "clue-gated" : "confront";
}

/* ------------------------------------------------------------------ */
/* Relevance bonus                                                     */
/* ------------------------------------------------------------------ */

/** A question is evidence-gated if it has any non-empty evidence precondition. */
export function isEvidenceGated(q: Question): boolean {
  const pre = q.preconditions;
  if (!pre) return false;
  return (
    (pre.cluesHeld?.length ?? 0) > 0 ||
    (pre.claimsCorroborated?.length ?? 0) > 0 ||
    (pre.contradictionsFound?.length ?? 0) > 0
  );
}

export interface RelevanceBonusDelta {
  characterId: Id;
  triggeringQuestionIds: Id[];
}

/**
 * Detect which witnesses earn the relevance bonus right now: a witness whose
 * evidence-gated question(s) have their evidence preconditions satisfied and
 * have not yet counted toward a bonus. One bonus per witness per detection,
 * regardless of how many questions newly qualify. Distinct later discoveries
 * can grant further bonuses. Run this after acquiring evidence (a clue or a
 * found contradiction), not after ordinary testimony.
 */
export function detectRelevanceBonus(bible: CaseBible, state: PlayerState): RelevanceBonusDelta[] {
  const deltas: RelevanceBonusDelta[] = [];
  for (const character of bible.characters) {
    if (character.role === "victim") continue;
    const counted = state.bonusCountedQuestions[character.characterId] ?? [];
    const newlyQualified = questionsForCharacter(bible, character.characterId).filter(
      (q) => isEvidenceGated(q) && preconditionsMet(bible, state, q) && !counted.includes(q.questionId),
    );
    if (newlyQualified.length > 0) {
      deltas.push({ characterId: character.characterId, triggeringQuestionIds: newlyQualified.map((q) => q.questionId) });
    }
  }
  return deltas;
}

/* ------------------------------------------------------------------ */
/* Contradiction flags (read the baked matrix, decide visibility)      */
/* ------------------------------------------------------------------ */

export function matrixEntryKey(e: ContradictionEntry): string {
  return `${e.factId}|${e.sourceA}|${e.sourceB}`;
}

/** Severity label for a band: agreement is no flag, then faint, noticeable, loud. */
export function severityLabel(band: Band): "none" | "faint" | "noticeable" | "loud" {
  switch (band) {
    case "agreement":
      return "none";
    case "minor":
      return "faint";
    case "moderate":
      return "noticeable";
    case "major":
      return "loud";
  }
}

/** Matrix entries the player can currently see: a real disagreement whose both sources are held. */
export function visibleContradictions(bible: CaseBible, state: PlayerState): ContradictionEntry[] {
  const matrix = bible.derived?.contradictionMatrix ?? [];
  return matrix.filter(
    (e) =>
      e.band !== "agreement" &&
      holdsSource(bible, state, e.sourceAKind, e.sourceA) &&
      holdsSource(bible, state, e.sourceBKind, e.sourceB),
  );
}

/** Contradictions visible now that are not yet recorded in state. */
export function newlyVisibleContradictions(bible: CaseBible, state: PlayerState): ContradictionEntry[] {
  return visibleContradictions(bible, state).filter(
    (e) => !state.contradictionsFound.includes(matrixEntryKey(e)),
  );
}

/* ------------------------------------------------------------------ */
/* Timeline                                                            */
/* ------------------------------------------------------------------ */

/** Whether a fact or claim is time-typed and so placeable on the timeline. */
export function isTimePlaceable(bible: CaseBible, kind: "fact" | "claim", id: Id): boolean {
  if (kind === "fact") return factById(bible, id)?.type === "time";
  const claim = claimById(bible, id);
  return claim ? factById(bible, claim.factId)?.type === "time" : false;
}

/**
 * Conflicts among placed timeline cards: matrix entries (non-agreement) whose
 * both sources are cards currently on the timeline. This is the same flag
 * system rendered as a timeline.
 */
export function timelineConflicts(bible: CaseBible, state: PlayerState): ContradictionEntry[] {
  const placed = new Set(state.timeline.map((card) => card.id));
  const matrix = bible.derived?.contradictionMatrix ?? [];
  return matrix.filter((e) => e.band !== "agreement" && placed.has(e.sourceA) && placed.has(e.sourceB));
}

/* ------------------------------------------------------------------ */
/* Clue board                                                          */
/* ------------------------------------------------------------------ */

/** Facts a node bears on: a claim's factId, or a clue's supported facts, or the fact itself. */
function factsBorneBy(bible: CaseBible, nodeId: Id): Set<Id> {
  const facts = new Set<Id>();
  const claim = claimById(bible, nodeId);
  if (claim) facts.add(claim.factId);
  const clue = clueById(bible, nodeId);
  if (clue) for (const f of clue.supportsFactIds) facts.add(f);
  if (factById(bible, nodeId)) facts.add(nodeId);
  return facts;
}

/** A clue-board link is truth-supported when both nodes bear on a common fact. */
export function isLinkSupported(bible: CaseBible, fromId: Id, toId: Id): boolean {
  const a = factsBorneBy(bible, fromId);
  const b = factsBorneBy(bible, toId);
  for (const f of a) if (b.has(f)) return true;
  return false;
}

/* ------------------------------------------------------------------ */
/* Verdict scorer (the canonical, pure scorer reused by step ten)      */
/* ------------------------------------------------------------------ */

export interface Accusation {
  /** Character id of the accused, or null to declare "no perp". */
  accusedId: Id | null;
  /** The evidence chain the player cites from their clue board. */
  citedChain: EvidenceRef[];
  /** Claim ids the player confronted (resolved) through tier-3 questions. */
  resolvedContradictions?: Id[];
}

export interface CitedStrength {
  ref: EvidenceRef;
  strength: 1 | 2 | 3;
  label: string;
}

export interface VerdictResult {
  outcome: "win" | "lose";
  accusedId: Id | null;
  correctTarget: Id | null;
  targetCorrect: boolean;
  chainSufficient: boolean;
  missingCore: EvidenceRef[];
  strengthOk: boolean;
  citedStrength: CitedStrength[];
  unexplained: string[];
  thoroughness: number;
  reasons: string[];
}

/** The strength tier of a cited evidence item under the hierarchy. */
export function evidenceStrength(bible: CaseBible, ref: EvidenceRef): 1 | 2 | 3 {
  if (ref.kind === "clue") return 3; // physical evidence
  // fact
  if (meFactIds(bible).has(ref.id)) return 3; // ME finding
  if (isFactCorroborated(bible, ref.id)) return 2; // corroborated testimony
  return 1; // single statement
}

function strengthLabel(strength: 1 | 2 | 3): string {
  return strength === 3 ? "physical or ME (strongest)" : strength === 2 ? "corroborated testimony" : "single statement";
}

/** The correct accusation target implied by the resolution. */
export function correctTarget(bible: CaseBible): Id | null {
  const r = bible.resolution;
  switch (r.class) {
    case "perp":
      return r.perpCharacterId;
    case "framing":
      return r.offenderId;
    case "collusion":
      // Basic support: the player must name a colluder (step ten raises the bar).
      return r.colluderIds[0] ?? null;
    case "accident":
    case "suicide":
    case "natural":
      return null;
  }
}

/**
 * The canonical, deterministic verdict scorer. Pure: it reads the bible
 * (including the baked derived data and the scoringSpec) and the accusation,
 * and returns a verdict with reasoning. Step ten will wrap this with DA
 * dialogue and the collusion higher bar, reusing this logic.
 */
export function scoreVerdict(bible: CaseBible, accusation: Accusation): VerdictResult {
  const reasons: string[] = [];
  const target = correctTarget(bible);
  const resolved = accusation.resolvedContradictions ?? [];

  // Step A: did the player accuse the right party?
  let targetCorrect: boolean;
  if (bible.resolution.class === "collusion") {
    targetCorrect =
      accusation.accusedId !== null &&
      bible.resolution.colluderIds.includes(accusation.accusedId) &&
      accusation.accusedId !== bible.resolution.framedAgentId;
  } else {
    targetCorrect = accusation.accusedId === target;
  }

  if (!targetCorrect) {
    if (target === null && accusation.accusedId !== null) {
      reasons.push(`You named ${accusation.accusedId}, but this case has no perp. The verdict cannot hold.`);
    } else if (target !== null && accusation.accusedId === null) {
      reasons.push(`You declared no perp, but there is one. The guilty party goes free.`);
    } else {
      reasons.push(`You accused ${accusation.accusedId}, but the evidence does not point there.`);
    }
    return {
      outcome: "lose",
      accusedId: accusation.accusedId,
      correctTarget: target,
      targetCorrect: false,
      chainSufficient: false,
      missingCore: [],
      strengthOk: false,
      citedStrength: [],
      unexplained: [],
      thoroughness: 0,
      reasons,
    };
  }

  // Step B: is the cited chain sufficient (covers the minimum core)?
  const core = bible.scoringSpec.minimumSufficientChain ?? bible.scoringSpec.requiredEvidenceChain;
  const citedIds = new Set(accusation.citedChain.map((r) => r.id));
  const missingCore = core.filter((c) => !citedIds.has(c.id));
  const chainSufficient = missingCore.length === 0;

  // Step C: strength hierarchy. The chain must rest on at least one physical or ME item.
  const citedStrength: CitedStrength[] = accusation.citedChain.map((ref) => {
    const strength = evidenceStrength(bible, ref);
    return { ref, strength, label: strengthLabel(strength) };
  });
  const strengthOk = citedStrength.some((c) => c.strength === 3);

  // Step D: unexplained contradictions. For a perp case, the perp's lies must be
  // broken, either by citing all of a lie's refuting evidence or by confronting it.
  const unexplained: string[] = [];
  if (bible.resolution.class === "perp") {
    const perp = bible.resolution.perpCharacterId;
    for (const claim of bible.claims) {
      if (claim.characterId !== perp || claim.veracity !== "lie") continue;
      const brokenByEvidence = (claim.refutedBy ?? []).every((id) => citedIds.has(id));
      const brokenByConfront = resolved.includes(claim.claimId);
      if (!brokenByEvidence && !brokenByConfront) {
        unexplained.push(claim.claimId);
      }
    }
  }

  const required = bible.scoringSpec.requiredEvidenceChain;
  const citedRequired = required.filter((r) => citedIds.has(r.id)).length;
  const thoroughness = required.length === 0 ? 1 : citedRequired / required.length;

  // Win requires the right target, a sufficient core, and adequate strength.
  // Unexplained contradictions count against thoroughness and are reported, but
  // (outside collusion, which step ten handles) do not by themselves lose a case
  // whose core is proven by physical evidence.
  const outcome: "win" | "lose" = chainSufficient && strengthOk ? "win" : "lose";

  if (outcome === "win") {
    reasons.push(`Accusation of ${accusation.accusedId} is sound.`);
    reasons.push(`The cited chain covers the minimum sufficient core and rests on physical or ME evidence.`);
  } else {
    if (!chainSufficient) {
      reasons.push(`The cited chain is insufficient. Missing core evidence: ${missingCore.map((r) => r.id).join(", ")}.`);
    }
    if (!strengthOk) {
      reasons.push(`The chain rests only on testimony. Physical or ME evidence is required to carry an accusation.`);
    }
  }
  if (unexplained.length > 0) {
    reasons.push(`Left unexplained (counts against thoroughness): ${unexplained.join(", ")}.`);
  }

  return {
    outcome,
    accusedId: accusation.accusedId,
    correctTarget: target,
    targetCorrect: true,
    chainSufficient,
    missingCore,
    strengthOk,
    citedStrength,
    unexplained,
    thoroughness,
    reasons,
  };
}
