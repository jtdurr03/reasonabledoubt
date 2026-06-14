/**
 * The comparator's public API.
 *
 *   compare(a, b)                  one type-aware comparison.
 *   computeContradictionMatrix     every claim-involving pair, per fact.
 *   computeCorroborationMap        agreeing groups per fact, with a hidden,
 *                                  veracity-derived classification.
 *
 * Pure and deterministic over bible data. No game engine, network, or LLM.
 *
 * The decoupling rule, stated once and obeyed everywhere below: distance and
 * band come only from values. Veracity is read only by the corroboration
 * classifier, and only to label an agreement that distance already found. A
 * small lie and a small honest slip produce identical distances and identical
 * bands. The comparator never infers veracity from magnitude.
 */

import type {
  CaseBible,
  Claim,
  Clue,
  Fact,
  IdentityValue,
  CountValue,
  EventValue,
  LocationValue,
  ObjectValue,
  RelationshipValue,
  TimeValue,
} from "../types/caseBible.js";
import type {
  Comparand,
  CompareResult,
  ContradictionEntry,
  CorroborationClass,
  CorroborationMember,
  CorroborationResult,
  DerivedData,
  SourceKind,
} from "./types.js";
import { COMPARATOR_VERSION } from "./config.js";
import { compareTime } from "./metrics/time.js";
import { compareLocation } from "./metrics/location.js";
import { compareCount } from "./metrics/count.js";
import { compareIdentity } from "./metrics/identity.js";
import { compareObject } from "./metrics/object.js";
import { compareEvent } from "./metrics/event.js";
import { compareRelationship } from "./metrics/relationship.js";

/** One type-aware comparison. Returns an incomparable result rather than throwing. */
export function compare(a: Comparand, b: Comparand): CompareResult {
  if (a.type !== b.type) {
    return {
      comparable: false,
      reason: `cannot compare a ${a.type} value against a ${b.type} value`,
      aType: a.type,
      bType: b.type,
    };
  }

  switch (a.type) {
    case "time":
      return compareTime(a.value as TimeValue, b.value as TimeValue);
    case "location":
      return compareLocation(a.value as LocationValue, b.value as LocationValue);
    case "count":
      return compareCount(a.value as CountValue, b.value as CountValue);
    case "identity":
      return compareIdentity(a.value as IdentityValue, b.value as IdentityValue);
    case "object":
      return compareObject(a.value as ObjectValue, b.value as ObjectValue);
    case "event":
      return compareEvent(a.value as EventValue, b.value as EventValue);
    case "relationship":
      return compareRelationship(
        a.value as RelationshipValue,
        b.value as RelationshipValue,
      );
  }
}

/* ------------------------------------------------------------------ */
/* Source assembly                                                     */
/* ------------------------------------------------------------------ */

interface Source {
  id: string;
  kind: SourceKind;
  comparand: Comparand;
  /** Present for claim sources; used to judge independence in corroboration. */
  characterId?: string;
}

/** Fact ids referenced by the ME report; these facts count as ME findings. */
function meFactIds(bible: CaseBible): Set<string> {
  const ids = new Set<string>();
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

/**
 * Every source that bears on a fact: claims that speak to it, clues that
 * support it, and the fact itself when it is an ME finding (so claims can be
 * compared against the ME truth, as the project's corroboration rule requires).
 */
function sourcesForFact(bible: CaseBible, fact: Fact, meFacts: Set<string>): Source[] {
  const sources: Source[] = [];

  for (const claim of bible.claims) {
    if (claim.factId === fact.factId) {
      sources.push({
        id: claim.claimId,
        kind: "claim",
        comparand: { type: fact.type, value: claim.statedValue },
        characterId: claim.characterId,
      });
    }
  }

  for (const clue of bible.clues) {
    if (clue.supportsFactIds.includes(fact.factId)) {
      sources.push({
        id: clue.clueId,
        kind: "clue",
        comparand: { type: clue.type, value: clue.value },
      });
    }
  }

  if (meFacts.has(fact.factId)) {
    sources.push({
      id: fact.factId,
      kind: "fact",
      comparand: { type: fact.type, value: fact.value },
    });
  }

  return sources;
}

/** A pair is in scope for the matrix only when at least one side is a claim. */
function involvesClaim(a: Source, b: Source): boolean {
  return a.kind === "claim" || b.kind === "claim";
}

/* ------------------------------------------------------------------ */
/* Contradiction matrix                                                */
/* ------------------------------------------------------------------ */

export function computeContradictionMatrix(bible: CaseBible): ContradictionEntry[] {
  const meFacts = meFactIds(bible);
  const entries: ContradictionEntry[] = [];

  for (const fact of bible.facts) {
    const sources = sourcesForFact(bible, fact, meFacts);
    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const a = sources[i];
        const b = sources[j];
        if (!involvesClaim(a, b)) continue;
        const result = compare(a.comparand, b.comparand);
        if (!result.comparable) continue; // shares factId, so types should match; skip defensively
        entries.push({
          factId: fact.factId,
          type: result.type,
          sourceA: a.id,
          sourceAKind: a.kind,
          sourceB: b.id,
          sourceBKind: b.kind,
          rawDistance: result.rawDistance,
          severity: result.severity,
          band: result.band,
        });
      }
    }
  }

  return entries;
}

