import { MARKET, GALAXY } from "../game/config";
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
 * Seeded buy/sell book for a station.
 * Prices follow local POI flavor blended with neighbor supply/demand.
 */
export function createStationMarket(
  stationKey: string,
  ctx?: MarketContext,
): StationMarket {
  const rng = mulberry32(
    hash2(GALAXY.seed ^ 0xc2a700, hashStationKey(stationKey)),
  );

  const biases = ctx
    ? effectiveCommodityBias(ctx)
    : {
        local: Object.fromEntries(COMMODITIES.map((c) => [c.id, 0])),
        neighbor: Object.fromEntries(COMMODITIES.map((c) => [c.id, 0])),
        effective: Object.fromEntries(COMMODITIES.map((c) => [c.id, 0])),
      };

  const listings: MarketListing[] = [];

  for (const c of COMMODITIES) {
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
        priceReason: "quiet market",
      });
      if (listings.length >= 3) break;
    }
  }

  listings.sort((a, b) => a.name.localeCompare(b.name));
  return new StationMarket(listings);
}
