/**
 * TypeScript types for the Reasonable Doubt case bible.
 *
 * SYNC METHOD
 * -----------
 * The JSON Schema at /schema/case-bible.schema.json is the single source of
 * truth for the data contract. These types are kept in sync with it. The
 * schema wins any disagreement: if a type here and the schema diverge, the
 * schema is correct and the type must be fixed.
 *
 * These types are hand-authored rather than generated. The reason is that the
 * schema leans on if/then keyword constraints (discriminated unions on
 * `class`, `kind`, `veracity`, `tier`, and value-by-type) that
 * json-schema-to-typescript flattens into loose optional bags, which loses the
 * very distinctions this contract exists to preserve. Hand-authoring lets us
 * model the discriminated unions precisely.
 *
 * If you prefer generation, you can run:
 *   npx json-schema-to-typescript schema/case-bible.schema.json \
 *     --output src/types/caseBible.generated.ts
 * and diff it against this file. Treat any semantic gap as a bug in the looser
 * generated output, not in the schema.
 *
 * When you change the schema, update these types in the same commit.
 */

/** A stable, non-empty reference id. */
export type Id = string;

/** Collusion only: which narrative an element serves. */
export type NarrativeRole = "surface" | "deep";

/** The kind of thing a fact, claim, or clue is about. Selects the value shape. */
export type FactType =
  | "time"
  | "location"
  | "count"
  | "identity"
  | "object"
  | "event"
  | "relationship";

/* ------------------------------------------------------------------ */
/* Typed values (one shape per FactType)                               */
/* ------------------------------------------------------------------ */

/** Time on an in-fiction 24-hour clock, as a point or a window. */
export type TimeValue =
  | { kind: "point"; at: string }
  | { kind: "window"; start: string; end: string };

/** A node in the place hierarchy (room within building within district). */
export interface LocationValue {
  locationId?: Id;
  district: string;
  building?: string;
  room?: string;
}

/** An integer count of some named thing. */
export interface CountValue {
  count: number;
  of: string;
}

/** Identity by direct character reference or by fuzzy descriptor (exactly one). */
export type IdentityValue =
  | { characterId: Id; descriptor?: never }
  | { descriptor: IdentityDescriptor; characterId?: never };

export interface IdentityDescriptor {
  heightBand?: "short" | "average" | "tall";
  build?: "slight" | "average" | "heavy";
  sex?: "male" | "female" | "unknown";
  distinguishingMarks?: string[];
}

/** A typed physical object with category, optional subtype and attributes. */
export interface ObjectValue {
  category: string;
  subtype?: string;
  attributes?: Record<string, unknown>;
}

/** A structured event reference. Kept simple for now. */
export interface EventValue {
  eventType: string;
  description?: string;
}

/** A structured relationship between two characters. Kept simple for now. */
export interface RelationshipValue {
  relationType: string;
  fromCharacterId: Id;
  toCharacterId: Id;
}

/**
 * The generic value envelope shared by Fact.value, Claim.statedValue, and
 * Clue.value. The applicable shape is selected by the parent's `type`.
 */
export type TypedValue =
  | TimeValue
  | LocationValue
  | CountValue
  | IdentityValue
  | ObjectValue
  | EventValue
  | RelationshipValue;

/* ------------------------------------------------------------------ */
/* Facts and claims (the load-bearing split)                           */
/* ------------------------------------------------------------------ */

/** An objective truth in the case world. */
export interface Fact {
  factId: Id;
  type: FactType;
  value: TypedValue;
  narrativeRole?: NarrativeRole;
  summary?: string;
}

/** Hidden authoritative veracity tag for a claim. */
export type Veracity = "truthful" | "mistaken" | "lie";

/**
 * A character's assertion about a fact. statedValue uses the same typed shape
 * as the fact's value but may diverge. The veracity tag is authoritative; the
 * magnitude of divergence does not determine it.
 *
 * Invariants (enforced by schema and/or validator): a `lie` must carry
 * refutedBy; a `mistaken` claim must carry correctedBy.
 */
export interface Claim {
  claimId: Id;
  characterId: Id;
  factId: Id;
  statedValue: TypedValue;
  veracity: Veracity;
  /** Required when veracity is "lie": clue or fact id(s) that break it. */
  refutedBy?: Id[];
  /** Required when veracity is "mistaken": clue or ME fact id(s) that override it. */
  correctedBy?: Id[];
  narrativeRole?: NarrativeRole;
}

/* ------------------------------------------------------------------ */
/* Characters                                                          */
/* ------------------------------------------------------------------ */

export type CharacterRole =
  | "victim"
  | "witness"
  | "suspect"
  | "perp"
  | "framedAgent"
  | "colluder"
  | "medicalExaminer"
  | "districtAttorney";

/**
 * Hidden integer trait vector, each 0 to 100, sampled normal around 50.
 * Traits modulate willingness and delivery only, never knowledge.
 */
export interface Traits {
  authorityDeference: number;
  composure: number;
  honesty: number;
  selfInterest: number;
  talkativeness: number;
  suggestibility: number;
  memoryReliability: number;
}

/** Where a character is found and whether they move. */
export interface Placement {
  homeLocationId: Id;
  canMove: boolean;
  /** Required when canMove is true. */
  altLocationId?: Id;
}

/**
 * A person in the case. The ME and DA are exempt from trait-driven behavior
 * (traitExempt true) and may omit traits; all other characters require traits
 * and must set traitExempt false.
 */
export interface Character {
  characterId: Id;
  name: string;
  role: CharacterRole;
  traitExempt: boolean;
  traits?: Traits;
  knowledgeSlice: Id[];
  placement: Placement;
}

