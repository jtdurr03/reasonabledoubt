/**
 * The solvability playthrough as a unit test, so the regression guard runs with
 * `npm test` as well as `npm run autosolve`.
 */

import { describe, it, expect } from "vitest";
import { runAutosolve } from "./autosolve.js";

describe("solvability of the reference case", () => {
  it("wins by following the intended solution path", () => {
    const { verdict, steps } = runAutosolve();
    expect(verdict.outcome).toBe("win");
    expect(verdict.targetCorrect).toBe(true);
    expect(verdict.chainSufficient).toBe(true);
    expect(verdict.strengthOk).toBe(true);
    // The full playthrough touches search, the ME, all witnesses, and the accusation.
    expect(steps.length).toBeGreaterThan(10);
  });
});
