/**
 * Validator for Reasonable Doubt case bibles.
 *
 * Two passes:
 *   1. JSON Schema validation (the canonical contract in /schema).
 *   2. Cross-object invariants the schema cannot express on its own
 *      (referential integrity, value-type agreement between a claim and its
 *      fact, the split-evidence / mandatoryPass rule, and so on).
 *
 * Exits 0 only if both passes are clean. Exits nonzero and prints a readable
 * error list otherwise.
 *
 * Usage:
 *   tsx src/validate.ts                          (validates the reference fixture)
 *   tsx src/validate.ts path/to/other.case.json  (validates another bible)
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
// Ajv ships CommonJS with a self-referential default export (module.exports
// and module.exports.default are the same class). NodeNext + tsc cannot model
// that cleanly, so we import the namespace and re-type its `default` as a plain
// constructor. The shape below is the small slice of Ajv we actually use.
import * as Ajv2020Module from "ajv/dist/2020.js";
import type { ErrorObject } from "ajv/dist/2020.js";

type AjvValidateFn = ((data: unknown) => boolean) & {
  errors?: ErrorObject[] | null;
};
type AjvInstance = { compile: (schema: object) => AjvValidateFn };
type AjvCtor = new (opts?: { allErrors?: boolean; strict?: boolean }) => AjvInstance;

const Ajv2020 = (Ajv2020Module as unknown as { default: AjvCtor }).default;
import type {
  CaseBible,
  Claim,
  Clue,
  Fact,
  FactType,
  Location,
  TypedValue,
} from "./types/caseBible.js";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..");

const schemaPath = resolve(repoRoot, "schema/case-bible.schema.json");
const defaultFixture = resolve(repoRoot, "fixtures/reference-homicide.case.json");
const fixturePath = process.argv[2]
  ? resolve(process.cwd(), process.argv[2])
  : defaultFixture;

function loadJson(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}

/* ----------------------------------------------------------------- */
/* Pass 1: JSON Schema                                                 */
/* ----------------------------------------------------------------- */

function schemaErrors(schema: object, data: unknown): string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  const validate = ajv.compile(schema);
  if (validate(data)) return [];
  return (validate.errors ?? []).map(formatAjvError);
}

function formatAjvError(e: ErrorObject): string {
  const where = e.instancePath || "(root)";
  const extra =
    e.keyword === "additionalProperties"
      ? ` (offending property: ${(e.params as { additionalProperty?: string }).additionalProperty})`
      : "";
  return `schema: ${where} ${e.message ?? ""}${extra}`;
}

/* ----------------------------------------------------------------- */
/* Pass 2: cross-object invariants                                     */
/* ----------------------------------------------------------------- */

/** Infer the FactType implied by a typed value's shape. */
function inferType(value: TypedValue): FactType | "unknown" {
  const v = value as Record<string, unknown>;
  if (v.kind === "point" || v.kind === "window") return "time";
  if ("count" in v && "of" in v) return "count";
  if ("category" in v) return "object";
  if ("eventType" in v) return "event";
  if ("relationType" in v) return "relationship";
  if ("district" in v) return "location";
  if ("characterId" in v || "descriptor" in v) return "identity";
  return "unknown";
}

