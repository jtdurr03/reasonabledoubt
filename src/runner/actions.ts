/**
 * Orchestration layer: composes the pure rules (rules.ts) with state
 * transitions (state.ts) into the player actions the loop supports. Each action
 * returns human-readable event messages but prints nothing, so both the CLI and
 * the autosolver can drive the same engine. No comparison or scoring logic lives
 * here; it calls into rules.ts.
 */

import type { CaseBible, Id } from "../types/caseBible.js";
import type { DialogueProvider } from "../engineB/cache.js";
import {
  type PlayerState,
  discoverClue,
  hearClaim,
  markAsked,
  spendBudget,
  unlockQuestions,
  recordContradiction,
  resolveContradiction,
  applyRelevanceBonus,
  travelTo,
  log,
} from "./state.js";
import {
  RELEVANCE_BONUS,
  availableQuestions,
  canAsk,
  characterById,
  claimById,
  clueById,
  detectRelevanceBonus,
  factById,
  isLinkSupported,
  matrixEntryKey,
  newlyVisibleContradictions,
  questionCost,
  severityLabel,
  timelineConflicts,
  undiscoveredCluesAt,
} from "./rules.js";

export interface ActionResult {
  ok: boolean;
  messages: string[];
}

function ok(messages: string[]): ActionResult {
  return { ok: true, messages };
}
function fail(message: string): ActionResult {
  return { ok: false, messages: [message] };
}

/** Surface any contradictions newly visible (both sources now held), recording each. */
export function flagNewContradictions(bible: CaseBible, state: PlayerState): string[] {
  const messages: string[] = [];
  for (const e of newlyVisibleContradictions(bible, state)) {
    recordContradiction(state, matrixEntryKey(e));
    const label = severityLabel(e.band);
    messages.push(
      `Contradiction flag [${label}]: ${e.sourceA} and ${e.sourceB} disagree on ${e.factId} ` +
        `(${e.type}, ${e.band}, raw ${round(e.rawDistance)}, severity ${round(e.severity)}).`,
    );
  }
  return messages;
}

/** Grant the relevance bonus to any witness that newly qualifies. */
export function reconcileBonus(bible: CaseBible, state: PlayerState): string[] {
  const messages: string[] = [];
  for (const delta of detectRelevanceBonus(bible, state)) {
    applyRelevanceBonus(state, delta.characterId, delta.triggeringQuestionIds, RELEVANCE_BONUS);
    const name = characterById(bible, delta.characterId)?.name ?? delta.characterId;
    messages.push(
      `New evidence opens a fresh line of questioning for ${name}: +${RELEVANCE_BONUS} questions.`,
    );
  }
  return messages;
}

export function doTravel(bible: CaseBible, state: PlayerState, locationId: Id): ActionResult {
  if (!bible.locations.some((l) => l.locationId === locationId)) return fail(`No such location: ${locationId}.`);
  travelTo(state, locationId);
  const name = bible.locations.find((l) => l.locationId === locationId)!.name;
  const msg = `You travel to ${name}.`;
  log(state, msg);
  return ok([msg]);
}

export function doSearch(bible: CaseBible, state: PlayerState): ActionResult {
  const found = undiscoveredCluesAt(bible, state, state.currentLocation);
  if (found.length === 0) return ok(["You search the area and find nothing new."]);

  const messages: string[] = [];
  for (const clue of found) {
    discoverClue(state, clue.clueId);
    const m = `Found ${clue.clueId}: ${describeValue(bible, clue.type, clue.value)} (${clue.discoveryMethod}).`;
    messages.push(m);
    log(state, m);
  }
  messages.push(...reconcileBonus(bible, state));
  messages.push(...flagNewContradictions(bible, state));
  return ok(messages);
}

