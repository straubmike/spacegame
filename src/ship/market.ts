import { GALAXY } from "../game/config";
import { hash2, mulberry32 } from "../galaxy/rng";
import { hashStationKey } from "./stationKey";

/** Catalog of trade goods — volume is always 1 CU per unit quantity. */
export interface Commodity {
  id: string;
  name: string;
  /** Nominal credits per CU before station modifiers. */
  basePrice: number;
}

export const COMMODITIES: Commodity[] = [
  { id: "food", name: "Food", basePrice: 12 },
  { id: "textiles", name: "Textiles", basePrice: 16 },
  { id: "minerals", name: "Minerals", basePrice: 22 },
  { id: "machinery", name: "Machinery", basePrice: 28 },
  { id: "luxuries", name: "Luxuries", basePrice: 40 },
  { id: "narcotics", name: "Narcotics", basePrice: 48 },
  { id: "alloys", name: "Alloys", basePrice: 26 },
  { id: "precious_metals", name: "Precious Metals", basePrice: 58 },
  { id: "fuel_cells", name: "Fuel Cells", basePrice: 14 },
];

export function commodityById(id: string): Commodity | undefined {
  return COMMODITIES.find((c) => c.id === id);
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
 * Seeded buy/sell book for a station.
 * Prices vary around base; not every good is both bought and sold.
 */
export function createStationMarket(stationKey: string): StationMarket {
  const rng = mulberry32(
    hash2(GALAXY.seed ^ 0xc2a700, hashStationKey(stationKey)),
  );

  const listings: MarketListing[] = [];
  for (const c of COMMODITIES) {
    // Belt ores: stations usually buy them so scoop farming has a sink.
    const isBeltOre =
      c.id === "minerals" ||
      c.id === "alloys" ||
      c.id === "precious_metals";
    const present = isBeltOre ? rng() < 0.9 : rng() < 0.72;
    if (!present) continue;

    const sells = isBeltOre ? rng() < 0.35 : rng() < 0.7;
    const buys = isBeltOre ? rng() < 0.92 : rng() < 0.65;
    if (!sells && !buys) continue;

    const skew = 0.75 + rng() * 0.55;
    const mid = Math.max(1, Math.round(c.basePrice * skew));
    const spread = Math.max(1, Math.round(mid * (0.12 + rng() * 0.18)));

    const playerBuyPrice = sells ? mid + spread : null;
    const playerSellPrice = buys ? Math.max(1, mid - spread) : null;

    listings.push({
      commodityId: c.id,
      name: c.name,
      playerBuyPrice,
      playerSellPrice,
      stock: sells ? 8 + ((rng() * 40) | 0) : 0,
      demand: buys ? 10 + ((rng() * 35) | 0) : 0,
    });
  }

  // Guarantee at least a couple of lines so empty stations are rare
  if (listings.length < 2) {
    for (const c of COMMODITIES) {
      if (listings.some((l) => l.commodityId === c.id)) continue;
      const mid = c.basePrice;
      listings.push({
        commodityId: c.id,
        name: c.name,
        playerBuyPrice: mid + 3,
        playerSellPrice: Math.max(1, mid - 3),
        stock: 20,
        demand: 20,
      });
      if (listings.length >= 3) break;
    }
  }

  listings.sort((a, b) => a.name.localeCompare(b.name));
  return new StationMarket(listings);
}
