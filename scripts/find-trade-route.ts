/**
 * One-shot: find a short profitable buy→sell pair within jump range.
 * Run: npx --yes tsx scripts/find-trade-route.ts
 */
import { GALAXY } from "../src/game/config";
import { Galaxy } from "../src/galaxy/Galaxy";
import { generateSystemBlueprint } from "../src/galaxy/generateLocal";
import { stationKey } from "../src/galaxy/pirates";
import { createStationMarket } from "../src/ship/market";

interface StationHit {
  poiId: number;
  poiName: string;
  bodyId: number;
  bodyName: string;
  bodyKind: string;
  stationId: number;
  stationName: string;
  key: string;
  chartX: number;
  chartY: number;
}

function listStations(galaxy: Galaxy): StationHit[] {
  const out: StationHit[] = [];
  for (const poi of galaxy.pois) {
    if (poi.type !== "starSystem") continue;
    const bp = generateSystemBlueprint(galaxy, poi.id);
    for (const body of bp.bodies) {
      for (let i = 0; i < body.stationCount; i += 1) {
        const stationId = i + 1;
        const clean = body.name
          .replace(/ \([^)]+\)$/, "")
          .replace(/ Belt$/, "");
        out.push({
          poiId: poi.id,
          poiName: poi.name,
          bodyId: body.id,
          bodyName: body.name,
          bodyKind: body.kind,
          stationId,
          stationName: `${clean} Station`,
          key: stationKey(poi.id, body.id, stationId),
          chartX: poi.chartX,
          chartY: poi.chartY,
        });
      }
    }
  }
  return out;
}

const galaxy = new Galaxy();
const stations = listStations(galaxy);

type Offer = {
  station: StationHit;
  commodityId: string;
  name: string;
  buy: number | null;
  sell: number | null;
  reason: string;
};

const offers: Offer[] = [];
for (const s of stations) {
  const market = createStationMarket(s.key, {
    galaxy,
    poiId: s.poiId,
    bodyId: s.bodyId,
  });
  for (const l of market.listings) {
    offers.push({
      station: s,
      commodityId: l.commodityId,
      name: l.name,
      buy: l.playerBuyPrice,
      sell: l.playerSellPrice,
      reason: l.priceReason,
    });
  }
}

interface Route {
  commodity: string;
  buyAt: StationHit;
  sellAt: StationHit;
  buyPrice: number;
  sellPrice: number;
  profit: number;
  jumps: number;
  dist: number;
  buyReason: string;
  sellReason: string;
}

const routes: Route[] = [];
for (const a of offers) {
  if (a.buy === null) continue;
  for (const b of offers) {
    if (b.sell === null) continue;
    if (a.commodityId !== b.commodityId) continue;
    if (a.station.key === b.station.key) continue;
    const dist = Math.hypot(
      a.station.chartX - b.station.chartX,
      a.station.chartY - b.station.chartY,
    );
    // Same system or within one jump
    const sameSystem = a.station.poiId === b.station.poiId;
    if (!sameSystem && dist > GALAXY.jumpRange) continue;
    const profit = b.sell - a.buy;
    if (profit < 4) continue;
    routes.push({
      commodity: a.name,
      buyAt: a.station,
      sellAt: b.station,
      buyPrice: a.buy,
      sellPrice: b.sell,
      profit,
      jumps: sameSystem ? 0 : 1,
      dist,
      buyReason: a.reason,
      sellReason: b.reason,
    });
  }
}

routes.sort((x, y) => y.profit - x.profit || x.jumps - y.jumps);

console.log(`Stations: ${stations.length}, offers: ${offers.length}, routes≥4cr: ${routes.length}`);
console.log("\nTop profitable short routes:");
for (const r of routes.slice(0, 12)) {
  const from = `${r.buyAt.poiName} / ${r.buyAt.stationName} (${r.buyAt.bodyKind})`;
  const to = `${r.sellAt.poiName} / ${r.sellAt.stationName} (${r.sellAt.bodyKind})`;
  console.log(
    `  ${r.commodity}: buy ${r.buyPrice} @ ${from} [${r.buyReason}] → sell ${r.sellPrice} @ ${to} [${r.sellReason}]  +${r.profit} cr/CU  (${r.jumps} jump, dist ${r.dist.toFixed(1)})`,
  );
}

// Prefer a 1-jump route from/near start system if possible
const start = routes.find(
  (r) =>
    r.jumps === 1 &&
    (r.buyAt.poiId === GALAXY.startPoiId || r.sellAt.poiId === GALAXY.startPoiId),
);
const pick = start ?? routes.find((r) => r.jumps === 1) ?? routes[0];
if (pick) {
  console.log("\nSAMPLE_ROUTE");
  console.log(
    JSON.stringify(
      {
        commodity: pick.commodity,
        buyPrice: pick.buyPrice,
        sellPrice: pick.sellPrice,
        profitPerCu: pick.profit,
        jumps: pick.jumps,
        buy: {
          system: pick.buyAt.poiName,
          station: pick.buyAt.stationName,
          body: pick.buyAt.bodyName,
          kind: pick.buyAt.bodyKind,
          poiId: pick.buyAt.poiId,
          reason: pick.buyReason,
        },
        sell: {
          system: pick.sellAt.poiName,
          station: pick.sellAt.stationName,
          body: pick.sellAt.bodyName,
          kind: pick.sellAt.bodyKind,
          poiId: pick.sellAt.poiId,
          reason: pick.sellReason,
        },
      },
      null,
      2,
    ),
  );
}
