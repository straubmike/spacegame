import { GALAXY } from "../game/config";
import type { HostKind, PoiType, StarClass } from "../galaxy/types";
import { hash2, mulberry32 } from "../galaxy/rng";
import {
  CATALOG,
  cloneModule,
  MODULES,
  type EquipModule,
  type ModuleTier,
  type SlotKind,
} from "./equipment";
import { hashStationKey } from "./stationKey";

/** How well-stocked a bay is — drives max module tier. */
export type StationWealth = "outpost" | "standard" | "hub";

/** Context used to seed wealth + stock mix for a docked station. */
export interface StationStockContext {
  poiType: PoiType;
  /** Body/host the station orbits (or exotic focus kind). */
  hostKind: HostKind;
  starClass?: StarClass;
}

/**
 * Seeded bay inventory for a station.
 * Always stocks starter weapon/drive; upgrades gated by wealth tier.
 */
export function stationBayStock(
  stationKey: string,
  context?: StationStockContext,
): EquipModule[] {
  const rng = mulberry32(hash2(GALAXY.seed ^ 0xb1000d, hashStationKey(stationKey)));
  const wealth = context
    ? deriveStationWealth(context)
    : deriveWealthFromKey(stationKey, rng);

  const maxTier = maxTiersForWealth(wealth, rng);

  const stock: EquipModule[] = [
    cloneModule(MODULES.energyPulse),
    cloneModule(MODULES.basicDrive),
  ];

  const weapons = poolFor("weapon", maxTier).filter((m) => m.id !== "energy_pulse");
  const drives = poolFor("drive", maxTier).filter((m) => m.id !== "basic_drive");
  const utilities = poolFor("utility", maxTier);

  // Hubs stock deeper shelves; outposts stay thin.
  const weaponPicks =
    wealth === "hub" ? 2 + (rng() < 0.55 ? 1 : 0) : 1 + (rng() < 0.45 ? 1 : 0);
  const drivePicks =
    wealth === "hub" ? 2 + (rng() < 0.5 ? 1 : 0) : 1 + (rng() < 0.4 ? 1 : 0);
  const utilPicks =
    wealth === "hub"
      ? 2 + (rng() < 0.6 ? 1 : 0)
      : wealth === "standard"
        ? 1 + (rng() < 0.55 ? 1 : 0)
        : 1 + (rng() < 0.35 ? 1 : 0);

  pickInto(stock, weapons, weaponPicks, rng);
  pickInto(stock, drives, drivePicks, rng);
  pickInto(stock, utilities, utilPicks, rng);

  // Guarantee at least one mid module at hubs so progression is visible early.
  if (wealth === "hub" && !stock.some((m) => m.tier >= 2)) {
    const midPool = CATALOG.filter((m) => m.tier === 2);
    if (midPool.length > 0) {
      const pick = midPool[Math.floor(rng() * midPool.length) % midPool.length]!;
      stock.push(cloneModule(pick));
    }
  }

  return stock;
}

export function stockForSlot(
  stock: EquipModule[],
  kind: SlotKind,
): EquipModule[] {
  return stock.filter((m) => m.kind === kind);
}

export function wealthLabel(wealth: StationWealth): string {
  switch (wealth) {
    case "outpost":
      return "Outpost bay";
    case "standard":
      return "Standard bay";
    case "hub":
      return "Hub bay";
  }
}

/**
 * Map POI / host flavor → bay wealth.
 * Habitable & busy star docks stock late gear; ice/molten/exotica stay thin.
 */
export function deriveStationWealth(ctx: StationStockContext): StationWealth {
  const { poiType, hostKind, starClass } = ctx;

  if (poiType !== "starSystem") {
    // Exotic docks: derelict/rogue lean poor; neutron/black hole niche hubs.
    if (poiType === "neutronStar" || poiType === "blackHole") return "hub";
    if (poiType === "nebula") return "standard";
    return "outpost";
  }

  if (hostKind === "habitable") return "hub";
  if (hostKind === "molten" || hostKind === "ice" || hostKind === "asteroidBelt") {
    return "outpost";
  }
  if (hostKind === "gasGiant") return "standard";
  if (hostKind === "rocky") {
    // Inner rocky can be mining-rich enough for mid stock.
    return "standard";
  }
  if (hostKind === "star") {
    if (!starClass) return "standard";
    if (starClass === "G" || starClass === "F" || starClass === "A") return "hub";
    if (starClass === "O" || starClass === "B") return "hub";
    if (starClass === "K") return "standard";
    return "outpost"; // M-dwarf star docks
  }

  return "standard";
}

/** Resolve wealth for UI when bay is open (same seed rules as stock). */
export function stationBayWealth(
  stationKey: string,
  context?: StationStockContext,
): StationWealth {
  if (context) return deriveStationWealth(context);
  const rng = mulberry32(hash2(GALAXY.seed ^ 0xb1000d, hashStationKey(stationKey)));
  return deriveWealthFromKey(stationKey, rng);
}

function deriveWealthFromKey(_stationKey: string, rng: () => number): StationWealth {
  const roll = rng();
  if (roll < 0.28) return "outpost";
  if (roll < 0.72) return "standard";
  return "hub";
}

function maxTiersForWealth(
  wealth: StationWealth,
  rng: () => number,
): ModuleTier {
  if (wealth === "hub") return 3;
  if (wealth === "standard") {
    // Occasional late teaser so hubs aren't the only late source.
    return rng() < 0.12 ? 3 : 2;
  }
  // Outposts: mostly beginner, rare mid tease.
  return rng() < 0.18 ? 2 : 1;
}

function poolFor(kind: SlotKind, maxTier: ModuleTier): EquipModule[] {
  return CATALOG.filter((m) => m.kind === kind && m.tier <= maxTier);
}

function pickInto(
  dest: EquipModule[],
  pool: EquipModule[],
  count: number,
  rng: () => number,
): void {
  const remaining = [...pool];
  for (let n = 0; n < count && remaining.length > 0; n += 1) {
    const i = Math.floor(rng() * remaining.length) % remaining.length;
    const pick = remaining.splice(i, 1)[0]!;
    if (!dest.some((m) => m.id === pick.id)) {
      dest.push(cloneModule(pick));
    }
  }
}
