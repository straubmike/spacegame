import { BLACK_MARKET, MARKET, GALAXY, STATION_MENU_VARIETY } from "../game/config";
import { hash2, mulberry32 } from "../galaxy/rng";
import {
  effectiveCommodityBias,
  priceReasonFor,
  type MarketContext,
  type PriceReason,
} from "./economy";
import { hashStationKey } from "./stationKey";

/** Catalog of trade goods — volume is always 1 CU per unit quantity. */
export interface Commodity {
  id: string;
  name: string;
  /** Nominal credits per CU before station modifiers. */
  basePrice: number;
  /**
   * When true, only available on Black Market (Must-have 9).
   * Shared flag for patrol illegal-cargo scan (Must-have 11).
   */
  illegal?: boolean;
}

export const COMMODITIES: Commodity[] = [
  { id: "food", name: "Food", basePrice: 12 },
  { id: "textiles", name: "Textiles", basePrice: 16 },
  { id: "minerals", name: "Minerals", basePrice: 22 },
  { id: "machinery", name: "Machinery", basePrice: 28 },
  { id: "luxuries", name: "Luxuries", basePrice: 40 },
  { id: "narcotics", name: "Narcotics", basePrice: 48, illegal: true },
  { id: "illicit_stimulants", name: "Illicit Stimulants", basePrice: 52, illegal: true },
  { id: "alloys", name: "Alloys", basePrice: 26 },
  { id: "precious_metals", name: "Precious Metals", basePrice: 58 },
  { id: "organs", name: "Organs", basePrice: 62, illegal: true },
  /**
   * Abandoned Retrieve Derelict Cargo lot — not stolen; Black Market fence only.
   * Sell-only (never buyable); row appears only when the player is carrying it.
   * Selling reveals / boosts Rebels faction standing (future Rebels path kickoff).
   */
  {
    id: "sensitive_derelict_cargo",
    name: "Sensitive Derelict Cargo",
    basePrice: 70,
    illegal: true,
  },
];

/** Legal goods shown on the main Market menu. */
export const LEGAL_COMMODITIES: Commodity[] = COMMODITIES.filter((c) => !c.illegal);

/** Illegal goods — Black Market only. */
export const ILLEGAL_COMMODITIES: Commodity[] = COMMODITIES.filter((c) => c.illegal);

export function commodityById(id: string): Commodity | undefined {
  return COMMODITIES.find((c) => c.id === id);
}

/** Strip `stolen:` prefix so scan / BM logic sees the base catalog id. */
export function baseCommodityId(id: string): string {
  return id.startsWith("stolen:") ? id.slice("stolen:".length) : id;
}

/** True for catalog illegals and their stolen lots (`stolen:narcotics`, …). */
export function isIllegalCommodityId(id: string): boolean {
  return commodityById(baseCommodityId(id))?.illegal === true;
}

/**
 * One station's book for a commodity.
 * Player buys at `playerBuyPrice` (station sells).
 * Player sells at `playerSellPrice` (station buys).
 */
export interface MarketListing {
  commodityId: string;
  name: string;
  /** Credits/CU to purchase from station; null if not sold here. */
  playerBuyPrice: number | null;
  /** Credits/CU station pays; null if not buying here. */
  playerSellPrice: number | null;
  /** CU the station still has for sale. */
  stock: number;
  /** CU the station will still purchase. */
  demand: number;
  /** Light gloss for why this line prices the way it does. */
  priceReason: PriceReason;
}

/** Mutable market state for the current dock visit. */
export class StationMarket {
  readonly listings: MarketListing[];

  constructor(listings: MarketListing[]) {
    this.listings = listings.map((l) => ({ ...l }));
  }

  listing(commodityId: string): MarketListing | undefined {
    return this.listings.find((l) => l.commodityId === commodityId);
  }
}

