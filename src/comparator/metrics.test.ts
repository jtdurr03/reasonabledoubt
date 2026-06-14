/**
 * Focused per-type unit tests (task test 5) plus the dispatch and incomparable
 * tests (task test 6). Each metric is exercised at agreement, a middle band,
 * and major with hand-built inputs, confirming the thresholds in config.ts.
 */

import { describe, it, expect } from "vitest";
import { compare } from "./index.js";
import { compareTime } from "./metrics/time.js";
import { compareLocation } from "./metrics/location.js";
import { compareCount } from "./metrics/count.js";
import { compareIdentity } from "./metrics/identity.js";
import { compareObject } from "./metrics/object.js";

describe("time metric", () => {
  it("a few minutes apart is agreement", () => {
    expect(compareTime({ kind: "point", at: "21:00" }, { kind: "point", at: "21:03" }).band).toBe("agreement");
  });
  it("about an hour apart is moderate (middle)", () => {
    const r = compareTime({ kind: "point", at: "21:00" }, { kind: "point", at: "22:00" });
    expect(r.rawDistance).toBe(60);
    expect(r.band).toBe("moderate");
  });
  it("several hours apart is major", () => {
    expect(compareTime({ kind: "point", at: "19:00" }, { kind: "point", at: "22:20" }).band).toBe("major");
  });
  it("a point inside a window is distance 0", () => {
    const r = compareTime({ kind: "point", at: "22:00" }, { kind: "window", start: "21:45", end: "22:30" });
    expect(r.rawDistance).toBe(0);
    expect(r.band).toBe("agreement");
  });
  it("non-overlapping windows measure the gap", () => {
    const r = compareTime({ kind: "window", start: "19:00", end: "20:00" }, { kind: "window", start: "21:00", end: "22:00" });
    expect(r.rawDistance).toBe(60);
  });
});

describe("location metric", () => {
  const room = (district: string, building: string, room: string) => ({ district, building, room });
  it("same room is agreement", () => {
    expect(compareLocation(room("Bunker Hill", "Loans", "office"), room("Bunker Hill", "Loans", "office")).band).toBe("agreement");
  });
  it("same building different room is minor", () => {
    expect(compareLocation(room("Bunker Hill", "Loans", "office"), room("Bunker Hill", "Loans", "front")).band).toBe("minor");
  });
  it("same district different building is moderate (middle)", () => {
    expect(compareLocation(room("Bunker Hill", "Loans", "office"), room("Bunker Hill", "Diner", "counter")).band).toBe("moderate");
  });
  it("different district is major", () => {
    expect(compareLocation(room("Bunker Hill", "Loans", "office"), room("Westlake", "Tiki Room", "bar")).band).toBe("major");
  });
});

describe("count metric (absolute mode)", () => {
  it("identical counts are agreement", () => {
    expect(compareCount({ count: 3, of: "shots" }, { count: 3, of: "shots" }).band).toBe("agreement");
  });
  it("off by one is minor", () => {
    expect(compareCount({ count: 2, of: "shots" }, { count: 3, of: "shots" }).band).toBe("minor");
  });
  it("off by three is moderate (middle)", () => {
    expect(compareCount({ count: 2, of: "shots" }, { count: 5, of: "shots" }).band).toBe("moderate");
  });
  it("two versus six is major", () => {
    expect(compareCount({ count: 2, of: "shots" }, { count: 6, of: "shots" }).band).toBe("major");
  });
});

describe("identity metric", () => {
  it("same character reference is agreement", () => {
    expect(compareIdentity({ characterId: "CH_x" }, { characterId: "CH_x" }).band).toBe("agreement");
  });
  it("one adjacent height band apart is minor (middle)", () => {
    const r = compareIdentity(
      { descriptor: { sex: "male", heightBand: "tall" } },
      { descriptor: { sex: "male", heightBand: "average" } },
    );
    expect(r.band).toBe("minor");
  });
  it("a tall man does not match a short woman (major)", () => {
    const r = compareIdentity(
      { descriptor: { sex: "male", heightBand: "tall" } },
      { descriptor: { sex: "female", heightBand: "short" } },
    );
    expect(r.band).toBe("major");
  });
  it("different known characters is major", () => {
    expect(compareIdentity({ characterId: "CH_x" }, { characterId: "CH_y" }).band).toBe("major");
  });
});

describe("object metric", () => {
  it("same category and subtype is agreement", () => {
    expect(compareObject({ category: "weapon", subtype: "glass bottle" }, { category: "weapon", subtype: "glass bottle" }).band).toBe("agreement");
  });
  it("same category different subtype is minor (middle)", () => {
    const r = compareObject({ category: "blade", subtype: "kitchen knife" }, { category: "blade", subtype: "hunting knife" });
    expect(r.band).toBe("minor");
  });
  it("different category is major", () => {
    expect(compareObject({ category: "blade" }, { category: "gun" }).band).toBe("major");
  });
});

describe("compare dispatch and incomparability (task test 6)", () => {
  it("returns an explicit incomparable result for mismatched types, without throwing", () => {
    const result = compare(
      { type: "time", value: { kind: "point", at: "21:00" } },
      { type: "location", value: { district: "Bunker Hill" } },
    );
    expect(result.comparable).toBe(false);
    if (!result.comparable) {
      expect(result.aType).toBe("time");
      expect(result.bType).toBe("location");
      expect(result.reason).toMatch(/time/);
      expect(result.reason).toMatch(/location/);
    }
  });
  it("dispatches matched types to the right metric", () => {
    const result = compare(
      { type: "time", value: { kind: "point", at: "21:00" } },
      { type: "time", value: { kind: "point", at: "21:00" } },
    );
    expect(result.comparable).toBe(true);
    if (result.comparable) {
      expect(result.type).toBe("time");
      expect(result.rawDistance).toBe(0);
    }
  });
});
