/**
 * Engine B: the dialogue performer. Ties together the trait translator, prompt
 * assembly, and the leak guard into a single perform function.
 *
 * Engine B is a voice. It is handed the exact factual content to deliver (a
 * claim's factualSpine) and performs it in character. It does not reason about
 * the case, choose what is true, or decide whether to lie. Veracity, gating,
 * budget, and scoring live in the bible and in the runner's rules. Engine B
 * touches none of them, and it is never told who is guilty.
 */

import type { CaseBible, Character, CharacterRole, Claim, Question } from "../types/caseBible.js";
import type { ModelClient } from "./client.js";
import type { GuardedLine, Verifier } from "./guard.js";
import { performGuarded } from "./guard.js";
import { assemblePrompt, revealedStateFor, type Persona } from "./prompt.js";
import { behavioralFlags } from "./traits.js";
import { PERFORMER_MODEL } from "./config.js";

export interface PerformerDeps {
  performer: ModelClient;
  verifier: Verifier;
  performerModel?: string;
}

/**
 * Public-facing role label. Crucially, this never reveals guilt: a perp, a
 * suspect, a colluder, and a framed agent are all just "a person of interest"
 * to the dialogue model. Engine B must not learn who did it.
 */
export function personaRole(role: CharacterRole): string {
  switch (role) {
    case "witness":
      return "witness";
    case "victim":
      return "the victim";
    case "medicalExaminer":
      return "county medical examiner";
    case "districtAttorney":
      return "district attorney";
    case "suspect":
    case "perp":
    case "framedAgent":
    case "colluder":
      return "person of interest";
  }
}

export function personaFor(character: Character): Persona {
  return { name: character.name, role: personaRole(character.role) };
}

/** The factual content a claim delivers; falls back to a plain rendering if no spine was authored. */
export function spineFor(claim: Claim): string {
  if (claim.factualSpine && claim.factualSpine.trim().length > 0) return claim.factualSpine;
  return JSON.stringify(claim.statedValue);
}

/** Perform a single line for a claim, answered to a specific question, guarded against leaks. */
export async function performForClaim(
  deps: PerformerDeps,
  bible: CaseBible,
  character: Character,
  question: Question,
  claim: Claim,
): Promise<GuardedLine> {
  const flags = behavioralFlags(character);
  const persona = personaFor(character);
  const spine = spineFor(claim);
  const revealed = revealedStateFor(question);

  const { system, user } = assemblePrompt({
    persona,
    flags,
    factualSpine: spine,
    questionText: question.text,
    revealedState: revealed.lines,
  });

  const model = deps.performerModel ?? PERFORMER_MODEL;
  return performGuarded(deps.performer, deps.verifier, {
    system,
    user,
    model,
    factualSpine: spine,
    allowedContents: [spine],
  });
}

export { revealedStateFor } from "./prompt.js";
export { behavioralFlags, translateTraits, professionalRegister } from "./traits.js";
export { assemblePrompt } from "./prompt.js";
