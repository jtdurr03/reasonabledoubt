/**
 * Engine A tests. All offline with the model client mocked to placeholder prose.
 * They cover determinism, the invariant checker, solvability under rules.ts,
 * reject-and-retry, schema validity at both stages, plant parity with the hand
 * fixture, and the full pipeline end to end with no network.
 */

import { describe, it, expect } from "vitest";
import { homicidePerpTemplate, type CrimeTemplate } from "./template.js";
import { generateSkeleton } from "./skeleton.js";
import { checkInvariants } from "./invariants.js";
import { solveWithPlan } from "./solve.js";
import { generateOne, generateCase, GenerationError, type GeneratorDeps } from "./pipeline.js";
import { validateBible } from "../validate.js";
import type { ModelClient, ModelRequest } from "../engineB/client.js";
import type { Verifier } from "../engineB/guard.js";

class FakeClient implements ModelClient {
  calls = 0;
  async complete(req: ModelRequest): Promise<string> {
    this.calls++;
    // Deterministic, dash-free placeholder prose. Logic never depends on this.
    return `placeholder prose for ${req.user.slice(0, 16)}`.replace(/[–—]/g, ",");
  }
}

class PassVerifier implements Verifier {
  async verify() {
    return { pass: true as const };
  }
}

function mockDeps(): GeneratorDeps {
  return { fillClient: new FakeClient(), performer: new FakeClient(), verifier: new PassVerifier() };
}

describe("1. determinism", () => {
  it("a fixed seed reproduces the identical structural skeleton", () => {
    const a = JSON.stringify(generateSkeleton(homicidePerpTemplate, 42));
    const b = JSON.stringify(generateSkeleton(homicidePerpTemplate, 42));
    expect(a).toEqual(b);
  });
  it("different seeds produce different skeletons", () => {
    const a = JSON.stringify(generateSkeleton(homicidePerpTemplate, 1).bible);
    const b = JSON.stringify(generateSkeleton(homicidePerpTemplate, 2).bible);
    expect(a).not.toEqual(b);
  });
});

describe("2. invariants", () => {
  it("a generated skeleton passes the invariant checker", () => {
    const { bible, solution } = generateSkeleton(homicidePerpTemplate, 3);
    expect(checkInvariants(bible, solution)).toEqual([]);
  });
});

describe("3. solvability (structural, placeholder prose)", () => {
  it("a generated skeleton is winnable under rules.ts before any prose exists", () => {
    const { bible, solution } = generateSkeleton(homicidePerpTemplate, 5);
    const result = solveWithPlan(bible, solution);
    expect(result.win).toBe(true);
  });
});

describe("4. reject and retry", () => {
  const broken: CrimeTemplate = { ...homicidePerpTemplate, __orphanRefuterForTest: true };

  it("the invariant checker names the orphaned refuter", () => {
    const { bible, solution } = generateSkeleton(broken, 1);
    const violations = checkInvariants(bible, solution);
    expect(violations.some((v) => /refuter/i.test(v))).toBe(true);
  });

  it("the guard rejects, retries, and throws naming the template and seeds on the cap", async () => {
    let caught: unknown;
    try {
      await generateCase(broken, mockDeps(), { startSeed: 1, maxAttempts: 3, onReject: () => {} });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(GenerationError);
    const error = caught as GenerationError;
    expect(error.templateId).toBe("homicide-perp");
    expect(error.seedsTried).toEqual([1, 2, 3]);
    expect(error.message).toContain("homicide-perp");
  });
});

describe("5. schema validity", () => {
  it("the structural skeleton validates", () => {
    expect(validateBible(generateSkeleton(homicidePerpTemplate, 9).bible)).toEqual([]);
  });
  it("the final enriched bible validates", async () => {
    const out = await generateOne(homicidePerpTemplate, 9, mockDeps());
    expect(out.ok).toBe(true);
    if (out.ok) expect(validateBible(out.case.bible)).toEqual([]);
  });
});

describe("6. plant parity with the hand fixture", () => {
  it("contains a genuine corroboration, an anchored lie, an anchored mistake, and a time contradiction", async () => {
    const out = await generateOne(homicidePerpTemplate, 11, mockDeps());
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    const bible = out.case.bible;

    // Genuine corroboration: two independent claims agree, classified genuine.
    const genuine = bible.derived!.corroboration.find(
      (c) => c.corroborated && c.classification === "genuine" && c.members.filter((m) => m.kind === "claim").length >= 2,
    );
    expect(genuine).toBeDefined();

    // Anchored lie and anchored mistake.
    expect(bible.claims.some((c) => c.veracity === "lie" && (c.refutedBy?.length ?? 0) > 0)).toBe(true);
    expect(bible.claims.some((c) => c.veracity === "mistaken" && (c.correctedBy?.length ?? 0) > 0)).toBe(true);

    // A time-based contradiction in the baked matrix.
    const timeContradiction = bible.derived!.contradictionMatrix.find((e) => e.type === "time" && e.band === "major");
    expect(timeContradiction).toBeDefined();
  });
});

describe("7. full pipeline offline", () => {
  it("produces a complete, schema-valid, autosolvable bible with no network", async () => {
    const generated = await generateCase(homicidePerpTemplate, mockDeps(), { startSeed: 1, maxAttempts: 4 });
    expect(generated.attempts).toBe(1); // a valid template solves on the first seed
    expect(generated.bible.caseId).toBe("homicide-perp-00001");
    expect(validateBible(generated.bible)).toEqual([]);
    expect(solveWithPlan(generated.bible, generated.solution).win).toBe(true);
    // Dialogue was baked for every reachable line.
    expect(Object.keys(generated.dialogue.lines).length).toBeGreaterThan(0);
  });
});
