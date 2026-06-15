/**
 * Seeded, deterministic pseudo-random number generator for the case generator.
 * A seed produces a fully reproducible stream, so the structural skeleton is
 * reproducible from the seed alone. The only nondeterministic part of a case is
 * the model content fill, which is frozen into the case once baked.
 */

export interface Rng {
  /** Next float in [0, 1). */
  next(): number;
  /** Integer in [min, max] inclusive. */
  int(min: number, max: number): number;
  /** Pick one element. */
  pick<T>(items: readonly T[]): T;
  /** Normal sample around mean with standard deviation, rounded and clamped to [min, max]. */
  normalClamped(mean: number, sd: number, min: number, max: number): number;
}

/** mulberry32: small, fast, deterministic. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = (): number => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int(min, max) {
      return min + Math.floor(next() * (max - min + 1));
    },
    pick(items) {
      return items[Math.floor(next() * items.length)];
    },
    normalClamped(mean, sd, min, max) {
      // Box-Muller transform.
      const u1 = Math.max(next(), Number.EPSILON);
      const u2 = next();
      const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      return Math.min(max, Math.max(min, Math.round(mean + sd * z)));
    },
  };
  return rng;
}
