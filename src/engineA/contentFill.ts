/**
 * Content fill. The model writes names, the factualSpine prose for each claim,
 * the case title, location names, and clue discovery methods into slots the
 * deterministic skeleton already defined. It reuses Engine B's mockable client.
 *
 * The model never decides who did it, never decides what is true, never places a
 * clue, never sets a precondition, and never alters structure. It is handed the
 * content to phrase, exactly like Engine B one layer down. Every prompt forbids
 * changing any structural value, and the output is sanitized to honor the
 * project no-dash rule even if the model slips.
 */

import type { CaseBible, Fact, TypedValue } from "../types/caseBible.js";
import type { ModelClient } from "../engineB/client.js";
import { personaRole } from "../engineB/index.js";
import { FILL_MODEL } from "./config.js";

const ERA = "1960s Los Angeles";

/** Replace em/en dashes so generated prose always honors the project rule. */
function sanitize(text: string): string {
  return text.replace(/\s*[–—]\s*/g, ", ").replace(/\s+/g, " ").trim();
}

async function one(client: ModelClient, system: string, user: string, maxTokens = 200): Promise<string> {
  const raw = await client.complete({ model: FILL_MODEL, system, user, maxTokens });
  return sanitize(raw);
}

function factById(bible: CaseBible, id: string): Fact | undefined {
  return bible.facts.find((f) => f.factId === id);
}

/** Render a claim's stated content as plain text for the model to phrase. */
function renderStated(type: string, value: TypedValue): string {
  const v = value as Record<string, unknown>;
  switch (type) {
    case "time":
      return v.kind === "window" ? `the window from ${v.start} to ${v.end}` : `the time ${v.at}`;
    case "location":
      return `a place in ${v.district}${v.room ? `, the ${v.room}` : ""}`;
    case "count":
      return `${v.count} ${v.of}`;
    case "object": {
      const parts = [String(v.subtype ?? v.category)];
      const attrs = v.attributes as Record<string, unknown> | undefined;
      if (attrs) {
        for (const val of Object.values(attrs)) {
          if (typeof val === "string") parts.push(val);
        }
      }
      return parts.join(", ");
    }
    case "event":
      return `${v.eventType}: ${v.description ?? ""}`;
    case "relationship":
      return v.relationType === "none" ? "no such relationship" : `a ${v.relationType} relationship`;
    default:
      return JSON.stringify(value);
  }
}

const NO_NEW_FACTS = "Introduce no new facts, names, times, places, objects, or numbers beyond what is given. Use no em-dashes or en-dashes. Output only the requested text, nothing else.";

/**
 * Fill prose into the bible in place. The caller passes a clone; the structural
 * skeleton is never mutated. Returns the same bible for convenience.
 */
export async function fillContent(client: ModelClient, bible: CaseBible): Promise<CaseBible> {
  // Title.
  bible.title = await one(
    client,
    `You name a ${ERA} detective case file. Give a short, evocative noir title (two to five words). ${NO_NEW_FACTS}`,
    `Crime: ${bible.crimeTemplateId}.`,
    40,
  );

  // Character names. Feed already-assigned names back so the model does not
  // converge on the same common period names within a case.
  const usedNames: string[] = [];
  for (const c of bible.characters) {
    const role = personaRole(c.role);
    const avoid = usedNames.length > 0 ? ` Do not reuse any of these already-used names: ${usedNames.join(", ")}.` : "";
    c.name = await one(
      client,
      `You name a character in a ${ERA} detective story. Give a single plausible full name for ${role}, period-appropriate.${avoid} ${NO_NEW_FACTS}`,
      `Role: ${role}.`,
      24,
    );
    usedNames.push(c.name);
  }

  // Location names.
  for (const loc of bible.locations) {
    loc.name = await one(
      client,
      `You name a place in ${ERA}. Give a short, period-appropriate name for a ${loc.kind} in ${loc.place.district}. ${NO_NEW_FACTS}`,
      `Kind: ${loc.kind}. District: ${loc.place.district}.`,
      24,
    );
  }

  // Clue discovery methods.
  for (const clue of bible.clues) {
    const loc = bible.locations.find((l) => l.locationId === clue.locationId);
    clue.discoveryMethod = await one(
      client,
      `You write how a detective finds a piece of physical evidence while searching a scene. Give a short action phrase starting with a verb (for example, "search the desk drawer"). ${NO_NEW_FACTS}`,
      `Evidence kind: ${clue.type}. Location: ${loc?.kind ?? "scene"}.`,
      30,
    );
  }

  // Claim factual spines. The model is given the content to convey and the
  // question being answered. It never sees veracity and cannot change the facts.
  const claimQuestion = new Map<string, string>();
  for (const q of bible.questions) {
    for (const claimId of q.effects?.revealsClaimIds ?? []) claimQuestion.set(claimId, q.text);
  }
  for (const claim of bible.claims) {
    const fact = factById(bible, claim.factId);
    const stated = renderStated(fact?.type ?? "event", claim.statedValue);
    const character = bible.characters.find((c) => c.characterId === claim.characterId);
    const role = character ? personaRole(character.role) : "a person";
    const questionText = claimQuestion.get(claim.claimId) ?? "Tell me what you know.";
    claim.factualSpine = await one(
      client,
      `You write one plain spoken sentence (first person) in which ${role} in ${ERA} states the given content as their answer. Convey exactly that content and nothing beyond it. Do not judge whether it is true. ${NO_NEW_FACTS}`,
      `Question asked: ${questionText}\nContent to state: ${stated}`,
      80,
    );
  }

  return bible;
}