function semanticErrors(bible: CaseBible): string[] {
  const errors: string[] = [];

  const characterIds = new Set(bible.characters.map((c) => c.characterId));
  const locationIds = new Set(bible.locations.map((l) => l.locationId));
  const factById = new Map<string, Fact>(bible.facts.map((f) => [f.factId, f]));
  const clueById = new Map<string, Clue>(bible.clues.map((c) => [c.clueId, c]));
  const claimById = new Map<string, Claim>(bible.claims.map((c) => [c.claimId, c]));
  const locationById = new Map<string, Location>(
    bible.locations.map((l) => [l.locationId, l]),
  );

  // An evidence id may name either a clue or a fact (refutedBy, correctedBy, etc.).
  const isEvidenceId = (id: string) => clueById.has(id) || factById.has(id);

  // --- Characters ---
  for (const ch of bible.characters) {
    if (!locationIds.has(ch.placement.homeLocationId)) {
      errors.push(`character ${ch.characterId}: homeLocationId ${ch.placement.homeLocationId} not found`);
    }
    if (ch.placement.altLocationId && !locationIds.has(ch.placement.altLocationId)) {
      errors.push(`character ${ch.characterId}: altLocationId ${ch.placement.altLocationId} not found`);
    }
    for (const claimId of ch.knowledgeSlice) {
      const claim = claimById.get(claimId);
      if (!claim) {
        errors.push(`character ${ch.characterId}: knowledgeSlice references unknown claim ${claimId}`);
      } else if (claim.characterId !== ch.characterId) {
        errors.push(`character ${ch.characterId}: knowledgeSlice claim ${claimId} belongs to ${claim.characterId}`);
      }
    }
  }

  // --- Facts: value shape must agree with declared type ---
  for (const f of bible.facts) {
    const implied = inferType(f.value);
    if (implied !== f.type) {
      errors.push(`fact ${f.factId}: value shape implies "${implied}" but type is "${f.type}"`);
    }
  }

  // --- Claims ---
  for (const cl of bible.claims) {
    if (!characterIds.has(cl.characterId)) {
      errors.push(`claim ${cl.claimId}: characterId ${cl.characterId} not found`);
    }
    const fact = factById.get(cl.factId);
    if (!fact) {
      errors.push(`claim ${cl.claimId}: factId ${cl.factId} not found`);
    } else {
      const implied = inferType(cl.statedValue);
      if (implied !== fact.type) {
        errors.push(`claim ${cl.claimId}: statedValue shape "${implied}" does not match fact ${fact.factId} type "${fact.type}"`);
      }
    }
    if (cl.veracity === "lie") {
      if (!cl.refutedBy || cl.refutedBy.length === 0) {
        errors.push(`claim ${cl.claimId}: a lie must carry refutedBy`);
      }
      for (const id of cl.refutedBy ?? []) {
        if (!isEvidenceId(id)) errors.push(`claim ${cl.claimId}: refutedBy ${id} is not a known clue or fact`);
      }
    }
    if (cl.veracity === "mistaken") {
      if (!cl.correctedBy || cl.correctedBy.length === 0) {
        errors.push(`claim ${cl.claimId}: a mistake must carry correctedBy`);
      }
      for (const id of cl.correctedBy ?? []) {
        if (!isEvidenceId(id)) errors.push(`claim ${cl.claimId}: correctedBy ${id} is not a known clue or fact`);
      }
    }
  }

  // --- Clues ---
  for (const c of bible.clues) {
    const implied = inferType(c.value);
    if (implied !== c.type) {
      errors.push(`clue ${c.clueId}: value shape implies "${implied}" but type is "${c.type}"`);
    }
    const loc = locationById.get(c.locationId);
    if (!loc) {
      errors.push(`clue ${c.clueId}: locationId ${c.locationId} not found`);
    } else if (loc.mandatoryPass !== c.mandatoryPass) {
      errors.push(`clue ${c.clueId}: mandatoryPass ${c.mandatoryPass} disagrees with location ${loc.locationId} (${loc.mandatoryPass})`);
    }
    if (c.isSplitEvidence && loc && !loc.mandatoryPass) {
      errors.push(`clue ${c.clueId}: split evidence must sit at a mandatoryPass location, but ${loc.locationId} is optional`);
    }
    for (const id of c.supportsFactIds) {
      if (!factById.has(id)) errors.push(`clue ${c.clueId}: supportsFactIds references unknown fact ${id}`);
    }
  }

  // --- Questions ---
  for (const q of bible.questions) {
    if ("characterId" in q.target && q.target.characterId && !characterIds.has(q.target.characterId)) {
      errors.push(`question ${q.questionId}: target characterId ${q.target.characterId} not found`);
    }
    if (q.tier === 3) {
      if (!q.contradictionRef) {
        errors.push(`question ${q.questionId}: tier 3 confront requires contradictionRef`);
      } else {
        if (!claimById.has(q.contradictionRef.claimId)) {
          errors.push(`question ${q.questionId}: contradictionRef claim ${q.contradictionRef.claimId} not found`);
        }
        for (const id of q.contradictionRef.evidenceIds) {
          if (!isEvidenceId(id)) errors.push(`question ${q.questionId}: contradictionRef evidence ${id} is not a known clue or fact`);
        }
      }
    }
    for (const id of q.preconditions?.cluesHeld ?? []) {
      if (!clueById.has(id)) errors.push(`question ${q.questionId}: precondition cluesHeld references unknown clue ${id}`);
    }
    for (const id of q.effects?.revealsClaimIds ?? []) {
      if (!claimById.has(id)) errors.push(`question ${q.questionId}: effects revealsClaimIds references unknown claim ${id}`);
    }
    for (const id of q.effects?.unlocksQuestionIds ?? []) {
      if (!bible.questions.some((other) => other.questionId === id)) {
        errors.push(`question ${q.questionId}: effects unlocksQuestionIds references unknown question ${id}`);
      }
    }
  }

  // --- Corroboration map ---
  for (const entry of bible.corroborationMap) {
    if (!factById.has(entry.factId)) {
      errors.push(`corroborationMap: entry references unknown fact ${entry.factId}`);
    }
    for (const b of entry.bearing) {
      const known = b.sourceType === "claim" ? claimById.has(b.sourceId) : clueById.has(b.sourceId);
      if (!known) errors.push(`corroborationMap[${entry.factId}]: ${b.sourceType} ${b.sourceId} not found`);
    }
  }

  // --- ME report ---
  if (bible.meReport) {
    const me = bible.meReport;
    const refs: Array<[string, string | undefined]> = [
      ["causeOfDeathFactId", me.causeOfDeathFactId],
      ["timeOfDeathFactId", me.timeOfDeathFactId],
      ["weaponClassFactId", me.weaponClassFactId],
      ["defensiveWoundsFactId", me.defensiveWoundsFactId],
      ["toxicologyFactId", me.toxicologyFactId],
    ];
    for (const [field, id] of refs) {
      if (id && !factById.has(id)) errors.push(`meReport.${field} references unknown fact ${id}`);
    }
    const tod = factById.get(me.timeOfDeathFactId);
    if (tod && tod.type !== "time") {
      errors.push(`meReport.timeOfDeathFactId must reference a time-type fact, got "${tod.type}"`);
    }
  }

  // --- Resolution ---
  const r = bible.resolution;
  const requireCharacter = (id: string, field: string) => {
    if (!characterIds.has(id)) errors.push(`resolution.${field} references unknown character ${id}`);
  };
  if (r.class === "perp") requireCharacter(r.perpCharacterId, "perpCharacterId");
  if (r.class === "framing") {
    requireCharacter(r.framedAgentId, "framedAgentId");
    requireCharacter(r.offenderId, "offenderId");
  }
  if (r.class === "collusion") {
    requireCharacter(r.framedAgentId, "framedAgentId");
    for (const id of r.colluderIds) requireCharacter(id, "colluderIds");
    for (const id of r.splitEvidence) {
      const clue = clueById.get(id);
      if (clue) {
        if (!clue.isSplitEvidence) errors.push(`resolution.splitEvidence ${id} is not flagged isSplitEvidence on its clue`);
        const loc = locationById.get(clue.locationId);
        if (loc && !loc.mandatoryPass) {
          errors.push(`resolution.splitEvidence ${id} sits at optional location ${loc.locationId}; split evidence must be at a mandatoryPass location`);
        }
      } else if (!factById.has(id)) {
        errors.push(`resolution.splitEvidence references unknown clue or fact ${id}`);
      }
    }
  }

  // --- Scoring spec evidence refs ---
  for (const ref of bible.scoringSpec.requiredEvidenceChain) {
    const known = ref.kind === "fact" ? factById.has(ref.id) : clueById.has(ref.id);
    if (!known) errors.push(`scoringSpec.requiredEvidenceChain references unknown ${ref.kind} ${ref.id}`);
  }

  return errors;
}

/* ----------------------------------------------------------------- */
/* Run                                                                 */
/* ----------------------------------------------------------------- */

function main(): void {
  const schema = loadJson(schemaPath) as object;
  const data = loadJson(fixturePath);

  console.log(`Validating ${fixturePath}`);
  console.log(`Against schema ${schemaPath}\n`);

  const schemaErrs = schemaErrors(schema, data);
  // Only run semantic checks if the structure is sound enough to trust the shape.
  const semanticErrs = schemaErrs.length === 0 ? semanticErrors(data as CaseBible) : [];

  const all = [...schemaErrs, ...semanticErrs];

  if (all.length === 0) {
    console.log("PASS: case bible is valid (schema + semantic invariants).");
    process.exit(0);
  }

  console.error(`FAIL: ${all.length} error(s):\n`);
  for (const e of all) console.error(`  - ${e}`);
  if (schemaErrs.length > 0) {
    console.error("\n(Semantic invariant checks were skipped because schema validation failed first.)");
  }
  process.exit(1);
}

main();
