/**
 * Player state model and low-level transitions for the headless runner.
 *
 * State is a plain, serializable object. The transitions here apply changes and
 * append to the transcript, but contain no terminal I/O and no decision logic.
 * All decisions (what is available, what a question costs, what flags appear,
 * the verdict) live in rules.ts so the Unity port can mirror them. See RULES.md.
 */

import type { CaseBible, Id } from "../types/caseBible.js";

/** A fact or claim card the player has placed into the timeline view. */
export interface TimelineCard {
  kind: "fact" | "claim";
  id: Id;
  label: string;
  /** Display time string (a point "HH:MM" or a window "HH:MM to HH:MM"). */
  time: string;
}

/** A link drawn on the clue board between two held nodes. */
export interface ClueLink {
  fromId: Id;
  toId: Id;
  /** True when the truth layer supports the link (the two nodes co-bear on a fact). */
  supported: boolean;
}

export interface PlayerState {
  currentLocation: Id;
  cluesHeld: Id[];
  claimsHeard: Id[];
  questionsAsked: Id[];
  /** Questions explicitly unlocked by asking another question (effects.unlocksQuestionIds). */
  unlockedQuestions: Id[];
  /** Full-budget questions spent, keyed by witness characterId. */
  budgetSpent: Record<string, number>;
  /** Extra questions granted by the relevance bonus, keyed by witness characterId. */
  bonusGranted: Record<string, number>;
  /** Questions that have already counted toward a relevance bonus, by witness. */
  bonusCountedQuestions: Record<string, Id[]>;
  /** Keys of matrix entries the player has surfaced (holds both sources). */
  contradictionsFound: string[];
  /** Claim ids the player has confronted through a tier-3 question. */
  resolvedContradictions: Id[];
  timeline: TimelineCard[];
  clueBoard: ClueLink[];
  transcript: string[];
}

/** Pick the starting location: the crime scene if present, else the first location. */
export function initialLocation(bible: CaseBible): Id {
  const scene = bible.locations.find((l) => l.kind === "crimeScene");
  return (scene ?? bible.locations[0]).locationId;
}

export function initialState(bible: CaseBible): PlayerState {
  return {
    currentLocation: initialLocation(bible),
    cluesHeld: [],
    claimsHeard: [],
    questionsAsked: [],
    unlockedQuestions: [],
    budgetSpent: {},
    bonusGranted: {},
    bonusCountedQuestions: {},
    contradictionsFound: [],
    resolvedContradictions: [],
    timeline: [],
    clueBoard: [],
    transcript: [],
  };
}

export function log(state: PlayerState, line: string): void {
  state.transcript.push(line);
}

export function travelTo(state: PlayerState, locationId: Id): void {
  state.currentLocation = locationId;
}

export function discoverClue(state: PlayerState, clueId: Id): boolean {
  if (state.cluesHeld.includes(clueId)) return false;
  state.cluesHeld.push(clueId);
  return true;
}

export function hearClaim(state: PlayerState, claimId: Id): boolean {
  if (state.claimsHeard.includes(claimId)) return false;
  state.claimsHeard.push(claimId);
  return true;
}

export function markAsked(state: PlayerState, questionId: Id): void {
  if (!state.questionsAsked.includes(questionId)) state.questionsAsked.push(questionId);
}

export function spendBudget(state: PlayerState, characterId: Id, amount: number): void {
  state.budgetSpent[characterId] = (state.budgetSpent[characterId] ?? 0) + amount;
}

export function unlockQuestions(state: PlayerState, questionIds: Id[]): void {
  for (const id of questionIds) {
    if (!state.unlockedQuestions.includes(id)) state.unlockedQuestions.push(id);
  }
}

export function recordContradiction(state: PlayerState, key: string): boolean {
  if (state.contradictionsFound.includes(key)) return false;
  state.contradictionsFound.push(key);
  return true;
}

export function resolveContradiction(state: PlayerState, claimId: Id): void {
  if (!state.resolvedContradictions.includes(claimId)) state.resolvedContradictions.push(claimId);
}

/** Apply a relevance bonus: grant +3 to a witness and mark the triggering questions counted. */
export function applyRelevanceBonus(
  state: PlayerState,
  characterId: Id,
  triggeringQuestionIds: Id[],
  bonusAmount: number,
): void {
  state.bonusGranted[characterId] = (state.bonusGranted[characterId] ?? 0) + bonusAmount;
  const counted = state.bonusCountedQuestions[characterId] ?? [];
  for (const id of triggeringQuestionIds) {
    if (!counted.includes(id)) counted.push(id);
  }
  state.bonusCountedQuestions[characterId] = counted;
}