/**
 * Always-on service menu (Missions / Launch are fixed in the dock UI, not rolled).
 * Repair & refuel run automatically on dock (complimentary). Optional menus below
 * are the rarity roll.
 */
export type AlwaysStationMenu = "missions";

/** Service menus that may or may not appear at a station. */
export type OptionalStationMenu =
  | "bay"
  | "hangar"
  | "market"
  | "blackMarket";

export type StationServiceMenu = AlwaysStationMenu | OptionalStationMenu;

/** Rollable specialty services — more of these = rarer. */
export const OPTIONAL_STATION_MENUS: readonly OptionalStationMenu[] = [
  "bay",
  "hangar",
  "market",
  "blackMarket",
];

export type StationMenuSet = ReadonlySet<StationServiceMenu>;

const menuCache = new Map<string, StationMenuSet>();

/**
 * Seed-stable service menus for a station (Must-have 10).
 * Always includes Missions. Optional bay/hangar/market/blackMarket are a
 * weighted subset (0..all); full optional set is rarest.
 */
export function rollStationMenus(stationKey: string): StationMenuSet {
  const cached = menuCache.get(stationKey);
  if (cached) return cached;

  const rng = mulberry32(
    hash2(GALAXY.seed ^ 0x10e7, hashStationKey(stationKey)),
  );

  const weights = STATION_MENU_VARIETY.countWeights;
  const maxCount = OPTIONAL_STATION_MENUS.length;
  let total = 0;
  for (let k = 0; k <= maxCount; k += 1) {
    total += weights[k] ?? 0;
  }

  let count = 0;
  if (total > 0) {
    let pick = rng() * total;
    for (let k = 0; k <= maxCount; k += 1) {
      pick -= weights[k] ?? 0;
      if (pick < 0) {
        count = k;
        break;
      }
    }
    if (pick >= 0) count = maxCount;
  }
  count = Math.max(0, Math.min(maxCount, count));

  const pool = OPTIONAL_STATION_MENUS.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }

  const result = new Set<StationServiceMenu>([
    "missions",
    ...pool.slice(0, count),
  ]);
  // TEMP(steal-haul): the station in the starting sector always has a black
  // market, even when the seed did not roll one. Strip before merge.
  if (isTempStealHaulStation(stationKey)) {
    result.add("blackMarket");
  }
  menuCache.set(stationKey, result);
  return result;
}

/**
 * TEMP(steal-haul): station in the local view the run starts in (start POI, star).
 * Strip before merge.
 */
export function isTempStealHaulStation(stationKey: string): boolean {
  return stationKey.startsWith(`${GALAXY.startPoiId}:0:`);
}

export function stationHasMenu(
  stationKey: string,
  menu: StationServiceMenu,
): boolean {
  if (menu === "missions") return true;
  return rollStationMenus(stationKey).has(menu);
}

/** Whether this station offers a Black Market dock menu (Must-have 10 variety). */
export function stationOffersBlackMarket(stationKey: string): boolean {
  return stationHasMenu(stationKey, "blackMarket");
}

/**
 * Seeded buy/sell book for a station (legal goods only).
 * Prices follow local POI flavor blended with neighbor supply/demand.
 */
