/**
 * count metric: numeric difference between two counts.
 *
 * Default mode (config COUNT_MODE) is "absolute": rawDistance is the integer
 * difference, so off-by-one is minor and a gap such as two versus six is major.
 * "proportional" mode instead scales the difference by the larger operand, so
 * off-by-one on a large count barely registers; it is offered for large-count
 * cases and is not the default. See config.ts for the reasoning.
 *
 * The reported rawDistance is always the natural unit (the integer difference)
 * so the matrix stays human-readable; only the band and severity differ by mode.
 */

import type { CountValue } from "../../types/caseBible.js";
import type { MetricResult } from "../types.js";
import {
  COUNT_MODE,
  COUNT_THRESHOLDS_ABSOLUTE,
  COUNT_THRESHOLDS_PROPORTIONAL,
  type CountMode,
} from "../config.js";
import { classify } from "../classify.js";

export function compareCount(
  a: CountValue,
  b: CountValue,
  mode: CountMode = COUNT_MODE,
): MetricResult {
  const rawDistance = Math.abs(a.count - b.count);

  if (mode === "proportional") {
    const denom = Math.max(1, Math.abs(a.count), Math.abs(b.count));
    const ratio = rawDistance / denom;
    const { severity, band } = classify(ratio, COUNT_THRESHOLDS_PROPORTIONAL);
    return { comparable: true, type: "count", rawDistance, severity, band };
  }

  const { severity, band } = classify(rawDistance, COUNT_THRESHOLDS_ABSOLUTE);
  return { comparable: true, type: "count", rawDistance, severity, band };
}
