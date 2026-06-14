# RULES.md: the runtime rules contract

This document specifies every runtime rule the headless runner implements, in
plain language. The Unity C# port (step eight) must reproduce these exactly. The
authority is `src/runner/rules.ts`, which contains no terminal I/O so it can be
mirrored directly. When this document and the code disagree, the code is
correct and this document is the bug.

Formatting note: no em-dashes or en-dashes. Ranges are written "10 to 13".

## What the runner does and does not do

- It reads the enriched bible: the authored case plus the comparator's baked
  `derived` block (contradiction matrix and corroboration map).
- It does not compute distances or decide veracity. The comparator did that at
  generation time. The runner only decides visibility, availability, budget, and
  the verdict.
- Witness answers are the authored `Claim.factualSpine` printed verbatim. There
  is no dialogue model here (that is step four).

## Player state

- `currentLocation`: the location the player is at.
- `cluesHeld`: ids of discovered physical clues.
- `claimsHeard`: ids of claims revealed through questions.
- `questionsAsked`: ids of questions already asked.
- `unlockedQuestions`: ids explicitly unlocked by asking another question.
- `budgetSpent` per witness, `bonusGranted` per witness, `bonusCountedQuestions`
  per witness.
- `contradictionsFound`: keys of surfaced matrix entries.
- `resolvedContradictions`: claim ids confronted through a tier-3 question.
- `timeline`, `clueBoard`, `transcript`.

## Travel and presence

- The player moves freely among the case's present locations.
- A character's current location is their `placement.homeLocationId`. This
  runner does not move characters. The model supports movement
  (`placement.canMove` and `altLocationId`), but no movement trigger fires in
  this step. A later step may add triggers; the port should keep the field.
- A character is interviewable at a location when they are present, are not the
  victim, and have at least one question targeting them.

## Scene exploration

- Searching a location discovers every not-yet-held clue placed there, adding
  each to `cluesHeld` and printing its authored description and
  `discoveryMethod`.
- Clues exist because the truth layer placed them. The runner reveals; it never
  invents.
- After a search, run the relevance-bonus reconciliation and the
  contradiction-flag check (below).

## Interview: question availability

A question targeting a witness is available to ask when all of these hold:

1. It has not already been asked.
2. If it is unlock-gated, it has been unlocked. A question is unlock-gated when
   some other question lists it in `effects.unlocksQuestionIds`. It becomes
   unlocked when an unlocking question is asked.
3. Its preconditions are met:
   - every id in `preconditions.cluesHeld` is in `cluesHeld`;
   - every id in `preconditions.claimsCorroborated` is corroborated (it is a
     fact whose corroboration entry has `corroborated: true`, or a claim that is
     a member of such an entry, read from the baked corroboration map);
   - every id in `preconditions.contradictionsFound` names a claim that appears
     in at least one surfaced matrix entry.

Tiers are labels for the player: 1 baseline, 2 clue-gated, 3 confront.

## Interview: budget

- Each witness starts with a base budget of 10 questions (`BASE_BUDGET`).
- A probing question (`costsBudget: true`) costs 1 (`PROBE_COST`).
- Deploying an already found contradiction, a confront (`costsBudget: false`),
  costs 0 (`CONFRONT_COST`). It is free even when the budget is exhausted.
- A witness's limit is `10 + bonusGranted`. A probing question can be asked only
  when `remaining >= cost`. A free confront can always be asked when available.

### The relevance bonus (exact definition)

A witness gains 3 additional questions (`RELEVANCE_BONUS`) when newly found
evidence is relevant to that specific witness. "Relevant" means: the new
evidence unlocks at least one previously unavailable evidence-gated question for
that witness.

Precise rule, as implemented in `detectRelevanceBonus`:

- An evidence-gated question is one with a non-empty evidence precondition
  (`cluesHeld`, `claimsCorroborated`, or `contradictionsFound`).
- Reconciliation runs after the player acquires evidence: discovering a clue or
  surfacing a contradiction. It does not run after ordinary testimony, so simply
  hearing a witness answer never grants a bonus.
- For each witness, find evidence-gated questions whose evidence preconditions
  are now satisfied and that have not yet counted toward a bonus for that
  witness. If at least one exists, grant +3 to that witness once for this
  reconciliation, and mark all such questions as counted.
- Because each question counts at most once, the bonus cannot be farmed. Two
  distinct later discoveries that each unlock a fresh question grant +3 each.

The bonus fires per witness, not globally. Generic clue discovery does not grant
a bonus to witnesses for whom nothing new is unlocked. (Example: discovering the
back-door latch unlocks a question for Dolores and grants her +3, but grants Sid
nothing, because that clue unlocks no Sid question.)

