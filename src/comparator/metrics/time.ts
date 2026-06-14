/**
 * time metric: continuous distance in minutes on the in-fiction 24-hour clock.
 *
 *   point  vs point : absolute minutes apart.
 *   point  vs window: 0 if the point is inside the window, else minutes to the
 *                     nearest edge.
 *   window vs window: 0 if they overlap, else the gap between them.
 *
 * Times are treated as same-day minutes since midnight. Windows that wrap past
 * midnight are out of scope for this version (the game's cases run within an
 * evening); this is noted in the README.
 */

import type { TimeValue } from "../../types/caseBible.js";
import type { MetricResult } from "../types.js";
import { TIME_THRESHOLDS } from "../config.js";
import { classify } from "../classify.js";

/** "HH:MM" to minutes since midnight. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((n) => parseInt(n, 10));
  return h * 60 + m;
}

type Span = { start: number; end: number };

function toSpan(v: TimeValue): Span {
  if (v.kind === "point") {
    const at = toMinutes(v.at);
    return { start: at, end: at };
  }
  return { start: toMinutes(v.start), end: toMinutes(v.end) };
}

/** Distance in minutes between two time spans (a point is a zero-width span). */
export function timeDistanceMinutes(a: TimeValue, b: TimeValue): number {
  const sa = toSpan(a);
  const sb = toSpan(b);
  // Overlap (inclusive) means distance 0.
  if (sa.start <= sb.end && sb.start <= sa.end) return 0;
  // Otherwise the gap is between the nearer edges.
  return sa.end < sb.start ? sb.start - sa.end : sa.start - sb.end;
}

export function compareTime(a: TimeValue, b: TimeValue): MetricResult {
  const rawDistance = timeDistanceMinutes(a, b);
  const { severity, band } = classify(rawDistance, TIME_THRESHOLDS);
  return { comparable: true, type: "time", rawDistance, severity, band };
}
