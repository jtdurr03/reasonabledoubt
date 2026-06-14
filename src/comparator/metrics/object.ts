/**
 * object metric: category first, then subtype, then attributes.
 *
 *   different category : a hard conflict (a blade versus a gun), reads as major.
 *   same category, different subtype : a moderate weight (a kitchen knife
 *                        versus a hunting knife, both blades), lands minor to
 *                        moderate.
 *   same category and subtype : near 0, plus small accumulating attribute
 *                        mismatches.
 *
 * All weights live in config.ts (OBJECT_WEIGHTS).
 */

import type { ObjectValue } from "../../types/caseBible.js";
import type { MetricResult } from "../types.js";
import { OBJECT_WEIGHTS, OBJECT_THRESHOLDS } from "../config.js";
import { classify } from "../classify.js";

export function objectDistance(a: ObjectValue, b: ObjectValue): number {
  // Category is the hard axis; a category conflict dominates everything else.
  if (a.category !== b.category) return OBJECT_WEIGHTS.categoryMismatch;

  let d = 0;
  // Subtype only matters within a shared category. Treat a defined-vs-undefined
  // subtype as a mismatch, since one side claims a finer class the other does not.
  if ((a.subtype ?? "") !== (b.subtype ?? "")) d += OBJECT_WEIGHTS.subtypeMismatch;

  d += attributeDistance(a.attributes, b.attributes);
  return d;
}

function attributeDistance(
  a: Record<string, unknown> | undefined,
  b: Record<string, unknown> | undefined,
): number {
  if (!a || !b) return 0;
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let mismatches = 0;
  for (const k of keys) {
    // Only count keys present on both sides but with differing values. A key on
    // one side only is extra detail, not a contradiction.
    if (k in a && k in b && JSON.stringify(a[k]) !== JSON.stringify(b[k])) mismatches++;
  }
  return Math.min(
    OBJECT_WEIGHTS.attributeMismatchCap,
    mismatches * OBJECT_WEIGHTS.attributeMismatch,
  );
}

export function compareObject(a: ObjectValue, b: ObjectValue): MetricResult {
  const rawDistance = objectDistance(a, b);
  const { severity, band } = classify(rawDistance, OBJECT_THRESHOLDS);
  return { comparable: true, type: "object", rawDistance, severity, band };
}
