/**
 * Interactive terminal interface over the runner rules. This is the playable
 * prototype: travel, search, interview, watch contradictions auto-flag, build a
 * timeline and clue board, and conclude at the Police Station for a verdict.
 *
 * This file is the only place with terminal I/O. All decisions come from
 * rules.ts. Witness answers are the authored factualSpine printed as plain
 * text. There is no dialogue model here (that is step four).
 */

import { createInterface } from "node:readline";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { EvidenceRef, Id } from "../types/caseBible.js";
import { loadCase, referenceFixturePath, repoRoot } from "./loadCase.js";
import { initialState, log, type PlayerState } from "./state.js";
import {
  doAsk,
  doLink,
  doPlaceTimeline,
  doSearch,
  doTravel,
} from "./actions.js";
import {
  availableQuestions,
  budgetInfo,
  characterById,
  characterLocation,
  charactersAt,
  claimById,
  interviewablesAt,
  questionCost,
  scoreVerdict,
  tierLabel,
  visibleContradictions,
  type Accusation,
} from "./rules.js";

const bible = loadCase(process.argv[2] ? resolve(process.cwd(), process.argv[2]) : referenceFixturePath);
const state = initialState(bible);

const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: false });

// Buffer line events into a queue so bursts of piped input are not dropped (a
// known hazard of calling readline.question in a loop). ask() pulls from the
// queue, awaiting when empty, and returns null at end of input.
const lineQueue: string[] = [];
let pendingResolve: ((line: string | null) => void) | null = null;
let inputClosed = false;
rl.on("line", (line) => {
  if (pendingResolve) {
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve(line);
  } else {
    lineQueue.push(line);
  }
});
rl.on("close", () => {
  inputClosed = true;
  if (pendingResolve) {
    const resolve = pendingResolve;
    pendingResolve = null;
    resolve(null);
  }
});

function out(line = ""): void {
  console.log(line);
  log(state, line);
}

function ask(prompt: string): Promise<string | null> {
  process.stdout.write(prompt);
  if (lineQueue.length > 0) return Promise.resolve(lineQueue.shift()!.trim());
  if (inputClosed) return Promise.resolve(null);
  return new Promise((resolve) => {
    pendingResolve = (line) => resolve(line === null ? null : line.trim());
  });
}

function locName(id: Id): string {
  return bible.locations.find((l) => l.locationId === id)?.name ?? id;
}

function showHelp(): void {
  out("Commands:");
  out("  look                 describe where you are, who is here, what you can do");
  out("  map                  list the locations and travel targets");
  out("  go <id>              travel to a location (for example: go LOC_me)");
  out("  search               search the current scene for physical clues");
  out("  talk <characterId>   show a witness's available questions");
  out("  ask <questionId>     ask a question (must be where that witness is)");
  out("  flags                list contradictions you have surfaced");
  out("  timeline             show the timeline");
  out("  place <fact|claim> <id>   place a time card on the timeline");
  out("  board                show the clue board");
  out("  link <idA> <idB>     draw a link between two held nodes");
  out("  notebook             your clues, claims, and question budgets");
  out("  evidence             ids you can cite at conclusion");
  out("  accuse               conclude the case (only at the Police Station)");
  out("  help / quit");
}

function showLook(): void {
  const loc = bible.locations.find((l) => l.locationId === state.currentLocation)!;
  out(`\n== ${loc.name} (${loc.kind}) ==`);
  const present = charactersAt(bible, state.currentLocation);
  if (present.length > 0) {
    out("Here:");
    for (const c of present) {
      const tag = c.role === "victim" ? " (deceased)" : interviewablesAt(bible, state.currentLocation).includes(c) ? ` (talk ${c.characterId})` : "";
      out(`  ${c.name}${tag}`);
    }
  }
  const clueCount = bible.clues.filter((c) => c.locationId === state.currentLocation && !state.cluesHeld.includes(c.clueId)).length;
  out(clueCount > 0 ? "Something here may reward a search." : "You have searched this scene.");
}

function showMap(): void {
  out("\nLocations:");
  for (const l of bible.locations) {
    const here = l.locationId === state.currentLocation ? " (you are here)" : "";
    const who = charactersAt(bible, l.locationId).map((c) => c.name).join(", ");
    out(`  ${l.locationId}  ${l.name}${here}${who ? ` [${who}]` : ""}`);
  }
}

function showTalk(characterId: Id): void {
  const character = characterById(bible, characterId);
  if (!character) return out(`No such character: ${characterId}.`);
  if (characterLocation(character) !== state.currentLocation) {
    return out(`${character.name} is not here. They are at ${locName(characterLocation(character))}.`);
  }
  const b = budgetInfo(state, characterId);
  out(`\n${character.name}: questions ${b.spent}/${b.limit} used (${b.remaining} left).`);
  const avail = availableQuestions(bible, state, characterId);
  if (avail.length === 0) return out("No questions are available right now.");
  for (const q of avail) {
    const cost = questionCost(q);
    const costLabel = cost === 0 ? "free" : `costs ${cost}`;
    out(`  ${q.questionId}  [${tierLabel(q.tier)}, ${costLabel}]  ${q.text}`);
  }
}

function showFlags(): void {
  const flags = visibleContradictions(bible, state);
  if (flags.length === 0) return out("No contradictions surfaced yet.");
  out("\nContradictions surfaced:");
  for (const e of flags) {
    out(`  ${e.sourceA} vs ${e.sourceB} on ${e.factId} (${e.type}, ${e.band}, raw ${e.rawDistance}, severity ${round(e.severity)})`);
  }
}