/* ------------------------------------------------------------------ */
/* Corroboration map                                                   */
/* ------------------------------------------------------------------ */

export function computeCorroborationMap(bible: CaseBible): CorroborationResult[] {
  const meFacts = meFactIds(bible);
  const claimById = new Map<string, Claim>(bible.claims.map((c) => [c.claimId, c]));
  const results: CorroborationResult[] = [];

  for (const fact of bible.facts) {
    const sources = sourcesForFact(bible, fact, meFacts);
    const pairs: CorroborationResult["pairs"] = [];
    const memberIds = new Set<string>();
    const memberKind = new Map<string, SourceKind>();
    let corroborated = false;

    for (let i = 0; i < sources.length; i++) {
      for (let j = i + 1; j < sources.length; j++) {
        const a = sources[i];
        const b = sources[j];
        if (!involvesClaim(a, b)) continue;
        const result = compare(a.comparand, b.comparand);
        if (!result.comparable || result.band !== "agreement") continue;

        pairs.push({ a: a.id, b: b.id, severity: result.severity, band: result.band });
        memberIds.add(a.id);
        memberKind.set(a.id, a.kind);
        memberIds.add(b.id);
        memberKind.set(b.id, b.kind);

        // Corroboration is met by two independent claims agreeing, or a claim
        // agreeing with a clue or an ME fact.
        if (a.kind === "claim" && b.kind === "claim") {
          if (a.characterId !== b.characterId) corroborated = true;
        } else {
          corroborated = true; // one side is a claim (involvesClaim), the other a clue or ME fact
        }
      }
    }

    if (pairs.length === 0) continue; // nothing agrees on this fact

    const members: CorroborationMember[] = [...memberIds].map((id) => ({
      sourceId: id,
      kind: memberKind.get(id)!,
    }));

    results.push({
      factId: fact.factId,
      members,
      pairs,
      corroborated,
      classification: classifyCorroboration(members, claimById, bible),
    });
  }

  return results;
}

/**
 * Hidden classification, derived from authored veracity and narrative role,
 * never from distance:
 *   collusive        : two or more agreeing claims, all part of the collusion
 *                      (narrativeRole "surface" in a collusion case).
 *   mistakenConsensus: two or more agreeing claims, all tagged mistaken.
 *   genuine          : everything else (the default).
 *
 * This label is hidden from the player and the dialogue runtime. It is for the
 * later DA scorer only.
 */
export function classifyCorroboration(
  members: CorroborationMember[],
  claimById: Map<string, Claim>,
  bible: CaseBible,
): CorroborationClass {
  const claimMembers = members
    .filter((m) => m.kind === "claim")
    .map((m) => claimById.get(m.sourceId))
    .filter((c): c is Claim => c !== undefined);

  if (claimMembers.length >= 2) {
    const isCollusionCase = bible.resolution.class === "collusion";
    if (isCollusionCase && claimMembers.every((c) => c.narrativeRole === "surface")) {
      return "collusive";
    }
    if (claimMembers.every((c) => c.veracity === "mistaken")) {
      return "mistakenConsensus";
    }
  }

  return "genuine";
}

/* ------------------------------------------------------------------ */
/* Aggregate driver                                                    */
/* ------------------------------------------------------------------ */

/** Computes both derived structures and returns the derived block. */
export function computeDerived(bible: CaseBible): DerivedData {
  return {
    generatedBy: "comparator",
    comparatorVersion: COMPARATOR_VERSION,
    contradictionMatrix: computeContradictionMatrix(bible),
    corroboration: computeCorroborationMap(bible),
  };
}

export * from "./types.js";