/* ------------------------------------------------------------------ */
/* Locations and clues                                                 */
/* ------------------------------------------------------------------ */

export type LocationKind =
  | "crimeScene"
  | "medicalExaminer"
  | "policeStation"
  | "witnessArea";

export interface PlaceNode {
  district: string;
  building?: string;
  room?: string;
}

/** One of the case's locations, with hierarchy and the mandatoryPass flag. */
export interface Location {
  locationId: Id;
  name: string;
  kind: LocationKind;
  place: PlaceNode;
  mandatoryPass: boolean;
  reused: boolean;
}

/**
 * Physical evidence discoverable during scene exploration. Existence is
 * decided by the truth layer, never by scene geometry. A split-evidence clue
 * must sit at a mandatoryPass location (validator-enforced).
 */
export interface Clue {
  clueId: Id;
  type: FactType;
  value: TypedValue;
  locationId: Id;
  discoveryMethod: string;
  supportsFactIds: Id[];
  narrativeRole?: NarrativeRole;
  isSplitEvidence: boolean;
  /** Inherited copy of the location's mandatoryPass flag. */
  mandatoryPass: boolean;
}

/* ------------------------------------------------------------------ */
/* Questions                                                           */
/* ------------------------------------------------------------------ */

/** Who a question targets: a role or a specific character (exactly one). */
export type QuestionTarget =
  | { role: CharacterRole; characterId?: never }
  | { characterId: Id; role?: never };

export interface QuestionPreconditions {
  cluesHeld?: Id[];
  claimsCorroborated?: Id[];
  contradictionsFound?: Id[];
}

export interface QuestionEffects {
  revealsClaimIds?: Id[];
  unlocksQuestionIds?: Id[];
}

/** A contradiction a confront question deploys. */
export interface ContradictionRef {
  claimId: Id;
  evidenceIds: Id[];
}

/** Question tier: 1 baseline, 2 clue-gated, 3 confront. */
export type QuestionTier = 1 | 2 | 3;

/**
 * One entry in the gated interview menu. The schema stores gates and flags;
 * the runtime (a later step) enforces the actual question budget. Tier 3
 * confront questions require a contradictionRef.
 */
export interface Question {
  questionId: Id;
  text: string;
  target: QuestionTarget;
  tier: QuestionTier;
  preconditions?: QuestionPreconditions;
  effects?: QuestionEffects;
  costsBudget: boolean;
  /** Required for tier 3 confront questions. */
  contradictionRef?: ContradictionRef;
}

/* ------------------------------------------------------------------ */
/* Corroboration, ME report, scoring                                   */
/* ------------------------------------------------------------------ */

/** Hidden corroboration tag, visible to the scorer only. */
export type CorroborationTag = "genuine" | "mistakenConsensus" | "collusive";

export interface CorroborationBearing {
  sourceType: "claim" | "clue";
  sourceId: Id;
  tag: CorroborationTag;
}

/** Per-fact record of every claim and clue that bears on it. */
export interface CorroborationEntry {
  factId: Id;
  bearing: CorroborationBearing[];
}

/** Deterministic autopsy, present only for cases with a body. */
export interface MEReport {
  causeOfDeathFactId: Id;
  timeOfDeathFactId: Id;
  weaponClassFactId: Id;
  defensiveWoundsFactId?: Id;
  toxicologyFactId?: Id;
}

/** A reference to a single piece of evidence in the scoring chain. */
export interface EvidenceRef {
  kind: "fact" | "clue";
  id: Id;
}

export interface CollusionScoringRequirements {
  mustUnnameFramedAgent: boolean;
  mustCiteSplitEvidence: boolean;
  higherBar: boolean;
}

/**
 * How the DA endgame is judged deterministically. The schema stores the spec;
 * the scorer (a later step) runs it and the DA dialogue only dramatizes the
 * result.
 */
export interface ScoringSpec {
  requiredEvidenceChain: EvidenceRef[];
  sufficientChainRule: string;
  unexplainedContradictionRule: string;
  strengthHierarchy: string[];
  collusionRequirements?: CollusionScoringRequirements;
}

/* ------------------------------------------------------------------ */
/* Resolution (discriminated union on `class`)                         */
/* ------------------------------------------------------------------ */

/** A named narrative used by collusion resolutions. */
export interface NarrativeStructure {
  name: string;
  description: string;
}

export type Resolution =
  | { class: "perp"; summary: string; perpCharacterId: Id }
  | { class: "accident"; summary: string }
  | { class: "suicide"; summary: string }
  | { class: "natural"; summary: string }
  | { class: "framing"; summary: string; framedAgentId: Id; offenderId: Id }
  | {
      class: "collusion";
      summary: string;
      colluderIds: Id[];
      framedAgentId: Id;
      surfaceNarrative: NarrativeStructure;
      deepNarrative: NarrativeStructure;
      splitEvidence: Id[];
    };

/* ------------------------------------------------------------------ */
/* Root                                                                */
/* ------------------------------------------------------------------ */

/**
 * The root case bible. The source of truth for one case. No runtime component
 * may invent or contradict anything stored here.
 */
export interface CaseBible {
  schemaVersion: string;
  caseId: string;
  title: string;
  era: "1960s Los Angeles";
  crimeTemplateId: string;
  resolution: Resolution;
  locations: Location[];
  characters: Character[];
  facts: Fact[];
  claims: Claim[];
  clues: Clue[];
  questions: Question[];
  corroborationMap: CorroborationEntry[];
  meReport?: MEReport;
  scoringSpec: ScoringSpec;
}