export function doAsk(
  bible: CaseBible,
  state: PlayerState,
  characterId: Id,
  questionId: Id,
  dialogue?: DialogueProvider,
): ActionResult {
  const q = bible.questions.find((x) => x.questionId === questionId);
  if (!q) return fail(`No such question: ${questionId}.`);
  if (!canAsk(bible, state, characterId, q)) return fail(`That question is not available right now.`);

  markAsked(state, questionId);
  const cost = questionCost(q);
  if (cost > 0) spendBudget(state, characterId, cost);

  const messages: string[] = [];
  messages.push(`You ask: "${q.text}"`);

  // Engine B (step four) only changes how an answer reads, never which answer is
  // given. The factual spine is the fallback; a baked performed line replaces it
  // for delivery when the dialogue artifact has one.
  const stateKey = q.tier === 3 ? "confront" : "base";
  for (const claimId of q.effects?.revealsClaimIds ?? []) {
    if (hearClaim(state, claimId)) {
      const claim = claimById(bible, claimId);
      const spine = claim?.factualSpine ?? describeClaim(bible, claimId);
      const performed = claim
        ? dialogue?.getLine(claim.characterId, q.questionId, claimId, stateKey)
        : undefined;
      const speaker = characterById(bible, claim?.characterId ?? "")?.name ?? "Witness";
      const m = `${speaker}: "${performed ?? spine}"`;
      messages.push(m);
      log(state, m);
    }
  }

  unlockQuestions(state, q.effects?.unlocksQuestionIds ?? []);

  // A tier-3 confront deploys (resolves) the contradiction it references.
  if (q.tier === 3 && q.contradictionRef) {
    resolveContradiction(state, q.contradictionRef.claimId);
    messages.push(`You confront the contradiction around ${q.contradictionRef.claimId}.`);
  }

  // Hearing claims can complete a contradiction pair.
  messages.push(...flagNewContradictions(bible, state));
  return ok(messages);
}

export function doPlaceTimeline(bible: CaseBible, state: PlayerState, kind: "fact" | "claim", id: Id): ActionResult {
  if (state.timeline.some((c) => c.id === id)) return fail(`${id} is already on the timeline.`);
  let time: string;
  let label: string;
  if (kind === "fact") {
    const f = factById(bible, id);
    if (!f || f.type !== "time") return fail(`${id} is not a time-typed fact.`);
    time = describeTime(f.value);
    label = f.summary ?? id;
  } else {
    const cl = claimById(bible, id);
    if (!cl) return fail(`No such claim: ${id}.`);
    if (factById(bible, cl.factId)?.type !== "time") return fail(`${id} is not a time-typed claim.`);
    time = describeTime(cl.statedValue);
    label = cl.factualSpine ?? id;
  }
  state.timeline.push({ kind, id, label, time });
  const messages = [`Placed ${id} on the timeline at ${time}.`];
  log(state, messages[0]);

  // Any conflict among placed cards is the same flag system, rendered as a timeline.
  for (const e of timelineConflicts(bible, state)) {
    if (recordContradiction(state, matrixEntryKey(e))) {
      const m = `Timeline conflict [${severityLabel(e.band)}]: ${e.sourceA} and ${e.sourceB} clash on ${e.factId} (raw ${round(e.rawDistance)}).`;
      messages.push(m);
      log(state, m);
    }
  }
  return ok(messages);
}

export function doLink(bible: CaseBible, state: PlayerState, fromId: Id, toId: Id): ActionResult {
  const supported = isLinkSupported(bible, fromId, toId);
  state.clueBoard.push({ fromId, toId, supported });
  const msg = supported
    ? `Linked ${fromId} to ${toId}. The evidence supports this connection.`
    : `Linked ${fromId} to ${toId}. Noted, but the evidence does not support this connection (inert).`;
  log(state, msg);
  return ok([msg]);
}

/* ------------------------------------------------------------------ */
/* Small display helpers (no game logic)                               */
/* ------------------------------------------------------------------ */

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function describeTime(value: unknown): string {
  const v = value as { kind?: string; at?: string; start?: string; end?: string };
  if (v.kind === "point") return v.at ?? "?";
  if (v.kind === "window") return `${v.start} to ${v.end}`;
  return JSON.stringify(value);
}

export function describeValue(_bible: CaseBible, type: string, value: unknown): string {
  if (type === "time") return `time ${describeTime(value)}`;
  return `${type}: ${JSON.stringify(value)}`;
}

export function describeClaim(bible: CaseBible, claimId: Id): string {
  const c = claimById(bible, claimId);
  if (!c) return claimId;
  const f = factById(bible, c.factId);
  return describeValue(bible, f?.type ?? "?", c.statedValue);
}

export { availableQuestions };
