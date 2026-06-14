/**
 * Maps a rawDistance to a normalized severity and a band, using one set of
 * thresholds. Every metric funnels through this so the band logic is defined
 * exactly once and the only per-type variation is the thresholds in config.ts.
 */

import type { Band, BandThresholds } from "./types.js";

export function severityFor(rawDistance: number, t: BandThresholds): number {
  if (t.severityFullScale <= 0) return rawDistance > 0 ? 1 : 0;
  return Math.min(1, Math.max(0, rawDistance / t.severityFullScale));
}

export function bandFor(rawDistance: number, t: BandThresholds): Band {
  if (rawDistance <= t.agreementMax) return "agreement";
  if (rawDistance <= t.minorMax) return "minor";
  if (rawDistance <= t.moderateMax) return "moderate";
  return "major";
}

export function classify(
  rawDistance: number,
  t: BandThresholds,
): { severity: number; band: Band } {
  return { severity: severityFor(rawDistance, t), band: bandFor(rawDistance, t) };
}
