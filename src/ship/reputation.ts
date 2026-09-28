/**
 * Session reputation — per-station standings + pirate / Fuel Rats / Rebels factions.
 *
 * Station ladder includes Violation between Unfriendly and Hostile.
 * Federations / guilds are design-only; merchants tariff is a stub.
 *
 * L-menu visibility:
 * - Pirates + Fuel Rats: always shown (even at 0)
 * - Rebels: hidden until revealed (first fence of Sensitive Derelict Cargo, etc.)
 * - Stations: non-zero only
 */

import { REPUTATION } from "../game/config";

export type StandingBand =
  | "hostile"
  | "violation"
  | "unfriendly"
  | "neutral"
  | "friendly"
  | "allied";

export const PIRATE_FACTION_ID = "pirates";
export const FUEL_RATS_FACTION_ID = "fuel_rats";
export const REBELS_FACTION_ID = "rebels";

/** Factions always listed on the L Reputation band (even Neutral 0). */
export const ALWAYS_VISIBLE_FACTIONS: readonly {
  id: string;
  label: string;
}[] = [
  { id: PIRATE_FACTION_ID, label: "Pirates" },
  { id: FUEL_RATS_FACTION_ID, label: "Fuel Rats" },
];

export interface ReputationFactionRow {
  id: string;
  label: string;
  score: number;
}

export interface ReputationStationRow {
  key: string;
  name: string;
  score: number;
}

/** Payload for the L-menu Reputation band. */
export interface ReputationListing {
  /**
   * Always-visible factions first (Pirates, Fuel Rats), then revealed
   * factions (Rebels), then guild stubs.
   */
  factions: ReputationFactionRow[];
  /** Only stations with non-zero standing. */
  stations: ReputationStationRow[];
}

export function clampStanding(score: number): number {
  return Math.max(REPUTATION.min, Math.min(REPUTATION.max, Math.round(score)));
}

/** Station standing bands (includes Violation). */
export function standingBand(score: number): StandingBand {
  if (score <= REPUTATION.hostileAtOrBelow) return "hostile";
  if (score <= REPUTATION.violationAtOrBelow) return "violation";
  if (score <= REPUTATION.unfriendlyAtOrBelow) return "unfriendly";
  if (score >= REPUTATION.alliedAtOrAbove) return "allied";
  if (score >= REPUTATION.friendlyAtOrAbove) return "friendly";
  return "neutral";
}

/**
 * Pirate / Fuel Rats / Rebels — no Violation band; fold that range into Unfriendly.
 */
