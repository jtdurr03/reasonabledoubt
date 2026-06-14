/**
 * Engine B tests. All run with a mocked client: no network, no token spend.
 * They cover the seven cases the task requires, plus that the persona never
 * reveals guilt.
 */

import { describe, it, expect } from "vitest";
import { loadCase } from "../runner/loadCase.js";
import type { CaseBible, Character, Claim, Question } from "../types/caseBible.js";
import type { ModelClient, ModelRequest } from "./client.js";
import {
  ModelVerifier,
  parseVerifierResponse,
  performGuarded,
  type Verifier,
} from "./guard.js";
import { translateTraits, behavioralFlags, professionalRegister } from "./traits.js";
import { assemblePrompt, revealedStateFor } from "./prompt.js";
import { performForClaim, personaFor, personaRole, type PerformerDeps } from "./index.js";
import { bakeBible } from "./bake.js";
import { emptyArtifact } from "./cache.js";
import { dialogueProvider } from "./cache.js";
import { initialState } from "../runner/state.js";
import { doAsk } from "../runner/actions.js";

const bible: CaseBible = loadCase();
const claim = (id: string): Claim => bible.claims.find((c) => c.claimId === id)!;
const question = (id: string): Question => bible.questions.find((q) => q.questionId === id)!;

const sid = bible.characters.find((c) => c.characterId === "CH_sid")! as Character;
const dolores = bible.characters.find((c) => c.characterId === "CH_dolores")! as Character;
const me = bible.characters.find((c) => c.characterId === "CH_me")! as Character;

/* ------------------------------------------------------------------ */
/* Test doubles                                                        */
/* ------------------------------------------------------------------ */

class FakeClient implements ModelClient {
  calls = 0;
  constructor(private readonly fn: (req: ModelRequest) => string) {}
  async complete(req: ModelRequest): Promise<string> {
    this.calls++;
    return this.fn(req);
  }
}

class PassVerifier implements Verifier {
  calls = 0;
  async verify() {
    this.calls++;
    return { pass: true as const };
  }
}

class FailVerifier implements Verifier {
  async verify() {
    return { pass: false as const, offendingSpan: "a fact not in the slice" };
  }
}

/* ------------------------------------------------------------------ */
/* 1. Trait translator                                                 */
/* ------------------------------------------------------------------ */

describe("trait translator", () => {
  it("translates a hostile, self-interested vector to the expected flags", () => {
    const flags = translateTraits(sid.traits!); // authorityDeference 8, honesty 22, selfInterest 85
    expect(flags.some((f) => f.includes("Resents police authority"))).toBe(true);
    expect(flags.some((f) => f.includes("Guards their own stake"))).toBe(true);
  });

  it("translates a deferential vector to the deference flag", () => {
    const flags = translateTraits(dolores.traits!); // authorityDeference 88
    expect(flags.some((f) => f.includes("Defers to a detective's authority"))).toBe(true);
  });

  it("never emits a raw trait number to the model", () => {
    for (const character of bible.characters) {
      if (!character.traits) continue;
      for (const flag of translateTraits(character.traits)) {
        expect(flag).not.toMatch(/\d/);
      }
    }
  });
});

/* ------------------------------------------------------------------ */
/* 2. Leak guard catches an out-of-slice assertion, passes a clean line */
/* ------------------------------------------------------------------ */

