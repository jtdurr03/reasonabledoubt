/**
 * location metric: hierarchical distance over the place tree
 * (district contains building contains room).
 *
 * rawDistance is how far up the tree you must climb before the two places
 * share an ancestor:
 *   0 = same room, 1 = same building (different room),
 *   2 = same district (different building), 3 = different district.
 *
 * A level only counts as matching when both sides name it and the names are
 * equal. If one side leaves a level undefined while the other names it, that
 * level cannot be confirmed to match, so it counts as a difference at that
 * depth. This keeps the metric conservative: unknown never silently corroborates.
 */

import type { LocationValue } from "../../types/caseBible.js";
import type { MetricResult } from "../types.js";
import { LOCATION_THRESHOLDS } from "../config.js";
import { classify } from "../classify.js";

/** Returns the tree distance (0 to 3) between two place nodes. */
export function locationTreeDistance(a: LocationValue, b: LocationValue): number {
  // district is required by the schema, so the worst case is "different district".
  if (a.district !== b.district) return 3;
  if (!levelMatches(a.building, b.building)) return 2;
  if (!levelMatches(a.room, b.room)) return 1;
  return 0;
}

/** A level matches only when both sides define it and the values are equal. */
function levelMatches(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined && b === undefined) return true; // neither narrows below here
  return a !== undefined && b !== undefined && a === b;
}

export function compareLocation(a: LocationValue, b: LocationValue): MetricResult {
  const rawDistance = locationTreeDistance(a, b);
  const { severity, band } = classify(rawDistance, LOCATION_THRESHOLDS);
  return { comparable: true, type: "location", rawDistance, severity, band };
}