export function pirateStandingBand(score: number): StandingBand {
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
    case "violation":
      return "Violation";
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

/** e.g. "Friendly (+24)" — uses station ladder (includes Violation). */
export function formatStanding(score: number): string {
  const band = standingBandLabel(standingBand(score));
  const signed = score > 0 ? `+${score}` : `${score}`;
  return `${band} (${signed})`;
}

/** Faction label — no Violation band. */
export function formatPirateStanding(score: number): string {
  const band = standingBandLabel(pirateStandingBand(score));
  const signed = score > 0 ? `+${score}` : `${score}`;
  return `${band} (${signed})`;
}

export class ReputationTracker {
  private readonly stations = new Map<string, number>();
  private readonly stationLabels = new Map<string, string>();
  private pirateStanding = 0;
  private fuelRatsStanding = 0;
  private rebelsStanding = 0;
  /** Once true, Rebels stay on the L list even if standing returns to 0. */
  private rebelsRevealed = false;

  stationStanding(stationKey: string): number {
    return this.stations.get(stationKey) ?? 0;
  }

  pirateRep(): number {
    return this.pirateStanding;
  }

  fuelRatsRep(): number {
    return this.fuelRatsStanding;
  }

  rebelsRep(): number {
    return this.rebelsStanding;
  }

  rebelsKnown(): boolean {
    return this.rebelsRevealed;
  }

  /** Stations with non-zero standing (for L-menu listing). */
  nonzeroStations(): ReputationStationRow[] {
    const rows: ReputationStationRow[] = [];
    for (const [key, score] of this.stations) {
      if (score === 0) continue;
      rows.push({
        key,
        name: this.stationLabels.get(key) ?? key,
        score,
      });
    }
    rows.sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
    return rows;
  }

  /**
   * Apply a delta. Returns the new score (clamped).
   * Optional `label` stores a display name for station rows.
   */
  adjust(target: string, delta: number, label?: string): number {
    if (
      label &&
      target !== PIRATE_FACTION_ID &&
      target !== FUEL_RATS_FACTION_ID &&
      target !== REBELS_FACTION_ID
    ) {
      this.stationLabels.set(target, label);
    }
    if (delta === 0) {
      return this.readTarget(target);
    }
    if (target === PIRATE_FACTION_ID) {
      this.pirateStanding = clampStanding(this.pirateStanding + delta);
      return this.pirateStanding;
    }
    if (target === FUEL_RATS_FACTION_ID) {
      this.fuelRatsStanding = clampStanding(this.fuelRatsStanding + delta);
      return this.fuelRatsStanding;
    }
    if (target === REBELS_FACTION_ID) {
      this.rebelsStanding = clampStanding(this.rebelsStanding + delta);
      this.rebelsRevealed = true;
      return this.rebelsStanding;
    }
    const next = clampStanding(this.stationStanding(target) + delta);
    this.stations.set(target, next);
    return next;
  }

  /** Absolute set (fines, attack-patrol / Violation-timeout → Hostile). */
  setStanding(target: string, value: number, label?: string): number {
    if (
      label &&
      target !== PIRATE_FACTION_ID &&
      target !== FUEL_RATS_FACTION_ID &&
      target !== REBELS_FACTION_ID
    ) {
      this.stationLabels.set(target, label);
    }
    const next = clampStanding(value);
    if (target === PIRATE_FACTION_ID) {
      this.pirateStanding = next;
      return next;
    }
    if (target === FUEL_RATS_FACTION_ID) {
      this.fuelRatsStanding = next;
      return next;
    }
    if (target === REBELS_FACTION_ID) {
      this.rebelsStanding = next;
      this.rebelsRevealed = true;
      return next;
    }
    this.stations.set(target, next);
    return next;
  }

  private readTarget(target: string): number {
    if (target === PIRATE_FACTION_ID) return this.pirateStanding;
    if (target === FUEL_RATS_FACTION_ID) return this.fuelRatsStanding;
    if (target === REBELS_FACTION_ID) return this.rebelsStanding;
    return this.stationStanding(target);
  }

  /**
   * Mark station Hostile (unredeemable).
   * Same outcome for attacking a patrol or letting a Violation window expire.
   */
  markHostile(stationKey: string, label?: string): number {
    return this.setStanding(stationKey, REPUTATION.hostileAtOrBelow, label);
  }

  /**
   * Cargo steal (keep freight on cancel).
   * Applies steal delta, then **forces at least Unfriendly** so a single steal
   * never leaves you Neutral after positive standing (e.g. +15 −22 → −7).
   */
  applyCargoSteal(stationKey: string, label?: string): number {
    const next = clampStanding(
      this.stationStanding(stationKey) + REPUTATION.stealCargo,
    );
    // Still Neutral or better → snap to Unfriendly floor.
    const forced =
      next > REPUTATION.unfriendlyAtOrBelow
        ? REPUTATION.unfriendlyFloor
        : next;
    return this.setStanding(stationKey, forced, label);
  }

  /**
   * Redeemable fine available?
   * Unfriendly (optional → Neutral) or Violation (→ Unfriendly). Hostile: never.
   */
  hasOutstandingFine(stationKey: string): boolean {
    const band = standingBand(this.stationStanding(stationKey));
    return band === "unfriendly" || band === "violation";
  }

  /** Credits to pay a patrol fine at the current standing. */
  patrolFineCredits(stationKey: string): number {
    if (!this.hasOutstandingFine(stationKey)) return 0;
    const standing = this.stationStanding(stationKey);
    return Math.max(
      REPUTATION.patrolFineMin,
      Math.abs(standing) * REPUTATION.patrolFinePerPoint,
    );
  }

  /**
   * Apply standing fine payoff (patrol click or station-hail Settle).
   * Violation → Unfriendly floor; Unfriendly → Neutral 0. Hostile: no-op.
   * Credits-only — no cargo required (stolen-haul / empty-hold path).
   */
  applyPatrolFine(stationKey: string, label?: string): number | null {
    const band = standingBand(this.stationStanding(stationKey));
    if (band === "hostile" || (band !== "unfriendly" && band !== "violation")) {
      return null;
    }
    const next =
      band === "violation" ? REPUTATION.unfriendlyFloor : 0;
    return this.setStanding(stationKey, next, label);
  }

  /** Dock denied at Violation and Hostile. */
  allowsDock(stationKey: string): boolean {
    const band = standingBand(this.stationStanding(stationKey));
    return band !== "hostile" && band !== "violation";
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
   */
  pirateEncounterOverride(): "skipFee" | "instantAggro" | null {
    const band = pirateStandingBand(this.pirateStanding);
    if (band === "allied") return "skipFee";
    if (band === "hostile") return "instantAggro";
    return null;
  }
}

/**
 * Merchants-guild tariff stub — always 1.0 until market tariffs exist.
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
