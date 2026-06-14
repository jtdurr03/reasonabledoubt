/**
 * identity metric: categorical with fuzzy edges via attributes.
 *
 * An identity value is either a direct character reference or a descriptor with
 * attributes (sex, height band, build, distinguishing marks).
 *
 *   ref vs ref        : 0 if the same character, else a hard conflict.
 *   descriptor vs descriptor : a weighted sum of attribute mismatches. Hard
 *                       attributes (sex, an incompatible height band) are
 *                       weighted so any single one reads as major. A tall man
 *                       cannot match a short woman.
 *   ref vs descriptor : a pure value metric cannot resolve the character's
 *                       physical attributes (they are not in the value), so it
 *                       returns a moderate "cannot confirm" distance. Resolving
 *                       this properly is a caller concern and out of scope here.
 *
 * All weights live in config.ts (IDENTITY_WEIGHTS).
 */

import type { IdentityValue, IdentityDescriptor } from "../../types/caseBible.js";
import type { MetricResult } from "../types.js";
import { IDENTITY_WEIGHTS, IDENTITY_THRESHOLDS } from "../config.js";
import { classify } from "../classify.js";

const HEIGHT_ORDER = ["short", "average", "tall"] as const;

function hasCharacterId(v: IdentityValue): v is { characterId: string } {
  return "characterId" in v && typeof v.characterId === "string";
}

export function identityDistance(a: IdentityValue, b: IdentityValue): number {
  const aRef = hasCharacterId(a);
  const bRef = hasCharacterId(b);

  if (aRef && bRef) {
    return a.characterId === b.characterId ? 0 : IDENTITY_WEIGHTS.differentCharacter;
  }
  if (aRef !== bRef) {
    // One reference, one descriptor: unresolvable without a character lookup.
    return IDENTITY_WEIGHTS.unresolvedRefVsDescriptor;
  }

  return descriptorDistance(
    (a as { descriptor: IdentityDescriptor }).descriptor,
    (b as { descriptor: IdentityDescriptor }).descriptor,
  );
}

function descriptorDistance(a: IdentityDescriptor, b: IdentityDescriptor): number {
  let d = 0;

  if (a.sex && b.sex && a.sex !== b.sex) d += IDENTITY_WEIGHTS.sexMismatch;

  if (a.heightBand && b.heightBand && a.heightBand !== b.heightBand) {
    const gap = Math.abs(
      HEIGHT_ORDER.indexOf(a.heightBand) - HEIGHT_ORDER.indexOf(b.heightBand),
    );
    d += gap >= 2 ? IDENTITY_WEIGHTS.heightIncompatible : IDENTITY_WEIGHTS.heightAdjacent;
  }

  if (a.build && b.build && a.build !== b.build) d += IDENTITY_WEIGHTS.buildMismatch;

  const marksA = new Set(a.distinguishingMarks ?? []);
  const marksB = new Set(b.distinguishingMarks ?? []);
  let markDiff = 0;
  for (const m of marksA) if (!marksB.has(m)) markDiff++;
  for (const m of marksB) if (!marksA.has(m)) markDiff++;
  d += Math.min(IDENTITY_WEIGHTS.markMismatchCap, markDiff * IDENTITY_WEIGHTS.markMismatch);

  return d;
}

export function compareIdentity(a: IdentityValue, b: IdentityValue): MetricResult {
  const rawDistance = identityDistance(a, b);
  const { severity, band } = classify(rawDistance, IDENTITY_THRESHOLDS);
  return { comparable: true, type: "identity", rawDistance, severity, band };
}
