import { GALAXY, MARKET } from "../game/config";
import { Galaxy } from "../galaxy/Galaxy";
import { generateSystemBlueprint } from "../galaxy/generateLocal";
import type {
  HostKind,
  OrbitBodyKind,
  PoiType,
  StarClass,
  SystemBodyRef,
} from "../galaxy/types";

/** Keep in sync with COMMODITIES in market.ts (avoids circular imports). */
const COMMODITY_IDS = [
  "food",
  "textiles",
  "minerals",
  "machinery",
  "luxuries",
  "narcotics",
  "illicit_stimulants",
  "alloys",
  "fuel_cells",
] as const;

/** Per-commodity surplus (+) / shortage (−), roughly in [-1, 1]. */
export type CommodityBias = Record<string, number>;

export interface MarketContext {
  galaxy: Galaxy;
  poiId: number;
  /** Host body id in a star system; null for exotic POIs. */
  bodyId: number | null;
}

/**
 * Local production / consumption by host flavor.
 * Positive = dumps cheap (surplus); negative = wants / pays well (shortage).
 */
const BODY_BIAS: Record<OrbitBodyKind | "star", CommodityBias> = {
  habitable: {
    food: 0.85,
    textiles: 0.55,
    luxuries: 0.25,
    machinery: -0.55,
    minerals: -0.25,
    alloys: -0.35,
    fuel_cells: -0.4,
    narcotics: -0.15,
    illicit_stimulants: -0.1,
  },
  rocky: {
    minerals: 0.8,
    alloys: 0.45,
    food: -0.55,
    textiles: -0.35,
    machinery: -0.25,
    fuel_cells: -0.3,
    luxuries: -0.2,
  },
  molten: {
    minerals: 0.7,
    alloys: 0.75,
    food: -0.65,
    textiles: -0.4,
    fuel_cells: -0.35,
    machinery: -0.2,
    luxuries: -0.25,
  },
  gasGiant: {
    fuel_cells: 0.8,
    narcotics: 0.35,
    illicit_stimulants: 0.3,
    food: -0.5,
    textiles: -0.3,
    machinery: -0.45,
    luxuries: -0.2,
    alloys: -0.15,
  },
  ice: {
    minerals: 0.4,
    fuel_cells: 0.35,
    food: -0.6,
    textiles: -0.45,
    luxuries: -0.35,
    machinery: -0.25,
  },
  asteroidBelt: {
    minerals: 0.9,
    alloys: 0.55,
    food: -0.4,
    fuel_cells: -0.25,
  },
  star: {
    machinery: 0.7,
    fuel_cells: 0.45,
    alloys: 0.25,
    food: -0.5,
    textiles: -0.25,
    luxuries: -0.4,
    narcotics: -0.2,
    illicit_stimulants: -0.15,
  },
};

/** Exotic POI leanings when a market somehow appears there. */
const POI_BIAS: Partial<Record<PoiType, CommodityBias>> = {
  derelict: {
    narcotics: 0.7,
    illicit_stimulants: 0.55,
    luxuries: 0.35,
    machinery: 0.2,
    food: -0.55,
    fuel_cells: -0.4,
  },
  neutronStar: {
    alloys: 0.65,
    machinery: 0.4,
    fuel_cells: -0.35,
    food: -0.45,
  },
  brownDwarf: {
    fuel_cells: 0.75,
    minerals: 0.3,
    food: -0.5,
    textiles: -0.35,
  },
  nebula: {
    luxuries: 0.55,
    narcotics: 0.45,
    illicit_stimulants: 0.4,
    food: -0.4,
    machinery: -0.3,
  },
  roguePlanet: {
    minerals: 0.5,
    food: -0.55,
    fuel_cells: -0.45,
    luxuries: -0.25,
  },
  blackHole: {
    narcotics: 0.4,
    illicit_stimulants: 0.35,
    luxuries: 0.3,
    food: -0.5,
    fuel_cells: -0.55,
  },
};

/** Hotter stars skew industrial; cooler / G skew agrarian mild boost. */
function starClassTint(starClass: StarClass): CommodityBias {
  switch (starClass) {
    case "O":
    case "B":
      return { machinery: 0.15, alloys: 0.1, food: -0.1 };
    case "A":
    case "F":
      return { machinery: 0.08, luxuries: 0.05 };
    case "G":
    case "K":
      return { food: 0.08, textiles: 0.05 };
    case "M":
      return { minerals: 0.08, fuel_cells: -0.05 };
  }
}

function emptyBias(): CommodityBias {
  const out: CommodityBias = {};
  for (const id of COMMODITY_IDS) out[id] = 0;
  return out;
}

function mergeBias(into: CommodityBias, add: CommodityBias, scale = 1): void {
  for (const [id, v] of Object.entries(add)) {
    if (typeof v !== "number" || Number.isNaN(v)) continue;
    into[id] = (into[id] ?? 0) + v * scale;
  }
}

function clampBias(bias: CommodityBias): CommodityBias {
  const out = emptyBias();
  for (const id of COMMODITY_IDS) {
    const v = bias[id] ?? 0;
    out[id] = Math.max(-1, Math.min(1, v));
  }
  return out;
}

function hostKindBias(kind: HostKind): CommodityBias {
  if (kind === "star") return { ...BODY_BIAS.star };
  if (kind in BODY_BIAS) {
    return { ...(BODY_BIAS as Record<string, CommodityBias>)[kind]! };
  }
  return emptyBias();
}

