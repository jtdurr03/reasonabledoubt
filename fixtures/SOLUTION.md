# SOLUTION: The Bunker Hill Bottle (reference-homicide-001)

This file is the ground truth and scorer target for the reference fixture
`reference-homicide.case.json`. It is the hidden answer key. Later steps
(notably step 3's headless runner) will be checked against what is written
here. Nothing in this document is shown to the player.

Formatting note: this project never uses em-dashes or en-dashes as sentence
punctuation. Ranges are written as "21:45 to 22:30".

## Ground truth

Resolution class: `perp`. The guilty party is **Marcus Webb** (`CH_webb`).

What actually happened on the night of the murder:

- 21:15. Clerk **Dolores Vane** locks the front door and leaves. Leo Hatcher
  is alive. (Fact `F_dolores_departure`.)
- 21:48. Regular customer **Sid Brunner** is still in the shop and pawns a
  watch. The pawn ledger stamps the transaction. (Fact `F_sid_presence`.)
- 21:55. **Marcus Webb** arrives. His car is seen by Sid. (Fact
  `F_webb_presence`.) Webb enters through the back alley door, whose latch he
  forces. (Fact `F_backdoor_state`.)
- About 22:00. Webb argues with Leo over a large gambling debt Webb owes him
  (Fact `F_webb_debt`) and strikes him with a heavy glass whiskey bottle. The
  blow is the crash heard from the alley. (Fact `F_crash_time`.) The victim's
  wristwatch shatters and stops at 22:05.
- Webb leaves. Leo dies inside the Medical Examiner window of 21:45 to 22:30
  (Fact `F_tod`).

Cause of death is blunt force trauma to the head (`F_cause`), the weapon is a
glass bottle used as a blunt instrument (`F_weapon`), there are two defensive
bruises that rule out accident and suicide (`F_defensive`), and toxicology is
clean (`F_tox`). This is unambiguously a homicide.

## Cast and their function

| Character | Role | Function in the puzzle |
| --- | --- | --- |
| Leo Hatcher (`CH_leo`) | victim | The body. Produces no claims. |
| Marcus Webb (`CH_webb`) | perp | The killer. Lies about his whereabouts and his debt. |
| Dolores Vane (`CH_dolores`) | witness | Honest, deferential, reliable. One genuine corroboration plus one honest assumption that proves wrong. |
| Sid Brunner (`CH_sid`) | witness | Hostile, self-interested, dishonest. Lies to stay out of it, then (once caught) yields the truth he was hiding. |
| Etta Maris (`CH_etta`) | witness | Honest but poor memory. Makes a good-faith time error. |
| Dr. Howard Quayle (`CH_me`) | medicalExaminer | Reliable narrator, trait-exempt, never lies. |
| Patricia Lund (`CH_da`) | districtAttorney | Trait-exempt. Judges the final accusation. |

Trait outliers (each 0 to 100, hidden from the player):

- Hostile / rebellious tail: Sid Brunner, `authorityDeference` = 8.
- Deferential tail: Dolores Vane, `authorityDeference` = 88.
- Poor memory tail: Etta Maris, `memoryReliability` = 18 (the source of her
  honest mistake).

Traits modulate only willingness and delivery, never knowledge. Each
character's knowledge is fixed by their `knowledgeSlice`.

## Claims: lies versus mistakes, and what breaks each

| Claim | Speaker | About | Stated | Veracity | Broken by |
| --- | --- | --- | --- | --- | --- |
| `CL_dolores_departtime` | Dolores | `F_dolores_departure` | left 21:15 | truthful | matches the fact |
| `CL_etta_seedolores` | Etta | `F_dolores_departure` | saw Dolores leave ~21:15 | truthful | matches the fact |
| `CL_dolores_backdoor` | Dolores | `F_backdoor_state` | back door was locked | **mistaken** | `C_backdoor_latch` (latch forced from the alley) |
| `CL_etta_crashtime` | Etta | `F_crash_time` | crash near 23:00 | **mistaken** | `F_tod` and `C_stopped_watch` (death 21:45 to 22:30; watch stopped 22:05) |
| `CL_sid_departtime` | Sid | `F_sid_presence` | left by 21:00 | **lie** | `C_pawnticket` (pawn stamp at 21:48) |
| `CL_sid_sawcar` | Sid | `F_webb_presence` | saw Webb's car at 21:55 | truthful | matches the fact (revealed only after the lie is cracked) |
| `CL_webb_alibi` | Webb | `F_webb_location_tod` | at the Tiki Room | **lie** | `C_bottle_prints` plus `F_tod` |
| `CL_webb_debt_denial` | Webb | `F_webb_debt` | owed nothing | **lie** | `C_ledger_debt` |
| `CL_me_tod` | ME | `F_tod` | 21:45 to 22:30 | truthful | reliable narrator |
| `CL_me_cause` | ME | `F_cause` | blunt force trauma | truthful | reliable narrator |
| `CL_me_defensive` | ME | `F_defensive` | two defensive bruises | truthful | reliable narrator |

Note that magnitude of divergence does not determine veracity. Sid's lie moves
his departure by only 48 minutes, while Etta's honest mistake is off by about
an hour. The lie is the lie because of intent (`veracity`), not because of size.

## The planted set pieces (what later steps test against)

1. **Genuine corroboration by two independent witnesses.**
   `F_dolores_departure` is asserted truthfully by both Dolores
   (`CL_dolores_departtime`) and Etta (`CL_etta_seedolores`). Both are tagged
   `genuine` in the corroboration map.

2. **A lie by a self-interested, low-honesty witness, with a refuting clue.**
   Sid Brunner (`selfInterest` 85, `honesty` 22) lies that he left by 21:00
   (`CL_sid_departtime`). The pawn ticket `C_pawnticket`, stamped 21:48, cracks
   it. Cracking it unlocks his truthful, previously hidden sighting of Webb's
   car (`CL_sid_sawcar`).

3. **An honest mistake by a low memoryReliability witness, with a physical
   corrector.** Etta Maris (`memoryReliability` 18) places the crash near 23:00
   (`CL_etta_crashtime`). The ME window `F_tod` and the stopped watch
   `C_stopped_watch` correct her to about 22:00.

4. **A time-based contradiction: an alibi that collides with the ME window.**
   Webb claims he was at the Tiki Room from 21:30 to midnight
   (`CL_webb_alibi`). The ME fixes death at 21:45 to 22:30 (`F_tod`), and his
   prints on the murder weapon (`C_bottle_prints`) put him at the scene inside
   that window. The alibi covers the exact span the physical evidence
   contradicts, so it cannot hold.

5. **A tiered question path per witness reaching a tier-3 confront gated on the
   refuting clue.** See the questions table below.

## Intended chain of evidence the player assembles

1. Establish that this is a homicide, not an accident, suicide, or natural
   death: ME defensive wounds `F_defensive` and cause `F_cause` (gated by
   `Q_me_2`, which probes "could this be an accident or self-inflicted?", so the
   no-perp path is genuinely asked and then ruled out).
2. Pin the time of death: `F_tod` (21:45 to 22:30) from `Q_me_1`, reinforced by
   the stopped watch `C_stopped_watch`.
3. Correct Etta's 23:00 mistake against `F_tod` so the timeline is clean
   (`Q_etta_2`, then confront `Q_etta_3`).
4. Find `C_pawnticket`, break Sid's lie with `Q_sid_3`, and gain his truthful
   21:55 sighting of Webb's car (`CL_sid_sawcar`, fact `F_webb_presence`).
5. Find `C_bottle_prints` on the weapon and `C_ledger_debt` in the safe.
6. Confront Webb (`Q_webb_3`) with the prints plus the ME window. His Tiki Room
   alibi collapses. The debt (`F_webb_debt` via `C_ledger_debt`, surfaced at
   `Q_webb_2`) supplies motive.
7. Accuse Marcus Webb.

## Tiered question path per witness

| Witness | Tier 1 | Tier 2 (clue-gated) | Tier 3 (confront, gated on the refuting clue) |
| --- | --- | --- | --- |
| Dolores | `Q_dol_1` | `Q_dol_2` (needs `C_backdoor_latch`) | `Q_dol_3` deploys `CL_dolores_backdoor` vs `C_backdoor_latch` |
| Sid | `Q_sid_1` | `Q_sid_2` (needs `C_pawnticket`) | `Q_sid_3` deploys `CL_sid_departtime` vs `C_pawnticket`, reveals `CL_sid_sawcar` |
| Etta | `Q_etta_1` | `Q_etta_2` (needs `C_stopped_watch`) | `Q_etta_3` deploys `CL_etta_crashtime` vs `C_stopped_watch` and `F_tod` |
| Webb | `Q_webb_1` | `Q_webb_2` (needs `C_ledger_debt`) | `Q_webb_3` deploys `CL_webb_alibi` vs `C_bottle_prints` and `F_tod` |

Each tier-3 confront has `costsBudget: false`, modeling the rule that deploying
an already-found contradiction is cheap or free, while the probing tier-1 and
tier-2 questions cost full budget. The runtime enforces the actual arithmetic;
the bible only carries the flags.

## Exact requiredEvidenceChain the DA scorer accepts

From `scoringSpec.requiredEvidenceChain`, in intended logical order:

1. `F_defensive` (fact): defensive wounds rule out accident and suicide.
2. `F_cause` (fact): blunt force trauma, a homicide.
3. `F_tod` (fact): time of death 21:45 to 22:30.
4. `C_bottle_prints` (clue): Webb's prints on the murder weapon.
5. `F_webb_location_tod` (fact): Webb at the scene during the window.
6. `C_pawnticket` (clue): breaks Sid's lie.
7. `F_webb_presence` (fact): Webb's car at 21:55, from Sid's corrected account.
8. `C_ledger_debt` (clue): the debt ledger.
9. `F_webb_debt` (fact): motive.

**Minimum sufficient core:** `F_defensive` plus `F_cause` (it is a homicide),
then `F_tod` plus `C_bottle_prints` plus `F_webb_location_tod` (Webb at the
scene during the death window, by physical evidence). That core alone convicts.
The Sid sighting (`C_pawnticket`, `F_webb_presence`) and the motive
(`C_ledger_debt`, `F_webb_debt`) strengthen the case and are expected of a
thorough player, but are not strictly required by the sufficiency rule.

**Unexplained contradictions that count against an accusation:**

- Webb's alibi `CL_webb_alibi` must be broken by `C_bottle_prints` with `F_tod`,
  or his Tiki Room story stands and the accusation fails.
- Sid's lie `CL_sid_departtime` left unbroken hides the 21:55 sighting.
- Etta's mistake `CL_etta_crashtime` left uncorrected spuriously argues for a
  death near 23:00, outside the window.

**Strength hierarchy (strongest first):** physical and ME evidence
(`C_bottle_prints`, `F_tod`) outrank corroborated testimony
(`F_dolores_departure`), which outranks any single uncorroborated statement. A
lone statement cannot, by itself, carry the accusation.

This case is solvable: every lie has a discoverable refutation, every mistake
has a physical corrector, and the minimum sufficient chain is reachable through
the question tiers and scene exploration as authored.