export function createStationMarket(
  stationKey: string,
  ctx?: MarketContext,
): StationMarket {
  const rng = mulberry32(
    hash2(GALAXY.seed ^ 0xc2a700, hashStationKey(stationKey)),
  );

  const catalog = LEGAL_COMMODITIES;
  const biases = ctx
    ? effectiveCommodityBias(ctx)
    : {
        local: Object.fromEntries(catalog.map((c) => [c.id, 0])),
        neighbor: Object.fromEntries(catalog.map((c) => [c.id, 0])),
        effective: Object.fromEntries(catalog.map((c) => [c.id, 0])),
      };

  const listings: MarketListing[] = [];

  for (const c of catalog) {
    const bias = biases.effective[c.id] ?? 0;
    const local = biases.local[c.id] ?? 0;
    const reason = priceReasonFor(c.id, biases.local, biases.neighbor);

    // Strong signals are one-way so surplus docks dump and shortage docks buy —
    // that is what makes a readable buy-here / sell-there route.
    const surplus = bias >= MARKET.surplusThreshold;
    const shortage = bias <= -MARKET.shortageThreshold;

    let sells = false;
    let buys = false;
    if (surplus || local >= 0.2) {
      sells = true;
      buys = false;
    } else if (shortage || local <= -0.2) {
      buys = true;
      sells = false;
    } else {
      // Belt ores: prefer a buy-side sink so scoop farming has somewhere to sell.
      const isBeltOre =
        c.id === "minerals" ||
        c.id === "alloys" ||
        c.id === "precious_metals";
      if (isBeltOre) {
        buys = true;
        sells = rng() < 0.35;
      } else {
        sells = rng() < 0.55;
        buys = rng() < 0.5;
        if (!sells && !buys) {
          if (rng() < 0.5) sells = true;
          else buys = true;
        }
      }
    }

    if (!sells && !buys) continue;

    const noise = 1 + (rng() * 2 - 1) * MARKET.noiseAmplitude;
    const mid = Math.max(
      1,
      Math.round(c.basePrice * (1 - bias * MARKET.biasStrength) * noise),
    );

    let playerBuyPrice: number | null = null;
    let playerSellPrice: number | null = null;

    if (sells && buys) {
      let spreadFrac = MARKET.spreadFraction + MARKET.twoWaySpreadBump;
      spreadFrac += Math.min(0.08, Math.abs(bias) * 0.06);
      const spread = Math.max(1, Math.round(mid * spreadFrac));
      playerBuyPrice = mid + spread;
      playerSellPrice = Math.max(1, mid - spread);
    } else if (sells) {
      // Dump dock: player buys near the depressed mid (cheap stock).
      playerBuyPrice = Math.max(1, mid);
    } else {
      // Import dock: station pays near the elevated mid.
      playerSellPrice = Math.max(1, mid);
    }

    const stock = sells
      ? Math.max(
          6,
          Math.round(
            MARKET.baseStock +
              Math.max(0, bias) * MARKET.stockBiasScale +
              rng() * 12,
          ),
        )
      : 0;
    const demand = buys
      ? Math.max(
          6,
          Math.round(
            MARKET.baseDemand +
              Math.max(0, -bias) * MARKET.demandBiasScale +
              rng() * 12,
          ),
        )
      : 0;

    listings.push({
      commodityId: c.id,
      name: c.name,
      playerBuyPrice,
      playerSellPrice,
      stock,
      demand,
      priceReason: reason,
    });
  }

  // Guarantee at least a couple of lines so empty stations are rare
  if (listings.length < 2) {
    for (const c of catalog) {
      if (listings.some((l) => l.commodityId === c.id)) continue;
      const mid = c.basePrice;
      listings.push({
        commodityId: c.id,
        name: c.name,
        playerBuyPrice: mid + 3,
        playerSellPrice: Math.max(1, mid - 3),
        stock: 20,
        demand: 20,
        priceReason: "quiet market",
      });
      if (listings.length >= 3) break;
    }
  }

  listings.sort((a, b) => a.name.localeCompare(b.name));
  return new StationMarket(listings);
}

/**
 * Seeded black-market book — illegal commodities only, premium prices.
 *
 * Strong surplus / shortage → one-way books (cheap buy / strong sell) so
 * route smuggling beats legal haul margins. Quiet docks stay two-way with
 * spread so same-station flips still lose.
 *
 * Sensitive Derelict Cargo is sell-only / not a surplus–shortage route good.
 */