/** Bias for one orbiting / star body (before neighbor blend). */
export function bodyCommodityBias(
  kind: HostKind,
  starClass?: StarClass,
): CommodityBias {
  const bias = emptyBias();
  mergeBias(bias, hostKindBias(kind));
  if (starClass) mergeBias(bias, starClassTint(starClass), 1);
  return clampBias(bias);
}

/** Average bias across station-hosting bodies in a star system. */
export function systemCommodityBias(galaxy: Galaxy, poiId: number): CommodityBias {
  const poi = galaxy.get(poiId);
  if (poi.type !== "starSystem") {
    const exotic = POI_BIAS[poi.type] ?? emptyBias();
    const out = emptyBias();
    mergeBias(out, exotic);
    return clampBias(out);
  }

  const blueprint = generateSystemBlueprint(galaxy, poiId);
  const bias = emptyBias();
  let weight = 0;
  for (const body of blueprint.bodies) {
    if (body.stationCount <= 0) continue;
    const w = body.stationCount;
    mergeBias(bias, bodyCommodityBias(body.kind, blueprint.starClass), w);
    weight += w;
  }
  if (weight <= 0) {
    // Barren / no docks — lean on primary body flavor so neighbors still matter
    const host = blueprint.bodies[0]!;
    return bodyCommodityBias(host.kind, blueprint.starClass);
  }
  for (const id of COMMODITY_IDS) {
    bias[id] = (bias[id] ?? 0) / weight;
  }
  return clampBias(bias);
}

/** Local station bias from the body it orbits. */
export function localCommodityBias(ctx: MarketContext): CommodityBias {
  const poi = ctx.galaxy.get(ctx.poiId);
  if (poi.type !== "starSystem") {
    const out = emptyBias();
    mergeBias(out, POI_BIAS[poi.type] ?? emptyBias());
    return clampBias(out);
  }

  const blueprint = generateSystemBlueprint(ctx.galaxy, ctx.poiId);
  const body: SystemBodyRef =
    blueprint.bodies.find((b) => b.id === ctx.bodyId) ?? blueprint.bodies[0]!;
  return bodyCommodityBias(body.kind, blueprint.starClass);
}

/**
 * Distance-weighted average of neighbor system biases within jump range.
 * Empty when isolated.
 */
export function neighborCommodityBias(ctx: MarketContext): CommodityBias {
  const from = ctx.galaxy.get(ctx.poiId);
  const range = GALAXY.jumpRange * MARKET.neighborRangeFactor;
  const bias = emptyBias();
  let weight = 0;

  for (const poi of ctx.galaxy.pois) {
    if (poi.id === ctx.poiId) continue;
    const d = ctx.galaxy.distance(from, poi);
    if (d > range || d <= 0) continue;
    const w = 1 / (d + MARKET.neighborDistanceFloor);
    mergeBias(bias, systemCommodityBias(ctx.galaxy, poi.id), w);
    weight += w;
  }

  if (weight <= 0) return emptyBias();
  for (const id of COMMODITY_IDS) {
    bias[id] = (bias[id] ?? 0) / weight;
  }
  return clampBias(bias);
}

/**
 * Blend local specialty with neighbor supply/demand.
 * Local dominates so each dock still has a readable identity.
 */
export function effectiveCommodityBias(ctx: MarketContext): {
  local: CommodityBias;
  neighbor: CommodityBias;
  effective: CommodityBias;
} {
  const local = localCommodityBias(ctx);
  const neighbor = neighborCommodityBias(ctx);
  const effective = emptyBias();
  const lw = MARKET.localBiasWeight;
  const nw = MARKET.neighborBiasWeight;
  const sum = lw + nw;
  for (const id of COMMODITY_IDS) {
    effective[id] =
      ((local[id] ?? 0) * lw + (neighbor[id] ?? 0) * nw) / sum;
  }
  return { local, neighbor, effective: clampBias(effective) };
}

export type PriceReason =
  | "local surplus"
  | "local shortage"
  | "local specialty"
  | "neighbor demand"
  | "regional surplus"
  | "quiet market";

/** Short UI gloss for why a line trades where it does. */
export function priceReasonFor(
  commodityId: string,
  local: CommodityBias,
  neighbor: CommodityBias,
): PriceReason {
  const lb = local[commodityId] ?? 0;
  const nb = neighbor[commodityId] ?? 0;

  // Strongest local dump among this station's goods → specialty
  let maxLocal = -Infinity;
  for (const id of COMMODITY_IDS) {
    maxLocal = Math.max(maxLocal, local[id] ?? 0);
  }
  if (lb >= MARKET.specialtyThreshold && lb >= maxLocal - 0.05) {
    return "local specialty";
  }
  if (lb >= MARKET.surplusThreshold) return "local surplus";
  if (lb <= -MARKET.shortageThreshold) return "local shortage";
  if (lb > 0.15 && nb <= -MARKET.neighborSignalThreshold) {
    return "neighbor demand";
  }
  if (nb >= MARKET.neighborSignalThreshold && lb > -0.1) {
    return "regional surplus";
  }
  if (lb <= -0.15) return "local shortage";
  if (lb >= 0.15) return "local surplus";
  return "quiet market";
}
