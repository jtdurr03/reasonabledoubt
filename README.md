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
npm test             # runs the unit tests (comparator + runner)
npm run compare      # computes derived data for the reference fixture (step two)
npm run play         # plays the reference case in the terminal (step three)
npm run autosolve    # asserts the reference case is solvable by its intended path
npm run bake         # Engine B: bakes performed dialogue for the case (needs ANTHROPIC_API_KEY)
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

## Step two: the comparator

The comparator measures the distance between two values about the same fact and
maps that distance to a normalized severity and a band. Corroboration and
contradiction are the same operation read from opposite ends: a small distance
reads as agreement (corroboration), a large distance reads as contradiction, and
the middle is graded. It is one comparator, not two systems.

Source lives under `src/comparator/`:

| File | What it is |
| --- | --- |
| `metrics/{time,location,count,identity,object,event,relationship}.ts` | One distance metric per fact type. |
| `config.ts` | Every tolerance and severity threshold, in one place, each documented. |
| `classify.ts` | The shared rawDistance to (severity, band) mapping. |
| `index.ts` | `compare`, `computeContradictionMatrix`, `computeCorroborationMap`, `computeDerived`. |
| `cli.ts` | Loads a bible, computes derived data, writes the enriched bible plus a readable report, and re-validates. |

### Run command

```sh
npm run compare                       # the reference fixture
npm run compare -- path/to/x.case.json
```

It writes `<input>.enriched.json` (the bible with a `derived` block) and
`<input>.report.md`, then confirms the enriched bible still validates against
the schema. These two outputs are computed artifacts and are git-ignored;
regenerate them with `npm run compare`.

### The per-type metrics

Every metric returns `{ rawDistance, severity, band }`. `rawDistance` is in the
metric's natural unit, `severity` is normalized 0.0 (identical) to 1.0
(maximally far), and `band` is one of agreement, minor, moderate, major. All
thresholds live in `config.ts`.

- **time** is continuous, in minutes on the 24-hour clock. Point-to-point is
  absolute minutes apart; point-to-window is 0 inside the window, else minutes
  to the nearest edge; window-to-window is 0 on overlap, else the gap. A few
  minutes is agreement, tens of minutes minor, around an hour moderate, multiple
  hours major. Midnight-wrapping windows are out of scope for this version (the
  game's cases run within an evening).
- **location** is hierarchical over district contains building contains room.
  rawDistance is the climb to the lowest common ancestor: same room 0, same
  building 1, same district 2, different district 3.
- **count** is numeric. The default mode is absolute difference, which matches
  the project's examples directly (off-by-one is minor, two versus six is
  major). A proportional mode is provided in config for large-count cases and is
  not the default.
