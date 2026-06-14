/**
 * relationship metric: intentionally coarse for this version (noted in the
 * README).
 *
 * Compares the relation type and the two parties. A different relation type is
 * a hard mismatch (major). Same relation type with different parties is a
 * moderate partial mismatch. Same type and same parties is agreement. Direction
 * (from versus to) is treated as significant: an employer-of relationship is
 * not the same read in reverse.
 */

import type { RelationshipValue } from "../../types/caseBible.js";
import type { MetricResult } from "../types.js";
import { RELATIONSHIP_WEIGHTS, COARSE_THRESHOLDS } from "../config.js";
import { classify } from "../classify.js";

export function relationshipDistance(
  a: RelationshipValue,
  b: RelationshipValue,
): number {
  if (a.relationType !== b.relationType) return RELATIONSHIP_WEIGHTS.relationTypeMismatch;
  if (a.fromCharacterId !== b.fromCharacterId || a.toCharacterId !== b.toCharacterId) {
    return RELATIONSHIP_WEIGHTS.partyMismatch;
  }
  return 0;
}

export function compareRelationship(
  a: RelationshipValue,
  b: RelationshipValue,
): MetricResult {
  const rawDistance = relationshipDistance(a, b);
  const { severity, band } = classify(rawDistance, COARSE_THRESHOLDS);
  return { comparable: true, type: "relationship", rawDistance, severity, band };
}
