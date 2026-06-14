/**
 * Tests against the step-one reference fixture, whose planted facts are the
 * real targets for the comparator (task tests 1 to 4).
 *
 *   1. The planted time alibi that collides with the ME time-of-death window
 *      is detected and lands in the major band.
 *   2. The planted genuine corroboration (two independent witnesses agreeing)
 *      is detected as agreement and classified genuine.
 *   3. The planted honest mistake produces a contradiction against the
 *      correcting physical fact, at a severity consistent with how far off it is.
 *   4. Decoupling: the planted small lie has a small distance and band (not
 *      major), yet veracity-dependent output still treats it as a lie purely
 *      from its authored tag. Magnitude never changes veracity.
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import type { CaseBible, TimeValue } from "../types/caseBible.js";
import {
  compare,
  computeContradictionMatrix,
  computeCorroborationMap,
} from "./index.js";

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, "..", "..", "fixtures", "reference-homicide.case.json");
const bible = JSON.parse(readFileSync(fixturePath, "utf8")) as CaseBible;

const matrix = computeContradictionMatrix(bible);
const corroboration = computeCorroborationMap(bible);

const involves = (e: { sourceA: string; sourceB: string }, id: string) =>
  e.sourceA === id || e.sourceB === id;

describe("task test 1: time alibi collides with the ME time-of-death window", () => {
  it("flags a major time contradiction on F_tod involving Webb's time alibi", () => {
    const hit = matrix.find(
      (e) => e.factId === "F_tod" && e.type === "time" && involves(e, "CL_webb_alibi_time") && e.band === "major",
    );
    expect(hit).toBeDefined();
    expect(hit!.severity).toBeGreaterThan(0.5);
  });
});

describe("task test 2: genuine corroboration by two independent witnesses", () => {
  const entry = corroboration.find((c) => c.factId === "F_dolores_departure");

  it("is detected as a corroborated fact", () => {
    expect(entry).toBeDefined();
    expect(entry!.corroborated).toBe(true);
  });
  it("agrees the two witness claims (agreement band)", () => {
    const pair = entry!.pairs.find(
      (p) =>
        (p.a === "CL_dolores_departtime" && p.b === "CL_etta_seedolores") ||
        (p.a === "CL_etta_seedolores" && p.b === "CL_dolores_departtime"),
    );
    expect(pair).toBeDefined();
    expect(pair!.band).toBe("agreement");
  });
  it("is classified genuine (from veracity, not distance)", () => {
    expect(entry!.classification).toBe("genuine");
  });
});

describe("task test 3: honest mistake contradicts the correcting physical fact", () => {
  it("flags Etta's crash time against the stopped watch at moderate severity", () => {
    const hit = matrix.find(
      (e) =>
        e.factId === "F_crash_time" &&
        involves(e, "CL_etta_crashtime") &&
        involves(e, "C_stopped_watch"),
    );
    expect(hit).toBeDefined();
    expect(hit!.band).toBe("moderate");
    // Etta is off by 55 minutes; severity scales with minutes (55 / 240 ~= 0.23).
    expect(hit!.rawDistance).toBe(55);
    expect(hit!.severity).toBeGreaterThan(0.2);
    expect(hit!.severity).toBeLessThan(0.3);
  });
});

describe("task test 4: decoupling magnitude from veracity (the small lie)", () => {
  const lieClaim = bible.claims.find((c) => c.claimId === "CL_webb_calltime")!;
  const truthFact = bible.facts.find((f) => f.factId === "F_webb_call_time")!;

  it("the small lie has a small distance and band, not major", () => {
    const entry = matrix.find(
      (e) =>
        e.factId === "F_webb_call_time" &&
        involves(e, "CL_webb_calltime") &&
        involves(e, "C_phone_slip"),
    );
    expect(entry).toBeDefined();
    expect(entry!.rawDistance).toBe(8);
    expect(entry!.band).toBe("minor");
    expect(entry!.band).not.toBe("major");
    expect(entry!.severity).toBeLessThan(0.1);
  });

  it("is still a lie purely from its authored veracity tag", () => {
    // The comparator never set or read this; it is authored in the bible.
    expect(lieClaim.veracity).toBe("lie");
  });

  it("a same-magnitude honest mistake yields an identical comparator result", () => {
    // The metric takes only values, never a veracity. Feeding the same stated
    // value produces the same distance and band whether the source is a lie or
    // an honest slip: magnitude is decoupled from veracity.
    const asLie = compare(
      { type: "time", value: lieClaim.statedValue as TimeValue },
      { type: "time", value: truthFact.value as TimeValue },
    );
    const asMistake = compare(
      { type: "time", value: { kind: "point", at: "21:08" } },
      { type: "time", value: truthFact.value as TimeValue },
    );
    expect(asMistake).toEqual(asLie);
  });

  it("the small lie is not treated as corroboration despite its small distance", () => {
    // 8 minutes is minor, not agreement, so it never enters the corroboration map.
    const corr = corroboration.find((c) => c.factId === "F_webb_call_time");
    expect(corr).toBeUndefined();
  });
});

describe("corroboration classification reads veracity, not magnitude", () => {
  it("classifies only from authored tags", () => {
    // Sanity: every classification value is one of the authored-derived labels.
    for (const c of corroboration) {
      expect(["genuine", "mistakenConsensus", "collusive"]).toContain(c.classification);
    }
  });
});
