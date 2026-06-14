# Reasonable Doubt: Case Bible Schema and Reference Fixture (Step 1)

A procedural 1960s Los Angeles detective mystery. A server-side generator
(Engine A) writes a complete, internally consistent **case bible** as JSON. At
runtime a dialogue model (Engine B) performs witness characters constrained
strictly to that bible, and a Unity client renders exploration plus three
logbook views. Cases are pre-generated and validated server-side, then shipped
as static bibles.

The single most important rule across the whole project: **the bible is the
source of truth, and no runtime component may ever invent or contradict a fact
in it.**

This repository is **step one of ten**. Its only job is to define the data
contract and hand-author one case that conforms to it. Nothing here executes
game logic, generates cases, or calls a language model. See
[Out of scope](#out-of-scope-for-this-step) below.

> Formatting rule for this repository: never use em-dashes or en-dashes as
> sentence punctuation. Use commas, colons, parentheses, or periods. Ranges are
> written "21:45 to 22:30", not "21:45-22:30".

## Deliverables

| File | What it is |
| --- | --- |
| `schema/case-bible.schema.json` | The canonical contract. JSON Schema draft 2020-12. Every field has a description. |
| `src/types/caseBible.ts` | TypeScript types kept in sync with the schema. The schema wins any disagreement. |
| `fixtures/reference-homicide.case.json` | The hand-authored reference case (a single-perp homicide). |
| `fixtures/SOLUTION.md` | The hidden answer key and scorer target for the reference case. |
| `fixtures/corrupted-homicide.case.json` | A deliberately broken copy used to prove the validator fails loudly. |
| `src/validate.ts` | Ajv-based validator. Schema pass plus cross-object invariant pass. Exits nonzero on any error. |

## Install and run

```sh
npm install

npm run validate     # validates the reference fixture; exits 0 on success
npm run typecheck    # tsc --noEmit; exits 0 on success
```

`npm run validate` prints a PASS line and exits 0 for the reference fixture.

To validate a different bible:

```sh
npm run validate -- path/to/other.case.json
# or
npx tsx src/validate.ts path/to/other.case.json
```

### Proof that it fails loudly on a corrupted case

`fixtures/corrupted-homicide.case.json` is the reference case with two
deliberate breaks: a lie whose `refutedBy` points at a clue that does not
exist, and a clue whose inherited `mandatoryPass` flag disagrees with its
location. Run:

```sh
npm run validate:fail
```

Observed output (exit code 1):

```
FAIL: 2 error(s):

  - claim CL_sid_departtime: refutedBy C_doesnotexist is not a known clue or fact
  - clue C_pawnticket: mandatoryPass true disagrees with location LOC_diner (false)
```

These two breaks are caught by the **semantic** pass (pass 2). The **schema**
pass (pass 1) independently catches structural breaks: for example, deleting
`refutedBy` from a claim whose `veracity` is `lie`, or omitting
`contradictionRef` from a tier-3 question, fails compilation against
`case-bible.schema.json` before pass 2 even runs.

## Design proposal: top-level shape and the Fact-versus-Claim split

### Top-level shape

A `CaseBible` is a flat root object whose major members are arrays of
id-addressed entities, so any object can reference any other by a stable id
string:

```
CaseBible
  schemaVersion, caseId, title, era, crimeTemplateId
  resolution        (discriminated union on `class`)
  locations[]       (5 per case: crime scene, ME office, police station, up to two witness areas)
  characters[]      (victim, ~3 to 4 witnesses/suspects, ME, DA)
  facts[]           (the truth layer)
  claims[]          (what characters assert about facts)
  clues[]           (physical evidence)
  questions[]       (the gated interview menu)
  corroborationMap[](per-fact: which claims and clues bear on it, with hidden tags)
  meReport?         (present only for cases with a body)
  scoringSpec       (how the DA endgame is judged)
```

Keeping entities in flat, id-addressed arrays (rather than deeply nested) is the
choice that keeps the truth layer authoritative: every reference is explicit and
checkable, and no runtime component can quietly imply a relationship that the
bible did not state.

### Fact versus Claim (load-bearing)

This split is the spine of the whole contract.

- A **Fact** is an objective truth in the case world. It has a `type` (one of
  `time, location, count, identity, object, event, relationship`) and a `value`
  whose shape is selected by that type.
- A **Claim** is a single character's assertion about one fact. It carries a
  `statedValue` in the same typed shape, plus a hidden, authoritative
  `veracity` tag: `truthful`, `mistaken`, or `lie`.

Three consequences are designed in deliberately:

1. **The veracity tag is authoritative, not the magnitude of divergence.** A
   small lie (off by minutes) is still a lie; a large honest mistake (off by an
   hour) is still a mistake. The reference case exercises both on purpose.
2. **A lie must name what breaks it (`refutedBy`); a mistake must name what
   corrects it (`correctedBy`).** A lie with no refutation or a mistake with no
   corrector would be unfair or unsolvable, so both are invalid.
3. **Knowledge is fixed by the truth layer, never by traits.** A character's
   `knowledgeSlice` lists the exact claim ids they can produce. Hidden traits
   modulate willingness and delivery only. They never widen or narrow what a
   character knows.

## A short tour of the schema's design decisions

- **JSON Schema is the single source of truth.** The TypeScript types are kept
  in sync from it and the schema wins any disagreement. See the sync note at the
  top of `src/types/caseBible.ts`. A generator path
  (`npm run types:generate`, using `json-schema-to-typescript`) is wired up so
  you can diff a generated file against the hand-authored one; the types are
  hand-authored because the generator flattens the discriminated unions that
  this contract exists to preserve.

- **Discriminated unions instead of optional bags.** `resolution` is a union on
  `class` (`perp`, `accident`, `suicide`, `natural`, `framing`, `collusion`),
  each branch with `additionalProperties: false` so a perp case cannot smuggle
  collusion fields and vice versa. The reference fixture is a `perp` case, but
  full structural room for `collusion` is reserved now (two named narratives,
  `splitEvidence`, narrative-role tagging on facts, claims, and clues).

- **Typed values selected by `type`.** Rather than a loose `value: any`, each of
  Fact, Clue, and Claim carries a `type` and a `value`, and an `if/then` block
  requires the value to match the shape implied by the type (a `time` value is a
  point or a window on a 24-hour clock, a `location` value is a node in a place
  hierarchy, and so on). This is what lets a later comparator reason about
  distance by hierarchy depth or by clock time.

- **Corroboration means agreement, not truth.** `corroborationMap` records, per
  fact, every claim and clue that bears on it with a hidden tag (`genuine`,
  `mistakenConsensus`, `collusive`). The runtime and player never see the tag;
  the scorer does. The strength hierarchy (physical or ME fact outranks
  corroborated testimony outranks a single statement) lives in `scoringSpec`.

- **The ME and DA are explicitly trait-exempt.** `character.traitExempt` is a
  required boolean, and the schema forces it to `true` for `medicalExaminer` and
  `districtAttorney` and to `false` for everyone else (who must then carry a
  full trait vector). The exemption is encoded, not left to convention. The ME
  is a reliable narrator who never lies.

- **The bible stores gates, not budgets.** Questions carry tier, preconditions,
  effects, and a `costsBudget` flag. The runtime (a later step) enforces the
  per-witness question budget. The schema does not run that arithmetic. The
  question tree references facts and contradictions rather than presuming a
  culprit, so a null case ("no perp") or a collusion exposure path is
  expressible. The reference case includes `Q_me_2` ("could this have been an
  accident or self-inflicted?") precisely to show the no-perp question can be
  asked and then ruled out.

### Where a modeling choice was ambiguous

When a choice was unclear, the rule was: pick the option that keeps the truth
layer authoritative and the runtime unable to invent facts.

- **`statedValue` type agreement.** A claim's `statedValue` must use the same
  typed shape as the fact it speaks to. Pure JSON Schema cannot reach across the
  object graph to compare a claim's value against a referenced fact's `type`, so
  this is enforced in the validator (pass 2) and documented on the field.
- **Clue `mandatoryPass`.** A clue denormalizes its location's `mandatoryPass`
  flag for the convenience of later steps. The validator verifies the copy
  matches the referenced location, so the denormalization can never drift.
- **The victim carries a neutral trait vector.** The victim is not ME or DA, so
  the schema requires traits. Rather than special-casing the dead, the reference
  victim is given an all-50 vector and an empty `knowledgeSlice`.

## Invariant coverage

Every invariant called out in the task is either expressed in the schema or, where
JSON Schema cannot reach across the object graph, enforced by the validator and
documented here.

| Invariant | Where enforced |
| --- | --- |
| A `lie` requires `refutedBy` | Schema (`if veracity = lie then required refutedBy`) and validator |
| A `mistaken` claim requires `correctedBy` | Schema (`if veracity = mistaken then required correctedBy`) and validator |
| `refutedBy` / `correctedBy` ids must resolve to a real clue or fact | Validator (cross-object) |
| Split-evidence clue must sit at a `mandatoryPass` location | Validator (cross-object), documented on `clue.isSplitEvidence` and `resolution.collusion.splitEvidence` |
| Clue `mandatoryPass` must match its location's flag | Validator (cross-object) |
| ME and DA are trait-exempt; everyone else carries traits | Schema (`if/then/else` on `role`) |
| Traits never alter knowledge | Documented on `traits` and `knowledgeSlice`; structurally, knowledge is a separate `knowledgeSlice` field that traits cannot touch |
| A claim's `statedValue` type matches its fact's `type` | Validator (cross-object), documented on `claim.statedValue` |
| Fact / Clue `value` shape matches its `type` | Schema (`if/then` per type) and validator |
| Tier-3 confront requires `contradictionRef` | Schema (`if tier = 3 then required contradictionRef`) |
| `meReport.timeOfDeathFactId` references a `time`-type fact | Validator (cross-object) |
| All id references resolve (characters, locations, facts, clues, claims, questions) | Validator (cross-object) |
| Resolution branch fields are exclusive per `class` | Schema (`oneOf` with `additionalProperties: false`) |

JSON Schema draft 2020-12 cannot express constraints that compare values across
two different objects (for example "this claim's value type equals the type of
the fact it references" or "this split-evidence clue's location is
`mandatoryPass`"). Those live in `src/validate.ts` pass 2, are listed above, and
are documented on the relevant schema fields.

## Out of scope for this step

The following belong to later steps and are deliberately **not** built here:

- the type-aware distance comparator for corroboration and contradiction,
- the headless case runner (step 3),
- the case generator (Engine A),
- the dialogue layer (Engine B),
- any language-model or network calls,
- any Unity or UI code,
- any scoring runtime (the `scoringSpec` is a stored specification, not an
  executable scorer).

This step is schema and fixture only. If a change starts to add comparison logic
or game flow, it has left the scope of step one.
