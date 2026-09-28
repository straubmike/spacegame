/**
 * L-menu distress responder odds — Fuel Rat standing drives pirate chance,
 * pack size, and tier mix. Allied Fuel Rat standing → always a Fuel Rat.
 */

import {
  FUEL,
  REPUTATION,
  type PirateTierId,
} from "../game/config";

export interface DistressPiratePlan {
  /** Probability a broadcast draws pirates (0 at Allied). */
  pirateChance: number;
  minCount: number;
  maxCount: number;
  fee: number;
  tierWeights: Record<PirateTierId, number>;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function clamp(t: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, t));
}

function lerpWeights(
  a: Record<PirateTierId, number>,
  b: Record<PirateTierId, number>,
  t: number,
): Record<PirateTierId, number> {
  return {
    scout: lerp(a.scout, b.scout, t),
    raider: lerp(a.raider, b.raider, t),
    gunship: lerp(a.gunship, b.gunship, t),
    corsair: lerp(a.corsair, b.corsair, t),
  };
}

/**
 * Build pirate spawn plan from current Fuel Rats reputation.
 * Continuous piecewise lerp through Hostile / Neutral / Friendly / Allied.
 */
export function distressPiratePlan(fuelRatsRep: number): DistressPiratePlan {
  const allied = REPUTATION.alliedAtOrAbove;
  const friendly = REPUTATION.friendlyAtOrAbove;
  const hostile = REPUTATION.hostileAtOrBelow;

  if (fuelRatsRep >= allied) {
    return {
      pirateChance: 0,
      minCount: FUEL.distressPirateMinFriendly,
      maxCount: FUEL.distressPirateMaxFriendly,
      fee: FUEL.distressFeeFriendly,
      tierWeights: { ...FUEL.distressTierWeightsFriendly },
    };
  }

  if (fuelRatsRep >= friendly) {
    // Friendly → Allied: chance falls to 0; pack stays Friendly-scale.
    const t = (fuelRatsRep - friendly) / (allied - friendly);
    return {
      pirateChance: lerp(FUEL.distressPirateChanceFriendly, 0, t),
      minCount: FUEL.distressPirateMinFriendly,
      maxCount: FUEL.distressPirateMaxFriendly,
      fee: FUEL.distressFeeFriendly,
      tierWeights: { ...FUEL.distressTierWeightsFriendly },
    };
  }

  if (fuelRatsRep >= 0) {
    // Neutral → Friendly.
    const t = fuelRatsRep / friendly;
    return {
      pirateChance: lerp(
        FUEL.distressPirateChanceNeutral,
        FUEL.distressPirateChanceFriendly,
        t,
      ),
      minCount: Math.round(
        lerp(FUEL.distressPirateMinNeutral, FUEL.distressPirateMinFriendly, t),
      ),
      maxCount: Math.round(
        lerp(FUEL.distressPirateMaxNeutral, FUEL.distressPirateMaxFriendly, t),
      ),
      fee: Math.round(
        lerp(FUEL.distressFeeNeutral, FUEL.distressFeeFriendly, t),
      ),
      tierWeights: lerpWeights(
        FUEL.distressTierWeightsNeutral,
        FUEL.distressTierWeightsFriendly,
        t,
      ),
    };
  }

  // Negative: Neutral → Hostile (clamp at Hostile floor).
  const t = clamp(fuelRatsRep / hostile, 0, 1);
  return {
    pirateChance: lerp(
      FUEL.distressPirateChanceNeutral,
      FUEL.distressPirateChanceHostile,
      t,
    ),
    minCount: Math.round(
      lerp(FUEL.distressPirateMinNeutral, FUEL.distressPirateMinHostile, t),
    ),
    maxCount: Math.round(
      lerp(FUEL.distressPirateMaxNeutral, FUEL.distressPirateMaxHostile, t),
    ),
    fee: Math.round(lerp(FUEL.distressFeeNeutral, FUEL.distressFeeHostile, t)),
    tierWeights: lerpWeights(
      FUEL.distressTierWeightsNeutral,
      FUEL.distressTierWeightsHostile,
      t,
    ),
  };
}

/** Roll whether this broadcast draws pirates (honors force-rat flag). */
export function rollDistressWantsPirates(
  fuelRatsRep: number,
  forceRat: boolean,
  rng: () => number = Math.random,
): boolean {
  if (forceRat) return false;
  return rng() < distressPiratePlan(fuelRatsRep).pirateChance;
}

export function rollDistressPirateCount(
  plan: DistressPiratePlan,
  rng: () => number = Math.random,
): number {
  const lo = Math.min(plan.minCount, plan.maxCount);
  const hi = Math.max(plan.minCount, plan.maxCount);
  return lo + Math.floor(rng() * (hi - lo + 1));
}

export function rollDistressPirateTier(
  plan: DistressPiratePlan,
  rng: () => number = Math.random,
): PirateTierId {
  const entries = Object.entries(plan.tierWeights) as [
    PirateTierId,
    number,
  ][];
  const total = entries.reduce((sum, [, w]) => sum + Math.max(0, w), 0);
  if (total <= 0) return "raider";
  let pick = rng() * total;
  for (const [tier, weight] of entries) {
    pick -= Math.max(0, weight);
    if (pick <= 0) return tier;
  }
  return entries[entries.length - 1]![0];
}