## Interview: asking

Asking an available, affordable question:

1. Marks it asked and spends its cost from the witness's budget.
2. Reveals each id in `effects.revealsClaimIds` into `claimsHeard` and prints the
   claim's `factualSpine` as the witness's answer.
3. Unlocks each id in `effects.unlocksQuestionIds`.
4. If it is a tier-3 confront with a `contradictionRef`, records the referenced
   claim id in `resolvedContradictions` (the contradiction is now deployed).
5. Runs the contradiction-flag check, since a newly heard claim can complete a
   pair.

Traits are not interpreted in this step. Willingness is encoded entirely in the
authored question tree (which tier reveals which claim under which
preconditions). Trait-driven delivery is step four.

## Auto-flagging contradictions

- The comparator baked a contradiction matrix: pairwise comparisons keyed by
  fact, each with `band` and `severity`.
- A matrix entry is visible when its band is not `agreement` and the player
  holds both sources. Holding a source means: a claim is in `claimsHeard`, a
  clue is in `cluesHeld`, and a fact is known (the player has heard a claim about
  it or holds a clue that supports it, which is how an ME finding becomes held).
- When an entry becomes visible, surface it once and record its key in
  `contradictionsFound`.
- Severity scaling for display, by band: `agreement` shows no flag, `minor` is
  faint, `moderate` is noticeable, `major` is loud. This is the baked magnitude,
  scaled per type by the comparator.
- Magnitude never tells the player whether a discrepancy is a lie. The flag says
  only "these disagree, by this much." Whether it is a crackable lie is decided
  by the truth layer and proven only through the confront path, never inferred
  from severity.

## Timeline

- The player places time-typed facts and claims into the timeline.
- A conflict among placed cards is a matrix entry (not `agreement`) whose both
  sources are currently on the timeline. It is flagged with the same severity
  scaling and recorded in `contradictionsFound`. This is the same flag system
  rendered as a timeline.
- Because surfacing a contradiction can satisfy a `contradictionsFound`
  precondition, a confront the conflict unlocks then appears in the relevant
  witness's menu.

## Clue board

- The player draws links between any nodes they hold (clues, claims, ME facts).
- A link is truth-supported when both nodes bear on a common fact (a claim's
  `factId`, a clue's `supportsFactIds`, or the fact itself). Supported links
  count toward case strength.
- Unsupported links are recorded but inert. They are never punished.

## Conclusion and the verdict (the canonical scorer)

The verdict is computed by `scoreVerdict(bible, accusation)`, a pure function.
The accusation carries the accused id (or null for "no perp"), the cited
evidence chain, and the resolved contradictions. Step ten will wrap this with DA
dialogue and the collusion higher bar, reusing this logic unchanged.

The algorithm, in order:

1. **Target.** Determine the correct target from the resolution: a perp case
   wants `perpCharacterId`; accident, suicide, and natural want null (no perp);
   framing wants the offender; collusion wants a colluder who is not the framed
   agent. If the accusation's target is wrong, the verdict is a loss with the
   reason stated (named someone on a no-perp case, declared no perp when there is
   one, or accused the wrong person). Scoring stops here.

2. **Sufficiency.** The cited chain must cover the `minimumSufficientChain` (the
   authored core, a subset of `requiredEvidenceChain`). If
   `minimumSufficientChain` is absent, the full `requiredEvidenceChain` is the
   core. Any core id not cited is missing, and a missing core is a loss.

3. **Strength hierarchy.** Each cited item has a strength: a physical clue or an
   ME fact is strongest (3), corroborated testimony (a fact whose corroboration
   entry is corroborated) is middle (2), and a single uncorroborated statement is
   weakest (1). The chain must rest on at least one strength-3 item. A chain that
   rests only on testimony is a loss.

4. **Unexplained contradictions.** For a perp case, each of the perp's lying
   claims must be broken, either by citing all of that claim's `refutedBy`
   evidence or by having confronted it (its claim id is in
   `resolvedContradictions`). Unbroken perp lies are reported as "left
   unexplained" and reduce the thoroughness reading. Outside collusion they do
   not by themselves lose a case whose core is proven by physical evidence.
   Collusion raises this to a hard bar in step ten.

A win requires a correct target, a sufficient core, and adequate strength.
Thoroughness is the fraction of `requiredEvidenceChain` cited and is reported for
flavor; it does not change win or loss.

## Constants (all tuning in one place)

In `src/runner/rules.ts`:

- `BASE_BUDGET = 10`
- `RELEVANCE_BONUS = 3`
- `PROBE_COST = 1`
- `CONFRONT_COST = 0`

Severity band to display label: agreement to none, minor to faint, moderate to
noticeable, major to loud.
