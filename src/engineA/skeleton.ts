/**
 * Deterministic structural generation. Builds the complete logical skeleton of a
 * case from a template plus a seed: the ground truth, the cast and trait
 * vectors, the facts, the anchored claims (every lie carries refutedBy, every
 * mistake carries correctedBy), the clue definitions and placements, the
 * per-witness question graph with computed preconditions, the scoringSpec, and
 * the intended solution chain.
 *
 * No prose is written here. Names, factualSpine, location names, and clue
 * discovery methods are placeholders that the model content-fill pass fills
 * later. The model never reaches this file: every logical decision is made by
 * deterministic, seed-driven code.
 *
 * The structural shape mirrors the trusted hand fixture so generated output is
 * comparable to it and inherits its proven solvability.
 */

import type {
  CaseBible,
  Character,
  Claim,
  Clue,
  CorroborationEntry,
  EvidenceRef,
  Fact,
  Location,
  Question,
  Traits,
} from "../types/caseBible.js";
import type { CrimeTemplate } from "./template.js";
import { makeRng, type Rng } from "./rng.js";

/** One step the intended solver replays through the runner rules. */
export type SolutionStep =
  | { kind: "search" }
  | { kind: "travel"; locationId: string }
  | { kind: "ask"; characterId: string; questionId: string };

export interface IntendedSolution {
  steps: SolutionStep[];
  accusation: {
    accusedId: string | null;
    citedChain: EvidenceRef[];
    resolvedContradictions: string[];
  };
}

export interface Skeleton {
  bible: CaseBible;
  solution: IntendedSolution;
}

const SCHEMA_VERSION = "1.0.0";
/** Project standard deviation for trait sampling around 50. */
const TRAIT_SD = 18;

/** Placeholder slot marker the content-fill pass replaces. */
function ph(slot: string): string {
  return `«${slot}»`;
}

