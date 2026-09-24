/**
 * Session reputation — per-station standings + pirate faction.
 *
 * Federations / guilds are design-only for now; merchants tariff is a stub
 * so market code can call it without inventing pricing later.
 */

import { REPUTATION } from "../game/config";

export type StandingBand =
  | "hostile"
  | "unfriendly"
  | "neutral"
  | "friendly"
  | "allied";

export const PIRATE_FACTION_ID = "pirates";

export function clampStanding(value: number): number {
  return Math.max(REPUTATION.min, Math.min(REPUTATION.max, Math.round(value)));
}

export function standingBand(score: number): StandingBand {
  if (score <= REPUTATION.hostileAtOrBelow) return "hostile";
  if (score <= REPUTATION.unfriendlyAtOrBelow) return "unfriendly";
  if (score >= REPUTATION.alliedAtOrAbove) return "allied";
  if (score >= REPUTATION.friendlyAtOrAbove) return "friendly";
  return "neutral";
}

export function standingBandLabel(band: StandingBand): string {
  switch (band) {
    case "hostile":
      return "Hostile";
    case "unfriendly":
      return "Unfriendly";
    case "neutral":
      return "Neutral";
    case "friendly":
      return "Friendly";
    case "allied":
      return "Allied";
  }
}

/** e.g. "Friendly (+24)" */
export function formatStanding(score: number): string {
  const band = standingBandLabel(standingBand(score));
  const signed = score > 0 ? `+${score}` : `${score}`;
  return `${band} (${signed})`;
}

export class ReputationTracker {
  private readonly stations = new Map<string, number>();
  private pirateStanding = 0;

  stationStanding(stationKey: string): number {
    return this.stations.get(stationKey) ?? 0;
  }

  pirateRep(): number {
    return this.pirateStanding;
  }

  /**
   * Apply a delta. Returns the new score (clamped).
   * `target` is a station key, or {@link PIRATE_FACTION_ID}.
   */
  adjust(target: string, delta: number): number {
    if (delta === 0) {
      return target === PIRATE_FACTION_ID
        ? this.pirateStanding
        : this.stationStanding(target);
    }
    if (target === PIRATE_FACTION_ID) {
      this.pirateStanding = clampStanding(this.pirateStanding + delta);
      return this.pirateStanding;
    }
    const next = clampStanding(this.stationStanding(target) + delta);
    this.stations.set(target, next);
    return next;
  }

  /** Absolute set (e.g. patrol fine clears standing to Neutral 0). */
  setStanding(target: string, value: number): number {
    const next = clampStanding(value);
    if (target === PIRATE_FACTION_ID) {
      this.pirateStanding = next;
      return next;
    }
    this.stations.set(target, next);
    return next;
  }

  /** Negative standing unlocks patrol fine payoff. */
  hasOutstandingFine(stationKey: string): boolean {
    return this.stationStanding(stationKey) < 0;
  }

  /** Credits to clear a negative station standing via patrol. */
  patrolFineCredits(stationKey: string): number {
    const standing = this.stationStanding(stationKey);
    if (standing >= 0) return 0;
    return Math.max(
      REPUTATION.patrolFineMin,
      Math.abs(standing) * REPUTATION.patrolFinePerPoint,
    );
  }

  /** Hostile station standing blocks hail clearance / approach. */
  allowsDock(stationKey: string): boolean {
    return (
      standingBand(this.stationStanding(stationKey)) !== "hostile"
    );
  }

  /** Fraction off bay net install cost (0 … 1). */
  bayDiscountFraction(stationKey: string): number {
    const band = standingBand(this.stationStanding(stationKey));
    if (band === "allied") return REPUTATION.bayDiscountAllied;
    if (band === "friendly") return REPUTATION.bayDiscountFriendly;
    return 0;
  }

  /**
   * Pirate encounter stance override for the pack AI.
   * - allied → skip fee (peaceful passage)
   * - hostile → fight immediately
   * - null → normal fee window
   */
  pirateEncounterOverride(): "skipFee" | "instantAggro" | null {
    const band = standingBand(this.pirateStanding);
    if (band === "allied") return "skipFee";
    if (band === "hostile") return "instantAggro";
    return null;
  }
}

/**
 * Merchants-guild tariff stub — always 1.0 until market tariffs exist.
 * Call sites can multiply buy/sell by this without redesign later.
 */
export function merchantTariffMultiplier(_standing = 0): number {
  void _standing;
  return 1;
}

/** Apply a bay discount to an already-computed net swap cost. */
export function applyBayDiscount(cost: number, discountFraction: number): number {
  if (cost <= 0 || discountFraction <= 0) return Math.max(0, cost);
  return Math.max(0, Math.floor(cost * (1 - discountFraction)));
}
