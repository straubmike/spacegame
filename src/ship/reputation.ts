/**
 * Session reputation — stations + Imperial / pirate / Fuel Rats / Rebels / guild factions.
 *
 * Station ladder includes Violation between Unfriendly and Hostile.
 * Merchants Guild + Cartographers stand from faction-tagged generic missions.
 * Guild Friendly / Allied favor cheapens buys and raises sells; lower standing
 * leaves marketplace prices unchanged.
 *
 * L-menu visibility:
 * - Imperial + Pirates + Fuel Rats + Merchants Guild + Cartographers: always shown (even at 0)
 * - Rebels: hidden until revealed (first fence of Sensitive Derelict Cargo, etc.)
 * - Stations: non-zero only
 *
 * Imperial is broad standing for order among stations (no Violation band).
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
export const IMPERIAL_FACTION_ID = "imperial";
export const REBELS_FACTION_ID = "rebels";
export const MERCHANTS_GUILD_FACTION_ID = "merchants_guild";
export const CARTOGRAPHERS_FACTION_ID = "cartographers";

/** Factions always listed on the L Reputation band (even Neutral 0). */
export const ALWAYS_VISIBLE_FACTIONS: readonly {
  id: string;
  label: string;
}[] = [
  { id: PIRATE_FACTION_ID, label: "Pirates" },
  { id: FUEL_RATS_FACTION_ID, label: "Fuel Rats" },
  { id: IMPERIAL_FACTION_ID, label: "Imperial" },
];

