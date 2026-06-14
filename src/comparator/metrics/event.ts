/**
 * event metric: intentionally coarse for this version (noted in the README).
 *
 * Compares the event type and, when both supply one, a description as a soft
 * participant-style signal. A different eventType is a hard mismatch (major);
 * same type with a differing description is a moderate partial mismatch; same
 * type and description is agreement. Richer event modeling (structured
 * participants, an embedded time compared via the time metric) is deferred.
 */

import type { EventValue } from "../../types/caseBible.js";
import type { MetricResult } from "../types.js";
import { EVENT_WEIGHTS, COARSE_THRESHOLDS } from "../config.js";
import { classify } from "../classify.js";

export function eventDistance(a: EventValue, b: EventValue): number {
  if (a.eventType !== b.eventType) return EVENT_WEIGHTS.eventTypeMismatch;
  if ((a.description ?? "") !== (b.description ?? "") && a.description && b.description) {
    return EVENT_WEIGHTS.participantMismatch;
  }
  return 0;
}

export function compareEvent(a: EventValue, b: EventValue): MetricResult {
  const rawDistance = eventDistance(a, b);
  const { severity, band } = classify(rawDistance, COARSE_THRESHOLDS);
  return { comparable: true, type: "event", rawDistance, severity, band };
}
