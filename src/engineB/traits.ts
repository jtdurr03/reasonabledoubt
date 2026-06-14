/**
 * Trait-to-flags translator.
 *
 * Turns a character's hidden trait vector (seven integers 0 to 100) into
 * plain-language behavioral flags about willingness and delivery. The raw
 * numbers never reach the model: only the phrases below do. These flags govern
 * how the factual spine is delivered, never what the spine contains.
 *
 * Deterministic and pure. The Medical Examiner and District Attorney are
 * exempt: they perform through a fixed professional register, not trait
 * translation.
 */

import type { Character, CharacterRole, Traits } from "../types/caseBible.js";

/** A trait at or below this reads as "low"; at or above HIGH reads as "high"; between is typical. */
export const LOW_THRESHOLD = 33;
export const HIGH_THRESHOLD = 67;

interface TraitPhrases {
  low: string;
  high: string;
}

/**
 * Per-trait delivery phrasing. Each entry documents only willingness and
 * delivery. None of these mention truth or falsehood: veracity is decided by
 * the bible's Claim.veracity tag, never by a trait.
 */
const TRAIT_PHRASES: Record<keyof Traits, TraitPhrases> = {
  authorityDeference: {
    low: "Resents police authority, pushes back, and answers grudgingly.",
    high: "Defers to a detective's authority and answers fully when pressed.",
  },
  composure: {
    low: "Rattles easily and grows flustered under confrontation.",
    high: "Unflappable, stays calm and measured even under direct questioning.",
  },
  honesty: {
    // Delivery only. A low-honesty character is evasive in manner; whether any
    // given line is true is set by its veracity tag, not by this trait.
    low: "Cagey and guarded in manner, comfortable being evasive.",
    high: "Speaks plainly and directly, uncomfortable with evasion.",
  },
  selfInterest: {
    low: "Forthcoming even when it costs them, offers detail without prompting.",
    high: "Guards their own stake and deflects anything that reflects on them.",
  },
  talkativeness: {
    low: "Terse and clipped, gives the shortest answer that will do.",
    high: "Voluble, offers more detail and tangents than asked.",
  },
  suggestibility: {
    low: "Resists leading questions and sticks to their own account.",
    high: "Easily led, tends to agree with the detective's framing.",
  },
  memoryReliability: {
    low: "Hazy on specifics, hedges and qualifies times and details as uncertain.",
    high: "Recalls specifics crisply and with confidence.",
  },
};

/** The order flags are emitted, for deterministic output. */
const TRAIT_ORDER: (keyof Traits)[] = [
  "authorityDeference",
  "composure",
  "honesty",
  "selfInterest",
  "talkativeness",
  "suggestibility",
  "memoryReliability",
];

/** The fixed professional register for trait-exempt roles. */
export function professionalRegister(role: CharacterRole): string[] {
  if (role === "medicalExaminer") {
    return [
      "Speaks as a clinical professional: precise, neutral, and factual.",
      "States findings plainly, without embellishment, speculation, or deference to either side.",
      "A reliable narrator. Does not editorialize and does not soften or sharpen the facts.",
    ];
  }
  // districtAttorney
  return [
    "Speaks as a measured prosecutor: formal, direct, and deliberate.",
    "Weighs evidence aloud and states conclusions without theatrics.",
  ];
}

/** Translate a trait vector into behavioral flags. Mid-range traits produce no flag. */
export function translateTraits(traits: Traits): string[] {
  const flags: string[] = [];
  for (const trait of TRAIT_ORDER) {
    const value = traits[trait];
    if (value <= LOW_THRESHOLD) flags.push(TRAIT_PHRASES[trait].low);
    else if (value >= HIGH_THRESHOLD) flags.push(TRAIT_PHRASES[trait].high);
    // Typical (between the thresholds) contributes no flag, keeping prompts lean
    // and the outliers meaningful.
  }
  if (flags.length === 0) {
    flags.push("An ordinary, cooperative manner with no strong tendencies.");
  }
  return flags;
}

/**
 * Behavioral flags for a character. The Medical Examiner and District Attorney
 * (trait-exempt) get the fixed professional register; everyone else gets trait
 * translation. The raw trait numbers never appear in the output.
 */
export function behavioralFlags(character: Character): string[] {
  if (character.traitExempt || character.role === "medicalExaminer" || character.role === "districtAttorney") {
    return professionalRegister(character.role);
  }
  if (!character.traits) {
    // A non-exempt character must carry traits (schema-enforced); be safe.
    return ["An ordinary, cooperative manner with no strong tendencies."];
  }
  return translateTraits(character.traits);
}
