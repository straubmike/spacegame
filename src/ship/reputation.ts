/**
 * Session reputation — per-station standings + pirate faction.
 *
 * Station ladder includes Violation between Unfriendly and Hostile.
 * Federations / guilds are design-only; merchants tariff is a stub.
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
  /** Always shown (even at 0) — pirates now; guild stubs reserved. */
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
 * Pirate faction has no Violation band — fold that range into Unfriendly.
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

/** Pirate faction label — no Violation band. */
export function formatPirateStanding(score: number): string {
  const band = standingBandLabel(pirateStandingBand(score));
  const signed = score > 0 ? `+${score}` : `${score}`;
  return `${band} (${signed})`;
}

export class ReputationTracker {
  private readonly stations = new Map<string, number>();
  private readonly stationLabels = new Map<string, string>();
  private pirateStanding = 0;

  stationStanding(stationKey: string): number {
    return this.stations.get(stationKey) ?? 0;
  }

  pirateRep(): number {
    return this.pirateStanding;
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
    if (label && target !== PIRATE_FACTION_ID) {
      this.stationLabels.set(target, label);
    }
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

  /** Absolute set (fines, attack-patrol / Violation-timeout → Hostile). */
  setStanding(target: string, value: number, label?: string): number {
    if (label && target !== PIRATE_FACTION_ID) {
      this.stationLabels.set(target, label);
    }
    const next = clampStanding(value);
    if (target === PIRATE_FACTION_ID) {
      this.pirateStanding = next;
      return next;
    }
    this.stations.set(target, next);
    return next;
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
   * Apply patrol fine payoff.
   * Violation → Unfriendly floor; Unfriendly → Neutral 0. Hostile: no-op.
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