function hhmm(totalMinutes: number): string {
  const m = ((totalMinutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}

function sampleTraits(rng: Rng): Traits {
  return {
    authorityDeference: rng.normalClamped(50, TRAIT_SD, 0, 100),
    composure: rng.normalClamped(50, TRAIT_SD, 0, 100),
    honesty: rng.normalClamped(50, TRAIT_SD, 0, 100),
    selfInterest: rng.normalClamped(50, TRAIT_SD, 0, 100),
    talkativeness: rng.normalClamped(50, TRAIT_SD, 0, 100),
    suggestibility: rng.normalClamped(50, TRAIT_SD, 0, 100),
    memoryReliability: rng.normalClamped(50, TRAIT_SD, 0, 100),
  };
}

/**
 * Generate the deterministic skeleton for a homicide-perp case. Same seed,
 * identical structure. Different seeds vary the times, traits, districts,
 * weapon, and motive while preserving the proven logical shape.
 */
export function generateSkeleton(template: CrimeTemplate, seed: number): Skeleton {
  const rng = makeRng(seed);

  // --- Seed-driven values (offsets cancel in the comparator's distances) ---
  const offset = rng.int(-30, 45);
  const T_depart = 21 * 60 + 15 + offset;
  const T_todStart = 21 * 60 + 45 + offset;
  const T_todEnd = 22 * 60 + 30 + offset;
  const T_crash = 22 * 60 + 0 + offset;
  const T_watch = 22 * 60 + 5 + offset;
  const T_w2 = 21 * 60 + 48 + offset;
  const T_perp = 21 * 60 + 55 + offset;
  const T_call = 21 * 60 + 0 + offset;
  // Divergent stated values that produce the planted contradictions:
  const T_w2_lie = 21 * 60 + 0 + offset; // liar claims gone by nine (~48 min off the truth)
  const T_w3_mistake = T_crash + 60; // hazy witness is ~1 hour late
  const T_perp_alibiTime = 19 * 60 + 15 + offset; // perp claims 7:15, hours before the ME window
  const T_call_lie = T_call + 8; // small lie, eight minutes off

  const sceneDistrict = rng.pick(template.districts);
  const alibiDistrict = rng.pick(template.districts.filter((d) => d !== sceneDistrict));
  const weapon = rng.pick(template.weapons);
  const motive = rng.pick(template.motives);

  /* ----------------------------- Locations ----------------------------- */
  const locations: Location[] = [
    {
      locationId: "LOC_scene",
      name: ph("loc:LOC_scene"),
      kind: "crimeScene",
      place: { district: sceneDistrict, building: ph("bldg:LOC_scene"), room: "back room" },
      mandatoryPass: true,
      reused: false,
    },
    {
      locationId: "LOC_me",
      name: ph("loc:LOC_me"),
      kind: "medicalExaminer",
      place: { district: "Civic Center", building: ph("bldg:LOC_me"), room: "autopsy suite" },
      mandatoryPass: true,
      reused: true,
    },
    {
      locationId: "LOC_station",
      name: ph("loc:LOC_station"),
      kind: "policeStation",
      place: { district: "Civic Center", building: ph("bldg:LOC_station"), room: "interview room" },
      mandatoryPass: true,
      reused: true,
    },
    {
      locationId: "LOC_area",
      name: ph("loc:LOC_area"),
      kind: "witnessArea",
      place: { district: sceneDistrict, building: ph("bldg:LOC_area"), room: "counter" },
      mandatoryPass: false,
      reused: false,
    },
  ];

  /* ------------------------------ Facts ------------------------------- */
  const facts: Fact[] = [
    { factId: "F_departure", type: "time", value: { kind: "point", at: hhmm(T_depart) }, summary: "The clerk locked up and left." },
    { factId: "F_backdoor", type: "object", value: { category: "door", subtype: "back alley door", attributes: { state: "unlocked", latch: "broken" } }, summary: "The back door was forced: the killer's way in." },
    { factId: "F_w2_presence", type: "time", value: { kind: "point", at: hhmm(T_w2) }, summary: "A regular was still on the premises late." },
    { factId: "F_perp_presence", type: "time", value: { kind: "point", at: hhmm(T_perp) }, summary: "The perpetrator was at the scene." },
    { factId: "F_perp_loc_tod", type: "location", value: { locationId: "LOC_scene", district: sceneDistrict, building: ph("bldg:LOC_scene"), room: "back room" }, summary: "The perpetrator was at the scene during the time of death." },
    { factId: "F_perp_debt", type: "relationship", value: { relationType: motive, fromCharacterId: "CH_perp", toCharacterId: "CH_victim" }, summary: "The motive tying the perpetrator to the victim." },
    { factId: "F_crash_time", type: "time", value: { kind: "point", at: hhmm(T_crash) }, summary: "The fatal blow, heard as a crash." },
    { factId: "F_tod", type: "time", value: { kind: "window", start: hhmm(T_todStart), end: hhmm(T_todEnd) }, summary: "Medical Examiner time-of-death window." },
    { factId: "F_cause", type: "event", value: { eventType: "cause of death", description: "blunt force trauma to the head" }, summary: "Cause of death." },
    { factId: "F_weapon", type: "object", value: { category: weapon.category, subtype: weapon.subtype, attributes: { class: "blunt instrument" } }, summary: "Weapon class." },
    { factId: "F_defensive", type: "count", value: { count: 2, of: "defensive bruises on the victim's forearms" }, summary: "Defensive wounds rule out accident and suicide." },
    { factId: "F_tox", type: "event", value: { eventType: "toxicology", description: "moderate blood alcohol, no toxins detected" }, summary: "Toxicology rules out a toxic or natural death." },
    { factId: "F_perp_call_time", type: "time", value: { kind: "point", at: hhmm(T_call) }, summary: "The perpetrator telephoned the victim to arrange the meeting." },
  ];

  /* ------------------------------ Clues ------------------------------- */
  // All physical clues sit at the crime scene, which is mandatoryPass, so every
  // refuter and corrector is reachable from one guaranteed search.
  const allClues: Clue[] = [
    { clueId: "C_w2_ticket", type: "time", value: { kind: "point", at: hhmm(T_w2) }, locationId: "LOC_scene", discoveryMethod: ph("discovery:C_w2_ticket"), supportsFactIds: ["F_w2_presence"], isSplitEvidence: false, mandatoryPass: true },
    { clueId: "C_backdoor", type: "object", value: { category: "door hardware", subtype: "latch", attributes: { state: "forced from the alley side" } }, locationId: "LOC_scene", discoveryMethod: ph("discovery:C_backdoor"), supportsFactIds: ["F_backdoor"], isSplitEvidence: false, mandatoryPass: true },
    { clueId: "C_watch", type: "time", value: { kind: "point", at: hhmm(T_watch) }, locationId: "LOC_scene", discoveryMethod: ph("discovery:C_watch"), supportsFactIds: ["F_crash_time", "F_tod"], isSplitEvidence: false, mandatoryPass: true },
    { clueId: "C_prints", type: "object", value: { category: weapon.category, subtype: weapon.subtype, attributes: { latentPrints: "matched to the perpetrator" } }, locationId: "LOC_scene", discoveryMethod: ph("discovery:C_prints"), supportsFactIds: ["F_weapon", "F_perp_loc_tod"], isSplitEvidence: false, mandatoryPass: true },
    { clueId: "C_ledger", type: "relationship", value: { relationType: motive, fromCharacterId: "CH_perp", toCharacterId: "CH_victim" }, locationId: "LOC_scene", discoveryMethod: ph("discovery:C_ledger"), supportsFactIds: ["F_perp_debt"], isSplitEvidence: false, mandatoryPass: true },
    { clueId: "C_phone_slip", type: "time", value: { kind: "point", at: hhmm(T_call) }, locationId: "LOC_scene", discoveryMethod: ph("discovery:C_phone_slip"), supportsFactIds: ["F_perp_call_time"], isSplitEvidence: false, mandatoryPass: true },
  ];
  // Test hook: orphan the liar's refuter to exercise the invariant checker.
  const clues = template.__orphanRefuterForTest
    ? allClues.filter((c) => c.clueId !== "C_w2_ticket")
    : allClues;

  /* ------------------------------ Claims ------------------------------ */
  const claims: Claim[] = [
    { claimId: "CL_w1_departure", characterId: "CH_w1", factId: "F_departure", statedValue: { kind: "point", at: hhmm(T_depart) }, veracity: "truthful" },
    { claimId: "CL_w3_seedeparture", characterId: "CH_w3", factId: "F_departure", statedValue: { kind: "point", at: hhmm(T_depart) }, veracity: "truthful" },
    { claimId: "CL_w1_backdoor", characterId: "CH_w1", factId: "F_backdoor", statedValue: { category: "door", subtype: "back alley door", attributes: { state: "locked" } }, veracity: "mistaken", correctedBy: ["C_backdoor"] },
    { claimId: "CL_w2_departlie", characterId: "CH_w2", factId: "F_w2_presence", statedValue: { kind: "point", at: hhmm(T_w2_lie) }, veracity: "lie", refutedBy: ["C_w2_ticket"] },
    { claimId: "CL_w2_sawcar", characterId: "CH_w2", factId: "F_perp_presence", statedValue: { kind: "point", at: hhmm(T_perp) }, veracity: "truthful" },
    { claimId: "CL_w3_crashtime", characterId: "CH_w3", factId: "F_crash_time", statedValue: { kind: "point", at: hhmm(T_w3_mistake) }, veracity: "mistaken", correctedBy: ["F_tod", "C_watch"] },
    { claimId: "CL_perp_alibi", characterId: "CH_perp", factId: "F_perp_loc_tod", statedValue: { district: alibiDistrict, building: ph("bldg:alibi"), room: "bar" }, veracity: "lie", refutedBy: ["C_prints", "F_tod"] },
    { claimId: "CL_perp_alibi_time", characterId: "CH_perp", factId: "F_tod", statedValue: { kind: "point", at: hhmm(T_perp_alibiTime) }, veracity: "lie", refutedBy: ["C_prints", "F_perp_presence"] },
    { claimId: "CL_perp_debt_denial", characterId: "CH_perp", factId: "F_perp_debt", statedValue: { relationType: "none", fromCharacterId: "CH_perp", toCharacterId: "CH_victim" }, veracity: "lie", refutedBy: ["C_ledger"] },
    { claimId: "CL_perp_calltime", characterId: "CH_perp", factId: "F_perp_call_time", statedValue: { kind: "point", at: hhmm(T_call_lie) }, veracity: "lie", refutedBy: ["C_phone_slip"] },
    { claimId: "CL_me_tod", characterId: "CH_me", factId: "F_tod", statedValue: { kind: "window", start: hhmm(T_todStart), end: hhmm(T_todEnd) }, veracity: "truthful" },
    { claimId: "CL_me_cause", characterId: "CH_me", factId: "F_cause", statedValue: { eventType: "cause of death", description: "blunt force trauma to the head" }, veracity: "truthful" },
    { claimId: "CL_me_defensive", characterId: "CH_me", factId: "F_defensive", statedValue: { count: 2, of: "defensive bruises on the victim's forearms" }, veracity: "truthful" },
  ];

  /* ---------------------------- Characters ---------------------------- */
  const characters: Character[] = [
    { characterId: "CH_victim", name: ph("name:CH_victim"), role: "victim", traitExempt: false, traits: sampleTraits(rng), knowledgeSlice: [], placement: { homeLocationId: "LOC_scene", canMove: false } },
    { characterId: "CH_perp", name: ph("name:CH_perp"), role: "perp", traitExempt: false, traits: sampleTraits(rng), knowledgeSlice: ["CL_perp_alibi", "CL_perp_alibi_time", "CL_perp_debt_denial", "CL_perp_calltime"], placement: { homeLocationId: "LOC_station", canMove: false } },
    { characterId: "CH_w1", name: ph("name:CH_w1"), role: "witness", traitExempt: false, traits: sampleTraits(rng), knowledgeSlice: ["CL_w1_departure", "CL_w1_backdoor"], placement: { homeLocationId: "LOC_scene", canMove: true, altLocationId: "LOC_station" } },
    { characterId: "CH_w2", name: ph("name:CH_w2"), role: "witness", traitExempt: false, traits: sampleTraits(rng), knowledgeSlice: ["CL_w2_departlie", "CL_w2_sawcar"], placement: { homeLocationId: "LOC_area", canMove: false } },
    { characterId: "CH_w3", name: ph("name:CH_w3"), role: "witness", traitExempt: false, traits: sampleTraits(rng), knowledgeSlice: ["CL_w3_crashtime", "CL_w3_seedeparture"], placement: { homeLocationId: "LOC_area", canMove: false } },
    { characterId: "CH_me", name: ph("name:CH_me"), role: "medicalExaminer", traitExempt: true, knowledgeSlice: ["CL_me_tod", "CL_me_cause", "CL_me_defensive"], placement: { homeLocationId: "LOC_me", canMove: false } },
    { characterId: "CH_da", name: ph("name:CH_da"), role: "districtAttorney", traitExempt: true, knowledgeSlice: [], placement: { homeLocationId: "LOC_station", canMove: false } },
  ];

  /* ---------------------------- Questions ----------------------------- */
  const questions: Question[] = [
    // Clerk (CH_w1)
    { questionId: "Q_w1_1", text: "What time did you lock up tonight?", target: { characterId: "CH_w1" }, tier: 1, preconditions: {}, effects: { revealsClaimIds: ["CL_w1_departure"] }, costsBudget: true },
    { questionId: "Q_w1_2", text: "The back latch was forced. Was that door locked when you left?", target: { characterId: "CH_w1" }, tier: 2, preconditions: { cluesHeld: ["C_backdoor"] }, effects: { revealsClaimIds: ["CL_w1_backdoor"], unlocksQuestionIds: ["Q_w1_3"] }, costsBudget: true },
    { questionId: "Q_w1_3", text: "The latch was pried from the alley side. You never checked it, did you?", target: { characterId: "CH_w1" }, tier: 3, preconditions: { cluesHeld: ["C_backdoor"] }, effects: {}, costsBudget: false, contradictionRef: { claimId: "CL_w1_backdoor", evidenceIds: ["C_backdoor"] } },
    // Liar (CH_w2)
    { questionId: "Q_w2_1", text: "When did you leave tonight?", target: { characterId: "CH_w2" }, tier: 1, preconditions: {}, effects: { revealsClaimIds: ["CL_w2_departlie"] }, costsBudget: true },
    { questionId: "Q_w2_2", text: "This ticket has your name and a late stamp. Care to revise your evening?", target: { characterId: "CH_w2" }, tier: 2, preconditions: { cluesHeld: ["C_w2_ticket"] }, effects: { unlocksQuestionIds: ["Q_w2_3"] }, costsBudget: true },
    { questionId: "Q_w2_3", text: "You were still here. What did you really see before you slipped out?", target: { characterId: "CH_w2" }, tier: 3, preconditions: { cluesHeld: ["C_w2_ticket"] }, effects: { revealsClaimIds: ["CL_w2_sawcar"] }, costsBudget: false, contradictionRef: { claimId: "CL_w2_departlie", evidenceIds: ["C_w2_ticket"] } },
    // Hazy witness (CH_w3)
    { questionId: "Q_w3_1", text: "Did you hear or see anything that night?", target: { characterId: "CH_w3" }, tier: 1, preconditions: {}, effects: { revealsClaimIds: ["CL_w3_crashtime", "CL_w3_seedeparture"] }, costsBudget: true },
    { questionId: "Q_w3_2", text: "The victim's watch stopped late. Could the crash have been earlier than you thought?", target: { characterId: "CH_w3" }, tier: 2, preconditions: { cluesHeld: ["C_watch"] }, effects: {}, costsBudget: true },
    { questionId: "Q_w3_3", text: "The coroner's window and the stopped watch put it earlier. Your clock runs slow, doesn't it?", target: { characterId: "CH_w3" }, tier: 3, preconditions: { cluesHeld: ["C_watch"] }, effects: {}, costsBudget: false, contradictionRef: { claimId: "CL_w3_crashtime", evidenceIds: ["C_watch", "F_tod"] } },
    // Perpetrator (CH_perp)
    { questionId: "Q_perp_1", text: "Where were you between nine and midnight?", target: { characterId: "CH_perp" }, tier: 1, preconditions: {}, effects: { revealsClaimIds: ["CL_perp_alibi", "CL_perp_alibi_time", "CL_perp_debt_denial", "CL_perp_calltime"] }, costsBudget: true },
    { questionId: "Q_perp_2", text: "The ledger shows what you owed the victim. Still say you were square?", target: { characterId: "CH_perp" }, tier: 2, preconditions: { cluesHeld: ["C_ledger"] }, effects: { unlocksQuestionIds: ["Q_perp_3"] }, costsBudget: true },
    { questionId: "Q_perp_3", text: "Your prints are on the weapon, at the very hour the coroner fixes the death. The alibi is finished, isn't it?", target: { characterId: "CH_perp" }, tier: 3, preconditions: { cluesHeld: ["C_prints"] }, effects: {}, costsBudget: false, contradictionRef: { claimId: "CL_perp_alibi", evidenceIds: ["C_prints", "F_tod"] } },
    // Medical Examiner (CH_me)
    { questionId: "Q_me_1", text: "What does the autopsy tell us?", target: { characterId: "CH_me" }, tier: 1, preconditions: {}, effects: { revealsClaimIds: ["CL_me_tod", "CL_me_cause"] }, costsBudget: false },
    { questionId: "Q_me_2", text: "Could this have been an accident or self-inflicted?", target: { characterId: "CH_me" }, tier: 2, preconditions: {}, effects: { revealsClaimIds: ["CL_me_defensive"] }, costsBudget: false },
  ];

  /* -------------------------- Corroboration --------------------------- */
  const corroborationMap: CorroborationEntry[] = ([
    { factId: "F_departure", bearing: [ { sourceType: "claim", sourceId: "CL_w1_departure", tag: "genuine" }, { sourceType: "claim", sourceId: "CL_w3_seedeparture", tag: "genuine" } ] },
    { factId: "F_w2_presence", bearing: clues.some((c) => c.clueId === "C_w2_ticket") ? [ { sourceType: "clue", sourceId: "C_w2_ticket", tag: "genuine" } ] : [] },
    { factId: "F_perp_presence", bearing: [ { sourceType: "claim", sourceId: "CL_w2_sawcar", tag: "genuine" } ] },
    { factId: "F_perp_loc_tod", bearing: [ { sourceType: "clue", sourceId: "C_prints", tag: "genuine" } ] },
    { factId: "F_perp_debt", bearing: [ { sourceType: "clue", sourceId: "C_ledger", tag: "genuine" } ] },
    { factId: "F_crash_time", bearing: [ { sourceType: "clue", sourceId: "C_watch", tag: "genuine" } ] },
    { factId: "F_tod", bearing: [ { sourceType: "clue", sourceId: "C_watch", tag: "genuine" }, { sourceType: "claim", sourceId: "CL_me_tod", tag: "genuine" } ] },
    { factId: "F_backdoor", bearing: [ { sourceType: "clue", sourceId: "C_backdoor", tag: "genuine" } ] },
    { factId: "F_perp_call_time", bearing: [ { sourceType: "clue", sourceId: "C_phone_slip", tag: "genuine" } ] },
  ] as CorroborationEntry[]).filter((e) => e.bearing.length > 0);

  /* ---------------------------- ScoringSpec --------------------------- */
  const requiredEvidenceChain: EvidenceRef[] = [
    { kind: "fact", id: "F_defensive" },
    { kind: "fact", id: "F_cause" },
    { kind: "fact", id: "F_tod" },
    { kind: "clue", id: "C_prints" },
    { kind: "fact", id: "F_perp_loc_tod" },
    { kind: "clue", id: "C_w2_ticket" },
    { kind: "fact", id: "F_perp_presence" },
    { kind: "clue", id: "C_ledger" },
    { kind: "fact", id: "F_perp_debt" },
  ];
  const minimumSufficientChain: EvidenceRef[] = [
    { kind: "fact", id: "F_defensive" },
    { kind: "fact", id: "F_cause" },
    { kind: "fact", id: "F_tod" },
    { kind: "clue", id: "C_prints" },
    { kind: "fact", id: "F_perp_loc_tod" },
  ];

  const bible: CaseBible = {
    schemaVersion: SCHEMA_VERSION,
    caseId: `${template.templateId}-${String(seed).padStart(5, "0")}`,
    title: ph("title"),
    era: "1960s Los Angeles",
    crimeTemplateId: template.templateId,
    resolution: { class: "perp", summary: "A homicide with a single guilty perpetrator (see perpCharacterId).", perpCharacterId: "CH_perp" },
    locations,
    characters,
    facts,
    claims,
    clues,
    questions,
    corroborationMap,
    meReport: {
      causeOfDeathFactId: "F_cause",
      timeOfDeathFactId: "F_tod",
      weaponClassFactId: "F_weapon",
      defensiveWoundsFactId: "F_defensive",
      toxicologyFactId: "F_tox",
    },
    scoringSpec: {
      requiredEvidenceChain,
      minimumSufficientChain,
      sufficientChainRule:
        "Establish the homicide (F_defensive and F_cause rule out accident, suicide, and natural causes), then place the perpetrator at the scene during the ME time-of-death window (F_tod) with physical evidence (C_prints on the weapon, reinforced by the corrected sighting once C_w2_ticket breaks the lie), and cite motive (F_perp_debt via C_ledger). The prints plus the window are the minimum sufficient core.",
      unexplainedContradictionRule:
        "Every contradiction left unresolved counts against the case. The perpetrator's alibi must be broken by C_prints with F_tod, the witness lie cracked with C_w2_ticket, and the hazy time corrected to F_tod.",
      strengthHierarchy: [
        "Physical evidence and Medical Examiner findings outrank all testimony.",
        "Testimony corroborated by two or more independent sources outranks a single statement.",
        "A single uncorroborated statement cannot, alone, carry an accusation.",
      ],
    },
  };

  /* ------------------------- Intended solution ------------------------ */
  const solution: IntendedSolution = {
    steps: [
      { kind: "search" }, // at the crime scene, gathers every clue
      { kind: "travel", locationId: "LOC_me" },
      { kind: "ask", characterId: "CH_me", questionId: "Q_me_1" },
      { kind: "ask", characterId: "CH_me", questionId: "Q_me_2" },
      { kind: "travel", locationId: "LOC_scene" },
      { kind: "ask", characterId: "CH_w1", questionId: "Q_w1_1" },
      { kind: "ask", characterId: "CH_w1", questionId: "Q_w1_2" },
      { kind: "ask", characterId: "CH_w1", questionId: "Q_w1_3" },
      { kind: "travel", locationId: "LOC_area" },
      { kind: "ask", characterId: "CH_w2", questionId: "Q_w2_1" },
      { kind: "ask", characterId: "CH_w2", questionId: "Q_w2_2" },
      { kind: "ask", characterId: "CH_w2", questionId: "Q_w2_3" },
      { kind: "ask", characterId: "CH_w3", questionId: "Q_w3_1" },
      { kind: "ask", characterId: "CH_w3", questionId: "Q_w3_2" },
      { kind: "ask", characterId: "CH_w3", questionId: "Q_w3_3" },
      { kind: "travel", locationId: "LOC_station" },
      { kind: "ask", characterId: "CH_perp", questionId: "Q_perp_1" },
      { kind: "ask", characterId: "CH_perp", questionId: "Q_perp_2" },
      { kind: "ask", characterId: "CH_perp", questionId: "Q_perp_3" },
    ],
    accusation: {
      accusedId: "CH_perp",
      citedChain: requiredEvidenceChain,
      resolvedContradictions: ["CL_w1_backdoor", "CL_w2_departlie", "CL_w3_crashtime", "CL_perp_alibi"],
    },
  };

  return { bible, solution };
}