- **identity** is categorical with fuzzy edges. Same character ref is 0,
  different refs is a hard conflict. Descriptors compare by a weighted sum of
  attribute mismatches, with hard attributes (sex, an incompatible height band)
  weighted so any single one is major: a tall man does not match a short woman.
  A bare descriptor compared against a character reference cannot be resolved by
  a pure value metric (the character's attributes are not in the value), so it
  returns a moderate "cannot confirm" distance.
- **object** is category first, then subtype, then attributes. Different
  category is major; same category and different subtype is minor to moderate;
  same category and subtype is near 0.
- **event** and **relationship** are intentionally coarse in this version. event
  compares type and description; relationship compares relation type and the two
  parties. They return a sensible band and are flagged here as deliberately
  simple, to be deepened in a later step.

### Magnitude versus veracity: why the comparator never infers one from the other

This is the load-bearing rule. **Magnitude drives only the visual severity of a
flag. It never decides whether a discrepancy is a lie or an honest mistake.**
That classification lives in the bible's authored `Claim.veracity` tag, written
by the truth layer.

In code this is enforced structurally: no metric, and nothing in `compare`, ever
receives a veracity. Metrics take values only. Veracity is read in exactly one
place, `classifyCorroboration`, and only to label an agreement that distance has
already found (genuine, mistakenConsensus, or collusive). A small lie and a small
honest slip produce the identical distance, severity, and band, and the
comparator treats them identically. The reference fixture plants an eight-minute
lie (`CL_webb_calltime`) precisely to prove this: it lands in the minor band, yet
it is and stays a lie purely from its tag. See the decoupling test in
`src/comparator/fixture.test.ts`.

The hidden corroboration classification is for the later DA scorer only. It is
never shown to the player or the dialogue runtime.

### Why it runs at generation time, not in Unity

The comparator is pure, deterministic functions over bible data. Running it once
at case-generation time bakes the contradiction matrix and corroboration map
into the shipped bible as the `derived` block. The Unity runtime then reads those
precomputed results and never reimplements a comparison. That keeps the bible the
single source of truth (the runtime cannot drift from or contradict it), makes
the results trivially testable server-side, and keeps no comparison logic, and no
thresholds, on the client.

### Tests

`npm test` runs the suite in `src/comparator/`:

- `metrics.test.ts`: per-type unit tests for time, location, count, identity, and
  object, each at agreement, a middle band, and major, plus the dispatch and the
  incomparable (mismatched types return an explicit result, never throw) tests.
- `fixture.test.ts`: the planted-target tests against the reference fixture, the
  time alibi major contradiction, the genuine two-witness corroboration, the
  honest-mistake contradiction at a proportionate severity, and the decoupling
  test for the small lie.

## Step three: the headless runner

A terminal REPL over one enriched bible. It is the first playable prototype and
the canonical specification of the runtime rules that Unity will mirror in C#.
The full rule contract is in [RULES.md](RULES.md); the rules themselves live in
`src/runner/rules.ts` with no terminal I/O.

| File | What it is |
| --- | --- |
| `src/runner/state.ts` | Player state model and low-level transitions. |
| `src/runner/rules.ts` | The pure runtime rules: availability, budget, the relevance bonus, flag visibility, timeline conflicts, and the verdict scorer. No I/O. |
| `src/runner/actions.ts` | Orchestration: composes rules and state into player actions, returning messages. |
| `src/runner/cli.ts` | The interactive terminal interface. The only file with I/O. |
| `src/runner/autosolve.ts` | Drives the engine along SOLUTION.md and asserts a win. |
| `src/runner/loadCase.ts` | Loads a bible and ensures it carries the comparator's derived data. |

### Run commands

```sh
npm run play         # interactive, on the reference fixture
npm run autosolve    # the solvability assertion (also runs under npm test)
```

In `play`, type `help` for commands: `look`, `map`, `go`, `search`, `talk`,
`ask`, `flags`, `timeline`, `place`, `board`, `link`, `notebook`, `evidence`,
`accuse`, `quit`. The session transcript is written to `transcripts/` on exit.

What the runner does and does not do: it reads the baked contradiction matrix and
corroboration map and only decides visibility, availability, budget, and the
verdict. It does not compute distances (the comparator did), does not decide
veracity (the truth layer did, via `Claim.veracity`), and does not perform
witness lines in character (that is step four; answers here are the authored
`Claim.factualSpine` printed plainly).

### Schema and type additions in this step

- `Claim.factualSpine` (optional string): the plain authored sentence the runner
  prints as the witness's answer and Engine B will later perform.
- `ScoringSpec.minimumSufficientChain` (optional): the minimum core a winning
  accusation must cite, a subset of `requiredEvidenceChain`, so the verdict is
  deterministic. If absent, the full `requiredEvidenceChain` is the core.

### The verdict scorer is the canonical scorer

`scoreVerdict` in `rules.ts` is a pure function. It checks the accused against
the resolution, the cited chain against `minimumSufficientChain`, the strength
hierarchy (a chain must rest on at least one physical or ME item), and unexplained
perp lies. Step ten wraps it with DA dialogue and the collusion higher bar,
reusing this logic.

### Playtesting notes (what the text prototype reveals about the loop)

Playing the reference case repeatedly through the CLI surfaced these, recorded
now because finding them in text is the point of this step:

- **The interview is on rails.** Because willingness is fully encoded in the
  authored question tree and traits are deliberately ignored here, every witness
  answers flatly and the "right" path is the only path. This is expected: the
  flavor and friction are Engine B's job (step four). The loop's spine works,
  but it is not yet fun on its own.
- **The 8-minute call-time lie is barely felt.** It flags faint and the player
  can win without ever resolving it (the verdict reports it as unexplained but
  still passes). That is the intended magnitude-versus-veracity decoupling, but
  it shows that small lies need a reason to matter, otherwise players will learn
  to ignore faint flags. A future step could let small lies chain into a larger
  inconsistency.
- **The clue board is currently inert to scoring.** Links are recorded and
  marked supported or not, but the verdict reads the cited chain directly, not
  the board. The board is a thinking aid, not yet a mechanic. Worth deciding in a
  later step whether the board should feed the accusation automatically.
- **Citing is fiddly in text.** The player types evidence ids by hand at
  conclusion. In Unity this becomes drag-from-board, so the friction is a
  terminal artifact, not a design flaw. Noted so the port does not preserve it.
- **It is mildly gameable by exhaustion.** With enough budget a player can ask
  every available question without reasoning, since asking is the only way to
  reveal claims. The gating and budget limit this, and the relevance bonus
  rewards real discovery, but a thorough brute-forcer still reaches the answer.
  The intended counter is Engine B making blind probing costly and unpleasant.

## Step four: Engine B, the dialogue performer

Engine B performs each claim's authored factual spine in character, so a witness
sounds like a specific person from 1960s Los Angeles instead of reading a flat
sentence, while remaining provably unable to say anything untrue to the case.

Source lives under `src/engineB/`:

| File | What it is |
| --- | --- |
| `traits.ts` | Trait vector to behavioral flags (pure, tested). The raw numbers never reach the model. |
| `prompt.ts` | Prompt assembly with the hard constraints. |
| `client.ts` | The Anthropic client behind a mockable `ModelClient` interface. Key and models from the environment. |
| `guard.ts` | The leak verifier, regenerate-on-leak, and the spine fallback. |
| `cache.ts` | The cache and the generated dialogue artifact (a sidecar file). |
| `bake.ts` | Enumerates reachable lines, performs, guards, and stores them. |
| `index.ts` | The `perform` function tying it together. |

### Engine B is a voice, never a fact source

This is the load-bearing rule. Engine B is handed the exact content to deliver
(a claim's `factualSpine`) and performs it in character. It does not reason about
the case, choose what is true, or decide whether to lie. When a claim is authored
as a lie, the spine already contains the lie and Engine B delivers it
convincingly without correcting it. Veracity, gating, budget, and scoring live in
the bible and in `rules.ts`; Engine B touches none of them, and `personaRole`
never even tells the model who is guilty (a perp, a suspect, and a framed agent
are all just "a person of interest").

The never-invent-facts property holds **by construction**, not by hope:

1. The model is given the content to say, not asked to invent it.
2. Every produced line is verified against the allowed slice (the claim content)
   by a cheap verifier model that returns pass or fail with the offending span.
3. A leaking line is regenerated with a tightened instruction, up to a configured
   number of retries.
4. If it still leaks, the guard ships the plain `factualSpine`, which by
   definition cannot leak. So a leaking line is never shipped.

### Bake at generation time, not at runtime

The question menu is a finite gated set and each answer's content is already
authored, so the complete set of producible lines is enumerable. `npm run bake`
performs and validates every reachable line once, at generation time, and writes
them to a sidecar dialogue artifact (`<case>.dialogue.json`, git-ignored). The
runner and the eventual Unity runtime read baked lines and make no live model
calls. The cache prevents duplicate work: re-running the bake reuses lines
already present.

**Cost note:** the bake cost is paid once per case at generation time. That is
the point of doing it here rather than at runtime, where every play would
otherwise pay for the same lines again.

### Trait-to-flags translation

`traits.ts` maps each hidden 0-to-100 trait to a plain behavioral flag about
willingness and delivery, only at the tails (a high `authorityDeference` becomes
"Defers to a detective's authority and answers fully when pressed"; a low
`composure` becomes "Rattles easily and grows flustered under confrontation").
Mid-range traits produce no flag, keeping the outliers meaningful. The raw
numbers are never placed in the prompt. The Medical Examiner and District
Attorney are exempt and perform through a fixed professional register, not trait
translation.

### Model configuration

Set in the environment (see `.env.example`), with documented defaults in
`config.ts`:

- `ANTHROPIC_API_KEY` (required only for `npm run bake`; everything else is offline).
- `ENGINE_B_PERFORMER_MODEL` (default `claude-opus-4-8`): performs the voice.
- `ENGINE_B_VERIFIER_MODEL` (default `claude-haiku-4-5`): the cheaper, faster leak verifier.

### Runner integration

`npm run play` uses performed dialogue when a baked sidecar exists, and falls back
to the plain spine otherwise. Type `mode raw` or `mode performed` in the REPL to
toggle, or launch with `--raw` to force spines. `rules.ts` is unchanged: gating,
budget, flagging, and scoring are exactly as in step three. Engine B only changes
how an answer reads, never which answer is given or what it costs.

### Tests

`npm test` runs `src/engineB/engineB.test.ts` fully offline with a mocked client:
the trait translator (and that no raw number is emitted), the leak verifier
catching an out-of-slice assertion and passing a clean line, the spine fallback
after repeated leaks (and that the runner uses it), a lie performed as the lie,
delivery differing while the facts stay identical, the cache preventing duplicate
calls, and the ME professional register. `integration.test.ts` bakes one real
line and is skipped unless `ANTHROPIC_API_KEY` is set, so CI stays offline.

## Step five: Engine A, the case generator

Engine A generates the case bibles that were hand-fed until now. The governing
decision: **the logic is deterministic, and the prose is the only thing the model
touches.** Deterministic code owns the ground truth, every character's knowledge,
every lie anchored to a refuting clue and every mistake to a correcting fact, the
clue placements, the question gating, the scoring spec, and the intended solution
chain. The model is only a content-fill pass that writes names, factualSpine
prose, the title, location names, and clue discovery methods into slots the code
already defined. The model never decides who did it, what is true, where a clue
goes, what gates a question, or whether a case is solvable.

Source lives under `src/engineA/`:

| File | What it is |
| --- | --- |
| `template.ts` | The template type and the one homicide-perp template, as data. |
| `rng.ts` | A seeded deterministic PRNG. |
| `skeleton.ts` | Deterministic structural generation: truth, cast and traits, facts, anchored claims, clues, the question graph, the scoringSpec, and the intended solution chain. Placeholder prose only. |
| `invariants.ts` | The structural invariant checker with named violations. |
| `contentFill.ts` | The model slot-fill pass, reusing Engine B's client, forbidden from altering structure. |
| `solve.ts` | Replays the intended plan through the runner rules (orchestrates `scoreVerdict`). |
| `pipeline.ts` | The eight stages and the reject-and-retry loop. |
| `cli.ts` | Generate a batch across a seed range. |

### The pipeline (exact order)

1. Deterministic skeleton from template plus seed.
2. Schema validation of the structural bible.
3. Invariant check. **Reject and reseed before any model spend.**
4. Content fill (the first model spend; prose into defined slots).
5. Comparator enrich (the baked contradiction matrix and corroboration map).
6. Engine B bake (leak-guarded performed dialogue).
7. Solvability guard (autosolve the intended chain under `rules.ts`).
8. Final schema validation of the complete enriched bible.

Steps 1 to 8 are wrapped in a reject-and-retry loop with a configurable cap. On
the cap it throws a `GenerationError` naming the template and every seed tried,
so a generation bug is reproducible rather than silent.

### The solvability guard (non-negotiable)

Because the generator builds the truth, it knows the intended solution chain by
construction. After assembly, it replays that chain through the real `rules.ts`
(`solve.ts`). If the case is not winnable from its own evidence (an unreachable
refuter, an unsatisfiable confront precondition, a null case without enough
corroboration), it is rejected and regenerated with a new seed. **No unfair case
ships. The engine proves it can solve its own case before releasing it.**

### Anchoring invariants (checked before any model spend)

`invariants.ts` enforces, with named violations: every lie has a reachable
refuter, every mistake has a reachable corrector, every gated question's
preconditions are satisfiable along the intended path, the cited chain meets the
scoringSpec under the strength hierarchy, null cases carry enough corroboration
for a confident "no perp", and trait vectors are present and clamped with the ME
and DA exempt. An unanchored lie or an unreachable refuter is a generation bug,
not a valid case.

### Seeding and reproducibility

A seed produces a reproducible deterministic skeleton (same seed, byte-identical
structure). The only nondeterministic part is the model content fill, which is
frozen into the case once written, so a finished case file is fully reproducible.
Models: the bible build (content fill) uses `claude-opus-4-8` (override with
`ENGINE_A_FILL_MODEL`); the dialogue uses Engine B's defaults (Sonnet performer,
Haiku verifier).

### How to add a template

A crime template is data, not code. Add a `CrimeTemplate` entry to `template.ts`
(crime kind, required roles, location archetypes, the district / weapon / motive
pools, resolution-class weights) and register it in `templates`. The skeleton,
invariants, pipeline, and guard are template-agnostic. Null-case variants and the
remaining templates are later data entries against this same interface.

### Run commands

```sh
npm run generate                      # one homicide-perp case (needs ANTHROPIC_API_KEY)
npm run generate -- homicide-perp 3 1 # three cases, starting at seed 1
npm run gen-test                      # the offline Engine A suite
```

Generated cases land in `generated/` (git-ignored) as a `.case.json` plus a
`.dialogue.json` sidecar, and play in the runner with
`npm run play -- generated/<caseId>.case.json`.

### Tests

`npm run gen-test` runs `src/engineA/engineA.test.ts` fully offline with a mocked
client: determinism (a fixed seed reproduces the skeleton), the invariant
checker, solvability under `rules.ts` with placeholder prose, reject-and-retry
(an orphaned refuter is rejected, retried, and logged with the template and
seeds), schema validity at the structural and final stages, plant parity (a
genuine corroboration, an anchored lie, an anchored mistake, and a time
contradiction), and the full pipeline end to end with no network.

### Deferred

Collusion generation is held out of this step (its schema room exists but no
collusion template is authored). The remaining nineteen templates and the
null-case variants are later content, not new architecture.

### Playtesting notes (real generated cases vs the hand fixture)

I generated several cases with the live models (Opus 4.8 fill, Sonnet dialogue)
and played them through the step-three runner. Honest findings:

- **Solvable: yes, as reliably as the hand fixture.** Every generated case passes
  autosolve and plays to a WIN end to end with performed dialogue, because the
  template reuses the fixture's proven logical shape. The solvability guard is
  doing its job: a case cannot ship unless the generator first wins it.
- **Voiced well.** Witnesses read distinctly: the clerk is precise ("I locked up
  at twenty-one thirty-nine, not a minute before or after"), the liar is terse and
  defensive, the hazy witness is vague on the time, and the ME is clinical. This
  matches the fixture's feel.
- **Interesting: less than the fixture, and that is the expected signal.** Because
  there is one template that mirrors the fixture exactly, every generated case has
  the same beats in the same order (same clue types, same question flow); only the
  names, times, district, weapon, and motive vary. Across cases they feel
  structurally identical. The fix is to enrich the template (more clue variety,
  the second optional witness area, motives expressed differently), not the
  engine, exactly as the task predicts.
- **Two issues found in playtesting, both fixed.** (1) `renderStated` dropped
  object attributes, so the clerk's "the back door was locked" lost the "locked"
  part and the model wrote a confused line. Fixed: object attributes are now
  included in the content the model phrases. (2) Names repeated within a case
  (several "Margaret" in one cast), because each name was an independent model
  call with the same generic prompt. Fixed: each name prompt now lists the names
  already assigned in that case and forbids reuse. Names are pure flavor and never
  affected correctness.

## Out of scope (steps five onward)

The following belong to later steps and are deliberately **not** built here:

- collusion generation (deferred) and the remaining templates (later content);
- any Unity, UI, or graphics (step six onward): the runner is text only and
  `rules.ts` carries no I/O so the port can mirror it;
- the dramatized DA scene and the collusion higher bar (step ten), which reuse
  this step's `scoreVerdict` rather than replacing it.

The model never makes a logical decision: structure is fully deterministic from
the seed, and content fill only writes prose into defined slots. If the model is
being asked who is guilty, where a clue goes, what gates a question, or whether a
case is solvable, that is a bug in the prompt design, not a feature.
