/**
 * Shared types for the comparator.
 *
 * The comparator measures the distance between two values about the same fact
 * and maps that distance to a normalized severity and a band. Corroboration
 * and contradiction are the same operation read from opposite ends: a small
 * distance reads as agreement, a large distance reads as contradiction.
 *
 * Nothing in here, and nothing in any metric, ever sees a veracity tag.
 * Distance and severity are computed from values alone. Veracity is read only
 * by the corroboration classifier (see index.ts) and only to label an already
 * computed agreement, never to change a distance.
 */

import type { Band, FactType, TypedValue } from "../types/caseBible.js";

// The derived output shapes (Band, SourceKind, ContradictionEntry,
// CorroborationResult, DerivedData, and friends) live in the canonical types
// file because CaseBible.derived references them. Re-export them here so the
// comparator has a single import surface.
export type {
  Band,
  SourceKind,
  ContradictionEntry,
  CorroborationClass,
  CorroborationMember,
  CorroborationPair,
  CorroborationResult,
  DerivedData,
} from "../types/caseBible.js";

/** A successful, type-matched comparison. */
export interface MetricResult {
  comparable: true;
  /** The fact type both operands shared. */
  type: FactType;
  /** Distance in the metric's natural unit (minutes, tree steps, count, weighted mismatch). */
  rawDistance: number;
  /** Normalized 0.0 (identical) to 1.0 (maximally far). */
  severity: number;
  /** Which band the rawDistance falls into. */
  band: Band;
}

/** Returned when the two operands do not share a type. Never thrown. */
export interface IncomparableResult {
  comparable: false;
  reason: string;
  aType: FactType;
  bType: FactType;
}

export type CompareResult = MetricResult | IncomparableResult;

/**
 * The minimal input a metric needs: a typed value plus the fact type that
 * selects the metric. Built from a Fact (type, value), a Clue (type, value),
 * or a Claim (its fact's type, statedValue).
 */
export interface Comparand {
  type: FactType;
  value: TypedValue;
}

/** Breakpoints that map a rawDistance to a band, plus the severity full scale. */
export interface BandThresholds {
  /** rawDistance at or below this is agreement. */
  agreementMax: number;
  /** rawDistance at or below this (and above agreementMax) is minor. */
  minorMax: number;
  /** rawDistance at or below this (and above minorMax) is moderate. Above it is major. */
  moderateMax: number;
  /** rawDistance that maps to severity 1.0. Distances beyond it clamp to 1.0. */
  severityFullScale: number;
}

