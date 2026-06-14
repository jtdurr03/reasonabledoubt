/**
 * Loads a case bible for the runner and guarantees it carries the comparator's
 * derived data (contradiction matrix and corroboration map). If the file is the
 * authored bible without a derived block, the comparator (step two) is run once
 * to produce it. This reads the comparator's output; it does not reimplement
 * any comparison.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { CaseBible } from "../types/caseBible.js";
import { computeDerived } from "../comparator/index.js";

const here = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(here, "..", "..");
export const referenceFixturePath = resolve(repoRoot, "fixtures/reference-homicide.case.json");

export function loadCase(path: string = referenceFixturePath): CaseBible {
  const bible = JSON.parse(readFileSync(path, "utf8")) as CaseBible;
  if (!bible.derived) {
    bible.derived = computeDerived(bible);
  }
  return bible;
}
