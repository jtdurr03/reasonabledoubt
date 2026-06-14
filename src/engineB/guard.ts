/**
 * The leak guard. After the performer produces a line, a cheap verifier checks
 * that the line asserts no fact outside the allowed set (the claim content it
 * was told to deliver). On failure the performer regenerates with a tightened
 * instruction, up to a configured number of retries. If it still leaks, the
 * guard falls back to the plain factualSpine, so a leaking line is never
 * shipped. The fact-safety property holds by construction.
 *
 * Both the performer client and the verifier are interfaces, so the whole guard
 * is testable with no network.
 */

import type { ModelClient, ModelRequest } from "./client.js";
import { MAX_GUARD_RETRIES, PERFORMER_MAX_TOKENS, VERIFIER_MAX_TOKENS, VERIFIER_MODEL } from "./config.js";

export interface VerifierResult {
  pass: boolean;
  /** The span of the produced line that asserted an out-of-slice fact, on failure. */
  offendingSpan?: string;
}

/** Checks a produced line against the allowed facts. */
export interface Verifier {
  verify(line: string, allowedContents: string[]): Promise<VerifierResult>;
}

/**
 * Model-backed verifier: asks a cheap model whether the line introduces any
 * fact not present in or entailed by the allowed contents. Mockable: inject a
 * fake ModelClient to test the prompt and parsing offline.
 */
export class ModelVerifier implements Verifier {
  constructor(
    private readonly client: ModelClient,
    private readonly model: string = VERIFIER_MODEL,
  ) {}

  async verify(line: string, allowedContents: string[]): Promise<VerifierResult> {
    const system = [
      `You are a strict fact-checker for a detective game. You are given a list of ALLOWED facts and a candidate spoken line.`,
      `Your only job: decide whether the candidate line asserts any fact, name, time, place, object, or number that is NOT present in, or directly entailed by, the allowed facts.`,
      `Period flavor, tone, filler, and rephrasing are fine and are not violations. Only newly asserted facts are violations.`,
      `Respond with a single JSON object and nothing else: {"pass": boolean, "offendingSpan": string}. offendingSpan is the smallest quoted substring of the candidate that introduces the outside fact, or "" when pass is true.`,
    ].join("\n");

    const user = [
      `ALLOWED facts:`,
      ...allowedContents.map((c) => `- ${c}`),
      ``,
      `Candidate line:`,
      line,
    ].join("\n");

    const req: ModelRequest = { model: this.model, system, user, maxTokens: VERIFIER_MAX_TOKENS };
    const raw = await this.client.complete(req);
    return parseVerifierResponse(raw);
  }
}

/** Parse the verifier's JSON verdict, defaulting to a failure if it is unreadable. */
export function parseVerifierResponse(raw: string): VerifierResult {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return { pass: false, offendingSpan: "unparseable verifier response" };
  try {
    const obj = JSON.parse(match[0]) as { pass?: unknown; offendingSpan?: unknown };
    const pass = obj.pass === true;
    const offendingSpan = typeof obj.offendingSpan === "string" ? obj.offendingSpan : undefined;
    return pass ? { pass: true } : { pass: false, offendingSpan: offendingSpan || "unspecified" };
  } catch {
    return { pass: false, offendingSpan: "unparseable verifier response" };
  }
}

export interface PerformRequest {
  system: string;
  user: string;
  model: string;
  /** The exact content the line must stay within. */
  factualSpine: string;
  /** All facts the line is allowed to assert (usually just the spine). */
  allowedContents: string[];
}

export interface GuardedLine {
  line: string;
  usedFallback: boolean;
  attempts: number;
  /** The offending spans seen on failed attempts, for the bake report. */
  rejections: string[];
}

/**
 * Perform a line and guard it. Regenerates on a leak up to maxRetries, then
 * falls back to the plain factualSpine. The fallback guarantees no leaking line
 * ships.
 */
export async function performGuarded(
  performer: ModelClient,
  verifier: Verifier,
  req: PerformRequest,
  maxRetries: number = MAX_GUARD_RETRIES,
): Promise<GuardedLine> {
  const rejections: string[] = [];
  let attempts = 0;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    attempts++;
    const user =
      attempt === 0
        ? req.user
        : `${req.user}\n\nYour previous attempt added something not in the content. Stay strictly to the content given and add no other fact. Rejected for: ${rejections[rejections.length - 1]}`;

    const line = await performer.complete({
      model: req.model,
      system: req.system,
      user,
      maxTokens: PERFORMER_MAX_TOKENS,
    });

    const verdict = await verifier.verify(line, req.allowedContents);
    if (verdict.pass) {
      return { line, usedFallback: false, attempts, rejections };
    }
    rejections.push(verdict.offendingSpan ?? "unspecified");
  }

  // Every attempt leaked. Ship the plain spine, which by definition cannot leak.
  return { line: req.factualSpine, usedFallback: true, attempts, rejections };
}
