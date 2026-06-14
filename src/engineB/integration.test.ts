/**
 * Optional live integration test. Skipped unless ANTHROPIC_API_KEY is set, so
 * CI and the default `npm test` run fully offline. When a key is present it
 * bakes one real line and confirms the real verifier passes it.
 */

import { describe, it, expect } from "vitest";
import { loadCase } from "../runner/loadCase.js";
import { createAnthropicClient } from "./client.js";
import { ModelVerifier } from "./guard.js";
import { performForClaim, type PerformerDeps } from "./index.js";
import { VERIFIER_MODEL } from "./config.js";

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!hasKey)("Engine B live integration", () => {
  it(
    "bakes one real performed line that passes the real verifier",
    async () => {
      const bible = loadCase();
      const sid = bible.characters.find((c) => c.characterId === "CH_sid")!;
      const claim = bible.claims.find((c) => c.claimId === "CL_sid_departtime")!;
      const question = bible.questions.find((q) => q.questionId === "Q_sid_1")!;

      const deps: PerformerDeps = {
        performer: createAnthropicClient(),
        verifier: new ModelVerifier(createAnthropicClient(), VERIFIER_MODEL),
      };

      const result = await performForClaim(deps, bible, sid, question, claim);
      expect(result.line.length).toBeGreaterThan(0);
      // The line should pass the guard (not fall back), and must not leak the
      // refuting fact (the pawn ticket / 21:48) that Engine B was never given.
      expect(result.usedFallback).toBe(false);
      expect(result.line).not.toContain("21:48");
    },
    60_000,
  );
});