function showTimeline(): void {
  if (state.timeline.length === 0) return out("The timeline is empty. Use: place <fact|claim> <id>.");
  out("\nTimeline:");
  for (const card of [...state.timeline].sort((a, b) => a.time.localeCompare(b.time))) {
    out(`  ${card.time}  ${card.id}: ${card.label}`);
  }
}

function showBoard(): void {
  if (state.clueBoard.length === 0) return out("The clue board is empty. Use: link <idA> <idB>.");
  out("\nClue board:");
  for (const link of state.clueBoard) {
    out(`  ${link.fromId} -- ${link.toId}  ${link.supported ? "(supported)" : "(inert)"}`);
  }
}

function showNotebook(): void {
  out("\nClues held: " + (state.cluesHeld.join(", ") || "none"));
  out("Claims heard: " + (state.claimsHeard.join(", ") || "none"));
  out("Budgets:");
  for (const c of bible.characters.filter((c) => c.role !== "victim")) {
    const b = budgetInfo(state, c.characterId);
    if (availableQuestions(bible, state, c.characterId).length > 0 || b.spent > 0) {
      out(`  ${c.name}: ${b.spent}/${b.limit}`);
    }
  }
}

function citableEvidence(): EvidenceRef[] {
  const refs: EvidenceRef[] = [];
  for (const id of state.cluesHeld) refs.push({ kind: "clue", id });
  // Facts the player knows through a heard claim.
  const knownFacts = new Set<Id>();
  for (const id of state.claimsHeard) {
    const f = claimById(bible, id)?.factId;
    if (f) knownFacts.add(f);
  }
  for (const id of state.cluesHeld) for (const f of bible.clues.find((c) => c.clueId === id)?.supportsFactIds ?? []) knownFacts.add(f);
  for (const id of knownFacts) refs.push({ kind: "fact", id });
  return refs;
}

function showEvidence(): void {
  out("\nEvidence you can cite:");
  for (const ref of citableEvidence()) out(`  ${ref.kind}: ${ref.id}`);
}

async function doAccuse(): Promise<void> {
  const station = bible.locations.find((l) => l.kind === "policeStation");
  if (station && state.currentLocation !== station.locationId) {
    return out(`You can only conclude the case at the Police Station (${station.name}). Travel there first.`);
  }
  out("\nName the guilty party by characterId, or type 'none' to declare no perp.");
  const who = await ask("Accuse> ");
  if (who === null) return;
  const accusedId: Id | null = who.toLowerCase() === "none" ? null : who;
  out("Cite your evidence chain: space-separated ids from your evidence list.");
  const chainLine = (await ask("Cite> ")) ?? "";
  const citedChain: EvidenceRef[] = chainLine
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => ({ kind: bible.clues.some((c) => c.clueId === id) ? "clue" : "fact", id }) as EvidenceRef);

  const accusation: Accusation = { accusedId, citedChain, resolvedContradictions: state.resolvedContradictions };
  const verdict = scoreVerdict(bible, accusation);

  out("\n===== VERDICT =====");
  out(verdict.outcome === "win" ? "WIN. The case holds." : "LOSE. The case does not hold.");
  for (const r of verdict.reasons) out(`  ${r}`);
  out(`Thoroughness: ${Math.round(verdict.thoroughness * 100)}% of the recommended chain cited.`);
  out("===================");
}

function writeTranscript(): void {
  const dir = resolve(repoRoot, "transcripts");
  mkdirSync(dir, { recursive: true });
  const file = resolve(dir, `session-${new Date().toISOString().replace(/[:.]/g, "-")}.log`);
  writeFileSync(file, state.transcript.join("\n") + "\n");
  console.log(`Transcript written to ${file}`);
}

async function loop(): Promise<void> {
  out(`\n${bible.title}`);
  out(`A headless detective case. Type 'help' for commands.`);
  showLook();

  for (;;) {
    const input = await ask("\n> ");
    if (input === null) {
      writeTranscript();
      rl.close();
      return;
    }
    log(state, `> ${input}`);
    const [cmd, ...args] = input.split(/\s+/).filter(Boolean);
    if (!cmd) continue;
    switch (cmd) {
      case "help": showHelp(); break;
      case "look": case "l": showLook(); break;
      case "map": showMap(); break;
      case "go": print(doTravel(bible, state, args[0]).messages); showLook(); break;
      case "search": case "s": print(doSearch(bible, state).messages); break;
      case "talk": showTalk(args[0]); break;
      case "ask": {
        const q = bible.questions.find((x) => x.questionId === args[0]);
        const witness = q && "characterId" in q.target ? q.target.characterId : undefined;
        if (witness && characterById(bible, witness) && characterLocation(characterById(bible, witness)!) !== state.currentLocation) {
          out(`That witness is not here.`);
          break;
        }
        print(doAsk(bible, state, witness ?? "", args[0]).messages);
        break;
      }
      case "flags": showFlags(); break;
      case "timeline": showTimeline(); break;
      case "place": print(doPlaceTimeline(bible, state, args[0] as "fact" | "claim", args[1]).messages); break;
      case "board": showBoard(); break;
      case "link": print(doLink(bible, state, args[0], args[1]).messages); break;
      case "notebook": case "n": showNotebook(); break;
      case "evidence": showEvidence(); break;
      case "accuse": await doAccuse(); break;
      case "quit": case "q": writeTranscript(); rl.close(); return;
      default: out(`Unknown command: ${cmd}. Type 'help'.`);
    }
  }
}

function print(messages: string[]): void {
  for (const m of messages) out(m);
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  loop().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
