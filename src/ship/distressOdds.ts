/**
 * L-menu distress responder odds — Fuel Rat standing drives whether a
 * broadcast draws pirates or a Fuel Rat.
 * Allied Fuel Rat standing → always a Fuel Rat.
 * Pack size, loadout, and the toll are the normal heat encounter, not standing.
 */

import { FUEL, REPUTATION } from "../game/config";

export interface DistressPiratePlan {
  /** Probability a broadcast draws pirates (0 at Allied). */
  pirateChance: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(t: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, t));
}

/**
 * Pirate-vs-Fuel-Rat chance from current Fuel Rats reputation.
 * Continuous piecewise lerp through Hostile / Neutral / Friendly / Allied.
 */
export function distressPiratePlan(fuelRatsRep: number): DistressPiratePlan {
  const allied = REPUTATION.alliedAtOrAbove;
  const friendly = REPUTATION.friendlyAtOrAbove;
  const hostile = REPUTATION.hostileAtOrBelow;

  if (fuelRatsRep >= allied) {
    return { pirateChance: 0 };
  }

  if (fuelRatsRep >= friendly) {
    const t = (fuelRatsRep - friendly) / (allied - friendly);
    return { pirateChance: lerp(FUEL.distressPirateChanceFriendly, 0, t) };
  }

  if (fuelRatsRep >= 0) {
    const t = fuelRatsRep / friendly;
    return {
      pirateChance: lerp(
        FUEL.distressPirateChanceNeutral,
        FUEL.distressPirateChanceFriendly,
        t,
      ),
    };
  }

  const t = clamp(fuelRatsRep / hostile, 0, 1);
  return {
    pirateChance: lerp(
      FUEL.distressPirateChanceNeutral,
      FUEL.distressPirateChanceHostile,
      t,
    ),
  };
}

/** Roll whether this broadcast draws pirates. */
export function rollDistressWantsPirates(
  fuelRatsRep: number,
  rng: () => number = Math.random,
): boolean {
  return rng() < distressPiratePlan(fuelRatsRep).pirateChance;
}