export function createBlackMarket(
  stationKey: string,
  ctx?: MarketContext,
): StationMarket {
  const rng = mulberry32(
    hash2(GALAXY.seed ^ 0xb1ac07, hashStationKey(stationKey)),
  );

  const biases = ctx
    ? effectiveCommodityBias(ctx)
    : {
        local: Object.fromEntries(ILLEGAL_COMMODITIES.map((c) => [c.id, 0])),
        neighbor: Object.fromEntries(ILLEGAL_COMMODITIES.map((c) => [c.id, 0])),
        effective: Object.fromEntries(ILLEGAL_COMMODITIES.map((c) => [c.id, 0])),
      };

  const listings: MarketListing[] = [];

  for (const c of ILLEGAL_COMMODITIES) {
    // Sensitive Derelict Cargo: sell-only fence row — no buy, no market gloss.
    // Visibility is gated in MarketMenu (only when the player holds it).
    if (c.id === "sensitive_derelict_cargo") {
      const mid = Math.max(
        1,
        Math.round(c.basePrice * (1 + BLACK_MARKET.pricePremium)),
      );
      const spread = Math.max(2, Math.round(mid * BLACK_MARKET.spreadFraction));
      listings.push({
        commodityId: c.id,
        name: c.name,
        playerBuyPrice: null,
        playerSellPrice: Math.max(
          1,
          mid - Math.max(1, Math.round(spread * BLACK_MARKET.twoWaySellSpreadFactor)),
        ),
        stock: 0,
        demand: Math.max(8, BLACK_MARKET.baseDemand),
        priceReason: "quiet market",
      });
      continue;
    }

    const bias = biases.effective[c.id] ?? 0;
    const local = biases.local[c.id] ?? 0;
    const reason = priceReasonFor(c.id, biases.local, biases.neighbor);
    const noise = 1 + (rng() * 2 - 1) * BLACK_MARKET.noiseAmplitude;
    const mid = Math.max(
      1,
      Math.round(
        c.basePrice *
          (1 + BLACK_MARKET.pricePremium) *
          (1 - bias * BLACK_MARKET.biasStrength) *
          noise,
      ),
    );

    // Mirror legal one-way signals so surplus dumps and shortage sinks read.
    const surplus = bias >= BLACK_MARKET.surplusThreshold;
    const shortage = bias <= -BLACK_MARKET.shortageThreshold;

    let sells = false;
    let buys = false;
    if (surplus || local >= 0.2) {
      sells = true;
      buys = false;
    } else if (shortage || local <= -0.2) {
      buys = true;
      sells = false;
    } else {
      // Quiet BM: always two-way so the line stays present; spread eats flips.
      sells = true;
      buys = true;
    }

    let playerBuyPrice: number | null = null;
    let playerSellPrice: number | null = null;

    if (sells && buys) {
      const spread = Math.max(2, Math.round(mid * BLACK_MARKET.spreadFraction));
      playerBuyPrice = mid + spread;
      playerSellPrice = Math.max(
        1,
        mid - Math.max(1, Math.round(spread * BLACK_MARKET.twoWaySellSpreadFactor)),
      );
    } else if (sells) {
      // Surplus dump: player buys near the depressed mid.
      playerBuyPrice = Math.max(1, mid);
    } else {
      // Shortage sink: station pays near the elevated mid.
      playerSellPrice = Math.max(1, mid);
    }

    const stock = sells
      ? Math.max(
          8,
          Math.round(
            BLACK_MARKET.baseStock +
              Math.max(0, bias) * BLACK_MARKET.stockBiasScale +
              rng() * 10,
          ),
        )
      : 0;
    const demand = buys
      ? Math.max(
          8,
          Math.round(
            BLACK_MARKET.baseDemand +
              Math.max(0, -bias) * BLACK_MARKET.demandBiasScale +
              rng() * 10,
          ),
        )
      : 0;

    listings.push({
      commodityId: c.id,
      name: c.name,
      playerBuyPrice,
      playerSellPrice,
      stock,
      demand,
      priceReason: reason,
    });
  }

  listings.sort((a, b) => a.name.localeCompare(b.name));
  return new StationMarket(listings);
}
