/**
 * Comparator configuration: every tolerance and severity threshold lives here,
 * in one place, so the whole feel of corroboration and contradiction can be
 * tuned without touching metric logic. Each block documents the reasoning for
 * its breakpoints.
 *
 * Bands always mean the same thing across types: agreement is "close enough to
 * read as the same statement", minor and moderate are the graded middle, and
 * major is "clearly in conflict". The rawDistance scale differs per type, which
 * is exactly the point: distance is type-aware.
 */

import type { Band, BandThresholds } from "./types.js";

/** Bumped when the metric semantics change, so stale derived data is detectable. */
export const COMPARATOR_VERSION = "1.0.0";

/* ------------------------------------------------------------------ */
/* time: rawDistance is minutes apart on the in-fiction 24-hour clock  */
/* ------------------------------------------------------------------ */
/**
 * A few minutes is clock noise, so it reads as agreement. Tens of minutes is a
 * minor wobble. Around an hour (up to 90 minutes) is a moderate discrepancy.
 * Beyond 90 minutes is a multiple-hour gap, which is major. Severity saturates
 * at 4 hours (240 minutes): past that, "very far" is "very far".
 */
export const TIME_THRESHOLDS: BandThresholds = {
  agreementMax: 5,
  minorMax: 20,
  moderateMax: 90,
  severityFullScale: 240,
};

/* ------------------------------------------------------------------ */
/* location: rawDistance is steps up the place tree to the common root */
/* ------------------------------------------------------------------ */
/**
 * The place hierarchy is district contains building contains room. Distance is
 * how far up you must climb before the two places share an ancestor:
 *   0 = same room (agreement),
 *   1 = same building, different room (minor),
 *   2 = same district, different building (moderate),
 *   3 = different district (major).
 * Severity is the climb divided by the maximum climb (3).
 */
export const LOCATION_THRESHOLDS: BandThresholds = {
  agreementMax: 0,
  minorMax: 1,
  moderateMax: 2,
  severityFullScale: 3,
};

/* ------------------------------------------------------------------ */
/* count: rawDistance is the absolute difference of the two counts     */
/* ------------------------------------------------------------------ */
/**
 * Default mode is "absolute": rawDistance is the integer difference. This
 * satisfies the project's stated examples directly: off-by-one is minor, while
 * a large gap such as two versus six (difference of four) is major. Severity
 * saturates at a difference of six.
 *
 * A "proportional" mode is also provided for cases with large counts, where
 * off-by-one should barely register (101 versus 100). It scales the difference
 * by the larger operand. The default is "absolute" because the counts in this
 * game (gunshots, people present, wounds) are small, where absolute difference
 * is the more intuitive reading.
 */
export type CountMode = "absolute" | "proportional";

export const COUNT_MODE: CountMode = "absolute";

export const COUNT_THRESHOLDS_ABSOLUTE: BandThresholds = {
  agreementMax: 0,
  minorMax: 1,
  moderateMax: 3,
  severityFullScale: 6,
};

/** Proportional mode operates on the ratio difference / max(a, b), range 0 to 1. */
export const COUNT_THRESHOLDS_PROPORTIONAL: BandThresholds = {
  agreementMax: 0,
  minorMax: 0.1,
  moderateMax: 0.34,
  severityFullScale: 1,
};

/* ------------------------------------------------------------------ */
/* identity: rawDistance is a weighted sum of attribute mismatches     */
/* ------------------------------------------------------------------ */
/**
 * Hard attributes (sex, an incompatible height band such as short versus tall)
 * are weighted at 1.0 each, so any single hard conflict pushes the result to
 * major on its own: a tall man cannot match a short woman. Soft attributes
 * (build, an adjacent height band, distinguishing marks) carry smaller weights
 * so they accumulate into the minor and moderate middle.
 *
 * Two references to the same character id are distance 0. Two references to
 * different characters are a hard conflict (distance equals the full scale).
 * A reference compared against a bare descriptor cannot be resolved by a pure
 * value metric (the character's physical attributes are not in the value), so
 * it returns a moderate "cannot confirm" distance and a reason; document this.
 */
export const IDENTITY_WEIGHTS = {
  /** Different sex: a hard conflict. */
  sexMismatch: 1.0,
  /** Height bands two steps apart (short versus tall): a hard conflict. */
  heightIncompatible: 1.0,
  /** Height bands one step apart (short versus average): soft. */
  heightAdjacent: 0.3,
  /** Different build: soft. */
  buildMismatch: 0.4,
  /** Each distinguishing mark present on one side but not the other: soft, capped. */
  markMismatch: 0.2,
  /** Maximum total contribution from distinguishing marks. */
  markMismatchCap: 0.6,
  /** Distance assigned to two different known character ids. */
  differentCharacter: 1.5,
  /** Distance assigned when a character ref is compared to a bare descriptor. */
  unresolvedRefVsDescriptor: 0.7,
};

export const IDENTITY_THRESHOLDS: BandThresholds = {
  agreementMax: 0.2,
  minorMax: 0.5,
  moderateMax: 0.9,
  severityFullScale: 1.5,
};

/* ------------------------------------------------------------------ */
/* object: category first, then subtype, then attributes              */
/* ------------------------------------------------------------------ */
/**
 * Category is the hard axis: a blade versus a gun is a different category and
 * weighted 1.0, which alone reads as major. Within a category, a different
 * subtype (a kitchen knife versus a hunting knife, both blades) is a moderate
 * weight that lands in the minor-to-moderate range. Attribute mismatches are
 * small accumulating weights.
 */
export const OBJECT_WEIGHTS = {
  categoryMismatch: 1.0,
  subtypeMismatch: 0.4,
  attributeMismatch: 0.15,
  attributeMismatchCap: 0.45,
};

export const OBJECT_THRESHOLDS: BandThresholds = {
  agreementMax: 0.15,
  minorMax: 0.4,
  moderateMax: 0.9,
  severityFullScale: 1.5,
};

/* ------------------------------------------------------------------ */
/* event and relationship: intentionally coarse for this version       */
/* ------------------------------------------------------------------ */
/**
 * These two are deliberately simple in this version (noted in the README). The
 * raw scale is 0 to 1: a mismatch on the defining field (eventType, or relation
 * type) is a hard 1.0 (major), a mismatch on participants is a moderate 0.5,
 * and full agreement is 0.
 */
export const EVENT_WEIGHTS = {
  eventTypeMismatch: 1.0,
  participantMismatch: 0.5,
};

export const RELATIONSHIP_WEIGHTS = {
  relationTypeMismatch: 1.0,
  partyMismatch: 0.5,
};

export const COARSE_THRESHOLDS: BandThresholds = {
  agreementMax: 0.0,
  minorMax: 0.25,
  moderateMax: 0.75,
  severityFullScale: 1,
};

/* ------------------------------------------------------------------ */
/* Corroboration                                                       */
/* ------------------------------------------------------------------ */
/**
 * Two sources corroborate when their comparison lands in the agreement band.
 * This reuses each type's agreementMax, so "agreement" means the same thing for
 * corroboration as it does for contradiction. There is no separate corroboration
 * tolerance to drift out of sync.
 */
export const CORROBORATION_BAND: Band = "agreement";
