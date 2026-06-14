/**
 * Prompt assembly. Builds the model prompt from a persona, the behavioral flags
 * from the translator, the exact factual content to deliver (the claim's
 * factualSpine), the question being answered, and a minimal revealed-state.
 *
 * The hard constraints live in the system prompt: deliver only the provided
 * content, introduce no new facts, stay in period and in character, keep it to
 * a believable spoken length, and (critically) if the content is evasive or
 * false, deliver it as written without correcting it. Engine B is a voice, not
 * a fact source: the model is given what to say, never asked to decide it.
 */

import type { Question } from "../types/caseBible.js";
import { ERA } from "./config.js";

export interface Persona {
  name: string;
  role: string;
}

export interface PromptContext {
  persona: Persona;
  /** Behavioral flags from the trait translator (or professional register). */
  flags: string[];
  /** The exact factual content to deliver. */
  factualSpine: string;
  /** The detective's question being answered. */
  questionText: string;
  /** Minimal revealed-state lines, derived from the question itself. */
  revealedState: string[];
}

export interface AssembledPrompt {
  system: string;
  user: string;
}

/**
 * The minimal revealed-state for a question, derived from the question alone so
 * the bake space stays finite. A tier-3 confront carries that the detective has
 * produced evidence; other tiers carry nothing. We do not key on conversation
 * history.
 */
export function revealedStateFor(question: Question): { key: string; lines: string[] } {
  if (question.tier === 3) {
    return {
      key: "confront",
      lines: ["The detective has just confronted you with evidence they are holding. You are caught out."],
    };
  }
  return { key: "base", lines: [] };
}

export function assemblePrompt(ctx: PromptContext): AssembledPrompt {
  const flagLines = ctx.flags.map((f) => `- ${f}`).join("\n");

  const system = [
    `You are performing a single spoken line for ${ctx.persona.name}, a ${ctx.persona.role} in ${ERA}.`,
    `Speak in period and in character, the way this person would actually talk.`,
    ``,
    `How ${ctx.persona.name} carries themselves (delivery only):`,
    flagLines,
    ``,
    `Hard rules, follow all of them:`,
    `1. Deliver ONLY the factual content you are given. Convey exactly that, nothing more.`,
    `2. Introduce no new facts, names, times, places, objects, or numbers beyond what the content states.`,
    `3. If the content is evasive, incomplete, or false, deliver it as written. Do not correct it, do not hedge it toward the truth, and do not break character to signal that it is false.`,
    `4. Stay in 1960s Los Angeles register. No anachronisms.`,
    `5. Keep it to a believable spoken length: one to three sentences.`,
    `6. Output only the spoken line itself. No narration, no quotation marks, no stage directions, no preamble.`,
  ].join("\n");

  const userLines = [
    `Detective's question: ${ctx.questionText}`,
    ``,
    `The content you must convey (this is your answer, deliver exactly this and nothing beyond it):`,
    ctx.factualSpine,
  ];
  if (ctx.revealedState.length > 0) {
    userLines.push("", "Situation:", ...ctx.revealedState.map((s) => `- ${s}`));
  }
  userLines.push("", `Now perform ${ctx.persona.name}'s answer.`);

  return { system, user: userLines.join("\n") };
}