describe("leak verifier", () => {
  it("catches an out-of-slice assertion and reports the offending span", async () => {
    // The verifier is a model call; the fake model returns the verdict a real
    // model would for a line that adds a fact not in the allowed set.
    const client = new FakeClient(() => '{"pass": false, "offendingSpan": "a red Cadillac"}');
    const verifier = new ModelVerifier(client, "fake-model");
    const result = await verifier.verify(
      "I left at nine, and I saw a red Cadillac out front.",
      ["I left at nine."],
    );
    expect(result.pass).toBe(false);
    expect(result.offendingSpan).toBe("a red Cadillac");
  });

  it("passes a clean line", async () => {
    const client = new FakeClient(() => '{"pass": true, "offendingSpan": ""}');
    const verifier = new ModelVerifier(client, "fake-model");
    const result = await verifier.verify("I left at nine, Detective.", ["I left at nine."]);
    expect(result.pass).toBe(true);
  });

  it("treats an unparseable verdict as a failure (safe default)", () => {
    expect(parseVerifierResponse("the model rambled with no json").pass).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 3. Fallback to the spine when the line keeps leaking                */
/* ------------------------------------------------------------------ */

describe("guard fallback", () => {
  it("falls back to the plain factual spine after exhausting retries, and the runner uses it", async () => {
    const spine = "I left at a quarter past nine.";
    const performer = new FakeClient(() => "I left at nine and there was a man in a fedora I had never seen.");
    const result = await performGuarded(
      performer,
      new FailVerifier(),
      { system: "s", user: "u", model: "m", factualSpine: spine, allowedContents: [spine] },
      2,
    );
    expect(result.usedFallback).toBe(true);
    expect(result.line).toBe(spine);
    expect(result.attempts).toBe(3); // initial + 2 retries

    // A dialogue artifact carrying that fallback line is used verbatim by the runner.
    const artifact = emptyArtifact(bible.caseId, "m", "v");
    artifact.lines[`${bible.caseId}|CH_dolores|Q_dol_1|CL_dolores_departtime|base`] = {
      characterId: "CH_dolores",
      questionId: "Q_dol_1",
      claimId: "CL_dolores_departtime",
      stateKey: "base",
      line: result.line,
      usedFallback: true,
    };
    const state = initialState(bible);
    const out = doAsk(bible, state, "CH_dolores", "Q_dol_1", dialogueProvider(artifact));
    expect(out.messages.join("\n")).toContain(spine);
  });
});

/* ------------------------------------------------------------------ */
/* 4. A lie is performed as the lie, never corrected toward the truth  */
/* ------------------------------------------------------------------ */

describe("lie performance", () => {
  it("delivers an authored lie as the lie", async () => {
    const lie = claim("CL_sid_departtime"); // veracity: lie
    const q = question("Q_sid_1");
    // The performer gives the spine some period flavor but adds no new fact.
    const performer = new FakeClient((req) => {
      const spine = lie.factualSpine!;
      // The spine is embedded in the user prompt; echo it as the delivered line.
      expect(req.user).toContain(spine);
      return `Look, ${spine}`;
    });
    const deps: PerformerDeps = { performer, verifier: new PassVerifier(), performerModel: "m" };
    const result = await performForClaim(deps, bible, sid, q, lie);

    // Conveys the false content...
    expect(result.line.toLowerCase()).toContain("gone by nine");
    // ...and does not correct toward the truth (pawn ticket at 21:48).
    expect(result.line).not.toContain("21:48");
    expect(result.line.toLowerCase()).not.toContain("pawn");
    expect(result.usedFallback).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* 5. Delivery differs, facts do not (prompt-assembly level)           */
/* ------------------------------------------------------------------ */

describe("delivery differs while facts stay identical", () => {
  it("produces different prompts for a deferential vs a hostile witness, same spine", () => {
    const spine = "I saw the car at five to ten.";
    const question = "What did you see?";
    const deferential = assemblePrompt({
      persona: personaFor(dolores),
      flags: behavioralFlags(dolores),
      factualSpine: spine,
      questionText: question,
      revealedState: [],
    });
    const hostile = assemblePrompt({
      persona: personaFor(sid),
      flags: behavioralFlags(sid),
      factualSpine: spine,
      questionText: question,
      revealedState: [],
    });
    // Different delivery instructions reached the prompt...
    expect(deferential.system).not.toEqual(hostile.system);
    expect(deferential.system).toContain("Defers to a detective's authority");
    expect(hostile.system).toContain("Resents police authority");
    // ...but the underlying allowed content is identical.
    expect(deferential.user).toContain(spine);
    expect(hostile.user).toContain(spine);
  });
});

/* ------------------------------------------------------------------ */
/* 6. Cache prevents duplicate calls                                   */
/* ------------------------------------------------------------------ */

describe("cache", () => {
  it("a second bake of the same tuples makes no additional client calls", async () => {
    const performer = new FakeClient((req) => `delivered: ${req.user.slice(0, 8)}`);
    const verifier = new PassVerifier();
    const deps: PerformerDeps = { performer, verifier, performerModel: "m" };
    const artifact = emptyArtifact(bible.caseId, "m", "v");

    const first = await bakeBible(deps, bible, artifact);
    expect(first.performed).toBe(first.total);
    const callsAfterFirst = performer.calls;
    expect(callsAfterFirst).toBe(first.total); // one performer call per line

    const second = await bakeBible(deps, bible, artifact);
    expect(second.performed).toBe(0);
    expect(second.cached).toBe(second.total);
    expect(performer.calls).toBe(callsAfterFirst); // no new calls
  });
});

/* ------------------------------------------------------------------ */
/* 7. ME performs through the fixed professional register              */
/* ------------------------------------------------------------------ */

describe("Medical Examiner register", () => {
  it("uses the professional register, not trait translation", () => {
    const flags = behavioralFlags(me);
    expect(flags).toEqual(professionalRegister("medicalExaminer"));
    expect(flags.some((f) => f.includes("clinical professional"))).toBe(true);
    expect(flags.some((f) => f.includes("Defers to a detective"))).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/* Persona never reveals guilt                                         */
/* ------------------------------------------------------------------ */

describe("persona hides guilt from the model", () => {
  it("maps the perp to a neutral public label", () => {
    expect(personaRole("perp")).toBe("person of interest");
    expect(personaRole("perp")).not.toContain("perp");
  });

  it("a confront carries a minimal revealed state, a baseline carries none", () => {
    const confront = question("Q_webb_3");
    const baseline = question("Q_webb_1");
    expect(revealedStateFor(confront).key).toBe("confront");
    expect(revealedStateFor(baseline).key).toBe("base");
    expect(revealedStateFor(baseline).lines).toHaveLength(0);
  });
});