/** Guild factions — always listed after reveal-gated rows. */
export const GUILD_FACTIONS: readonly {
  id: string;
  label: string;
}[] = [
  { id: MERCHANTS_GUILD_FACTION_ID, label: "Merchants Guild" },
  { id: CARTOGRAPHERS_FACTION_ID, label: "Cartographers" },
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

/**
 * Reputation-menu labels only.
 * A station name that is shared — with another row in this list, or with
 * another station in the galaxy — is qualified by the main-sequence star:
 * "Aether Station (Lave)". Unique names stay as stored.
 * Standing, fines, and perks are unchanged.
 */
export function qualifySharedStationLabels(
  rows: readonly ReputationStationRow[],
  starNameForKey: (key: string) => string | null,
  namesSharedInGalaxy: ReadonlySet<string>,
): ReputationStationRow[] {
  const listed = new Map<string, number>();
  for (const row of rows) {
    listed.set(row.name, (listed.get(row.name) ?? 0) + 1);
  }
  return rows.map((row) => {
    const shared =
      (listed.get(row.name) ?? 0) > 1 || namesSharedInGalaxy.has(row.name);
    if (!shared) return row;
    const star = starNameForKey(row.key);
    if (!star) return row;
    const suffix = ` (${star})`;
    if (row.name.endsWith(suffix)) return row;
    return { ...row, name: `${row.name}${suffix}` };
  });
}

/** Payload for the L-menu Reputation band. */
export interface ReputationListing {
  /**
   * Always-visible factions first (Pirates, Fuel Rats, Imperial), then
   * revealed factions (Rebels), then guilds (Merchants Guild, Cartographers).
   */
  factions: ReputationFactionRow[];
  /** Only stations with non-zero standing. */
  stations: ReputationStationRow[];
}

const FACTION_IDS = new Set<string>([
  PIRATE_FACTION_ID,
  FUEL_RATS_FACTION_ID,
  IMPERIAL_FACTION_ID,
  REBELS_FACTION_ID,
  MERCHANTS_GUILD_FACTION_ID,
  CARTOGRAPHERS_FACTION_ID,
]);

export function isFactionReputationId(id: string): boolean {
  return FACTION_IDS.has(id);
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
 * Imperial / pirate / Fuel Rats / Rebels / guilds — no Violation band.
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
  private imperialStanding = 0;
  private rebelsStanding = 0;
  private merchantsStanding = 0;
  private cartographersStanding = 0;
  /** Once true, Rebels stay on the L list even if standing returns to 0. */
  private rebelsRevealed = false;

  /** Wipe session standing so a new run starts Neutral. */
  reset(): void {
    this.stations.clear();
    this.stationLabels.clear();
    this.pirateStanding = 0;
    this.fuelRatsStanding = 0;
    this.imperialStanding = 0;
    this.rebelsStanding = 0;
    this.merchantsStanding = 0;
    this.cartographersStanding = 0;
    this.rebelsRevealed = false;
  }

  stationStanding(stationKey: string): number {
    return this.stations.get(stationKey) ?? 0;
  }

  pirateRep(): number {
    return this.pirateStanding;
  }

  fuelRatsRep(): number {
    return this.fuelRatsStanding;
  }

  imperialRep(): number {
    return this.imperialStanding;
  }

  rebelsRep(): number {
    return this.rebelsStanding;
  }

  merchantsRep(): number {
    return this.merchantsStanding;
  }

  cartographersRep(): number {
    return this.cartographersStanding;
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
    if (label && !isFactionReputationId(target)) {
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
    if (target === IMPERIAL_FACTION_ID) {
      this.imperialStanding = clampStanding(this.imperialStanding + delta);
      return this.imperialStanding;
    }
    if (target === REBELS_FACTION_ID) {
      this.rebelsStanding = clampStanding(this.rebelsStanding + delta);
      this.rebelsRevealed = true;
      return this.rebelsStanding;
    }
    if (target === MERCHANTS_GUILD_FACTION_ID) {
      this.merchantsStanding = clampStanding(this.merchantsStanding + delta);
      return this.merchantsStanding;
    }
    if (target === CARTOGRAPHERS_FACTION_ID) {
      this.cartographersStanding = clampStanding(
        this.cartographersStanding + delta,
      );
      return this.cartographersStanding;
    }
    const next = clampStanding(this.stationStanding(target) + delta);
    this.stations.set(target, next);
    return next;
  }

  /** Absolute write of a chosen score. Fines still pass a fixed target. */
  setStanding(target: string, value: number, label?: string): number {
    if (label && !isFactionReputationId(target)) {
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
    if (target === IMPERIAL_FACTION_ID) {
      this.imperialStanding = next;
      return next;
    }
    if (target === REBELS_FACTION_ID) {
      this.rebelsStanding = next;
      this.rebelsRevealed = true;
      return next;
    }
    if (target === MERCHANTS_GUILD_FACTION_ID) {
      this.merchantsStanding = next;
      return next;
    }
    if (target === CARTOGRAPHERS_FACTION_ID) {
      this.cartographersStanding = next;
      return next;
    }
    this.stations.set(target, next);
    return next;
  }

  private readTarget(target: string): number {
    if (target === PIRATE_FACTION_ID) return this.pirateStanding;
    if (target === FUEL_RATS_FACTION_ID) return this.fuelRatsStanding;
    if (target === IMPERIAL_FACTION_ID) return this.imperialStanding;
    if (target === REBELS_FACTION_ID) return this.rebelsStanding;
    if (target === MERCHANTS_GUILD_FACTION_ID) return this.merchantsStanding;
    if (target === CARTOGRAPHERS_FACTION_ID) return this.cartographersStanding;
    return this.stationStanding(target);
  }

  /**
   * Mark station Hostile (unredeemable).
   * Same outcome for attacking a patrol or letting a Violation window expire.
   * Writes min(current, hostile floor) so a worse score is not raised.
   */
  markHostile(stationKey: string, label?: string): number {
    const current = this.stationStanding(stationKey);
    const target = REPUTATION.hostileAtOrBelow;
    return this.setStanding(stationKey, Math.min(current, target), label);
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
   * Fraction off a hangar ship purchase (0 … 1).
   * Imperial standing only — `pirateStandingBand`, so there is no Violation
   * band and the station score is not consulted.
   * Friendly and Allied discount; Unfriendly, Neutral, and Hostile do not.
   */
  hangarDiscountFraction(): number {
    const band = pirateStandingBand(this.imperialStanding);
    if (band === "allied") return REPUTATION.hangarDiscountAllied;
    if (band === "friendly") return REPUTATION.hangarDiscountFriendly;
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
 * Buy and sell price factors for Merchants Guild standing.
 * Replaces `merchantTariffMultiplier`: one multiplier cannot cheapen a buy
 * and raise a sell at the same time. Neutral, and every band below Friendly,
 * stays 1 so low standing does not worsen prices.
 * Friendly (≥ 20): buy 0.92, sell 1.08. Allied (≥ 50): buy 0.85, sell 1.15.
 */
export interface MerchantTariffFactors {
  /** Multiply the price the player pays. */
  buy: number;
  /** Multiply the price the player receives. */
  sell: number;
}

export function merchantTariffFactors(standing = 0): MerchantTariffFactors {
  const band = pirateStandingBand(standing);
  if (band === "allied") {
    const favor = REPUTATION.merchantTariffAllied;
    return { buy: 1 - favor, sell: 1 + favor };
  }
  if (band === "friendly") {
    const favor = REPUTATION.merchantTariffFriendly;
    return { buy: 1 - favor, sell: 1 + favor };
  }
  return { buy: 1, sell: 1 };
}

/**
 * Credits per CU after guild favor.
 * Buys floor and sells ceil so a fractional credit stays in the player's favor.
 */
export function applyMerchantTariff(
  price: number,
  factor: number,
  side: "buy" | "sell",
): number {
  if (price <= 0 || factor === 1) return Math.max(0, price);
  const scaled = price * factor;
  const credits = side === "sell" ? Math.ceil(scaled) : Math.floor(scaled);
  return Math.max(1, credits);
}

/** Apply a bay discount to an already-computed net swap cost. */
export function applyBayDiscount(cost: number, discountFraction: number): number {
  if (cost <= 0 || discountFraction <= 0) return Math.max(0, cost);
  return Math.max(0, Math.floor(cost * (1 - discountFraction)));
}
