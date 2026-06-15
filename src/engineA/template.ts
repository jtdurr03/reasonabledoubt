/**
 * Crime templates are data, not code. A template captures the crime kind, the
 * roles required, the location archetypes, the pools the deterministic skeleton
 * draws from (districts, weapons, motives), and the resolution-class weights.
 * The remaining templates and the null-case variants are later data entries
 * against this same interface, not new architecture.
 *
 * This step authors exactly one template: a homicide with a single guilty perp,
 * shaped to match the hand fixture so generated output can be compared against
 * the trusted reference. Collusion is deferred (its schema room exists but no
 * collusion template is authored here).
 */

import type { CharacterRole } from "../types/caseBible.js";

/** A weapon archetype: a blunt instrument category and a period subtype. */
export interface WeaponArchetype {
  category: string;
  subtype: string;
}

export interface CrimeTemplate {
  templateId: string;
  crimeKind: string;
  /** This step generates only single-perp homicides. Reserved for null/collusion later. */
  resolutionClass: "perp";
  era: "1960s Los Angeles";
  /** Whether the Medical Examiner appears (a case with a body). */
  mePresent: boolean;
  /** How many optional witness areas exist (the hand fixture uses one). */
  witnessAreaCount: number;
  /** Districts the place hierarchy draws from. Structural: the comparator compares them. */
  districts: readonly string[];
  /** Blunt-instrument weapon archetypes. */
  weapons: readonly WeaponArchetype[];
  /** Motive relationship types (perp to victim). */
  motives: readonly string[];
  /** Roles the cast must contain. */
  requiredRoles: readonly CharacterRole[];

  /**
   * Test-only hook: deliberately orphan a refuter (drop the clue that refutes a
   * lie) so the invariant checker and the reject-and-retry guard can be tested.
   * Never set on a real template.
   */
  __orphanRefuterForTest?: boolean;
}

export const homicidePerpTemplate: CrimeTemplate = {
  templateId: "homicide-perp",
  crimeKind: "homicide",
  resolutionClass: "perp",
  era: "1960s Los Angeles",
  mePresent: true,
  witnessAreaCount: 1,
  districts: [
    "Bunker Hill",
    "Westlake",
    "Boyle Heights",
    "Echo Park",
    "Silver Lake",
    "Chinatown",
    "Lincoln Heights",
  ],
  weapons: [
    { category: "weapon", subtype: "glass bottle" },
    { category: "weapon", subtype: "brass candlestick" },
    { category: "weapon", subtype: "iron poker" },
    { category: "weapon", subtype: "marble ashtray" },
  ],
  motives: ["debtor", "rival", "creditor", "blackmail"],
  requiredRoles: [
    "victim",
    "perp",
    "witness",
    "witness",
    "witness",
    "medicalExaminer",
    "districtAttorney",
  ],
};

export const templates: Record<string, CrimeTemplate> = {
  [homicidePerpTemplate.templateId]: homicidePerpTemplate,
};
