/**
 * Station mission board contracts.
 *
 * Archetypes:
 * - cargo: accept at A → freight loads into hold → deliver at B → paid at B
 *   (cancel at A's Missions board → cargo returned; cancel elsewhere → stolen;
 *    reputation hit on steal later)
 * - explore: accept at A → visit/scan target POI → return to A → claim pay
 * - clearance: accept at giver → clear system pirates → return → claim pay
 *
 * Passenger fares (design only until berth utility ships):
 * - require passengerCapacity berths; pickup A → deliver B across multi-jump range
 * - payouts higher than cargo of similar distance/risk; berths ≠ CU
 */

import { ECONOMY, GALAXY, QUEST } from "../game/config";
import { listSystemStations, type SystemStationRef } from "../galaxy/pirates";
import type { Galaxy } from "../galaxy/Galaxy";
import type { PoiRef, PoiType } from "../galaxy/types";
import { hash2, mulberry32 } from "../galaxy/rng";
import { LEGAL_COMMODITIES } from "./market";
import { hashStationKey } from "./stationKey";

export type MissionKind = "cargo" | "explore" | "clearance";

export interface MissionOffer {
  id: string;
  kind: MissionKind;
  title: string;
  blurb: string;
  reward: number;
  /** Contracting station key (offer origin). */
  originStationKey: string;
  originStationName: string;
  originPoiId: number;
  /** Cargo freight. */
  commodityId?: string;
  commodityName?: string;
  cu?: number;
  destStationKey?: string;
  destStationName?: string;
  destPoiId?: number;
  destBodyId?: number;
  /** Exploration / clearance target POI (chart highlight). */
  targetPoiId?: number;
  targetPoiName?: string;
  targetPoiType?: PoiType;
  /** Clearance: pirate view keys to clear. */
  pirateTargets?: string[];
}

export type ActiveMissionStatus = "inProgress" | "readyToClaim";

export interface ActiveMission extends MissionOffer {
  status: ActiveMissionStatus;
  /** Explore: arrived and scanned the target POI. */
  scanned: boolean;
}

const EXPLORE_TYPES: PoiType[] = [
  "derelict",
  "neutronStar",
  "nebula",
  "brownDwarf",
  "roguePlanet",
  "blackHole",
];

/** Stable cargo lot id so mission freight is distinct from market goods. */
export function missionCargoId(missionId: string): string {
  return `mission:${missionId}`;
}

export function isMissionCargoId(id: string): boolean {
  return id.startsWith("mission:");
}

/**
 * Cancelled haul freight — kept in hold as stolen (reputation hook later).
 * Sellable as the base commodity on the market for now.
 */
export function stolenCargoId(commodityId: string): string {
  return `stolen:${commodityId}`;
}

export function isStolenCargoId(id: string): boolean {
  return id.startsWith("stolen:");
}

/** Base market commodity id for a stolen lot, or null if not stolen. */
export function commodityIdFromStolen(id: string): string | null {
  if (!isStolenCargoId(id)) return null;
  return id.slice("stolen:".length);
}

/** Short status line for active contracts (board + ship L menu). */
export function missionStatusLine(mission: ActiveMission): string {
  if (mission.kind === "cargo") {
    return `Deliver to ${mission.destStationName ?? "destination"}`;
  }
  if (mission.kind === "clearance") {
    if (mission.status === "readyToClaim") {
      return `Clearance complete — claim at ${mission.originStationName}`;
    }
    const left = mission.pirateTargets?.length ?? 0;
    return left <= 0
      ? `Return to ${mission.originStationName} to claim`
      : `${left} pirate${left === 1 ? "" : "s"} left in ${mission.targetPoiName ?? "system"}`;
  }
  if (mission.scanned) {
    return `Scan complete — return to ${mission.originStationName}`;
  }
  return `Travel to ${mission.targetPoiName ?? "target"} and scan`;
}

/**
 * Chart POI ids that are active quest destinations (or return-to-claim origins).
 */
export function questChartPoiIds(missions: readonly ActiveMission[]): Set<number> {
  const ids = new Set<number>();
  for (const m of missions) {
    if (m.kind === "explore") {
      if (m.scanned) {
        ids.add(m.originPoiId);
      } else if (m.targetPoiId !== undefined) {
        ids.add(m.targetPoiId);
      }
    } else if (m.kind === "cargo" && m.destPoiId !== undefined) {
      ids.add(m.destPoiId);
    } else if (m.kind === "clearance" && m.targetPoiId !== undefined) {
      ids.add(m.targetPoiId);
    }
  }
  return ids;
}

/**
 * Seeded board for one station visit. Regenerates the same offers for a given
 * station key until the session ends (offers are not consumed from the seed —
 * Game tracks accepted ids separately).
 */
export function generateStationMissions(
  galaxy: Galaxy,
  station: SystemStationRef,
): MissionOffer[] {
  const rng = mulberry32(
    hash2(GALAXY.seed ^ 0xb0a7d, hashStationKey(station.key)),
  );

  const offers: MissionOffer[] = [];
  const cargoCount = 1 + ((rng() * 2) | 0); // 1–2
  const exploreCount = 1 + ((rng() * 2) | 0); // 1–2

  for (let i = 0; i < cargoCount; i += 1) {
    const cargo = makeCargoOffer(galaxy, station, rng, i);
    if (cargo) offers.push(cargo);
  }
  for (let i = 0; i < exploreCount; i += 1) {
    const explore = makeExploreOffer(galaxy, station, rng, i);
    if (explore) offers.push(explore);
  }

  return offers;
}

/** System pirate-clearance contract at the quest-giver station. */
export function makeClearanceOffer(
  station: SystemStationRef,
  pirateTargets: string[],
  poiName: string,
): MissionOffer | null {
  if (pirateTargets.length === 0) return null;
  const n = pirateTargets.length;
  return {
    id: `clearance:${station.poiId}`,
    kind: "clearance",
    title: `Clear system pirates`,
    blurb: `Eliminate or drive off ${n} pirate${n === 1 ? "" : "s"} in ${poiName}, then return here.`,
    reward: ECONOMY.pirateQuestReward,
    originStationKey: station.key,
    originStationName: station.name,
    originPoiId: station.poiId,
    targetPoiId: station.poiId,
    targetPoiName: poiName,
    pirateTargets: [...pirateTargets],
  };
}

function makeCargoOffer(
  galaxy: Galaxy,
  origin: SystemStationRef,
  rng: () => number,
  index: number,
): MissionOffer | null {
  const dest = pickCargoDestination(galaxy, origin, rng);
  if (!dest) return null;

  // Legal freight only — illegals are Black Market (Must-have 9), not board hauls.
  const commodity = LEGAL_COMMODITIES[(rng() * LEGAL_COMMODITIES.length) | 0]!;
  const cu = QUEST.cargoCuMin + ((rng() * (QUEST.cargoCuMax - QUEST.cargoCuMin + 1)) | 0);
  const originPoi = galaxy.get(origin.poiId);
  const destPoi = galaxy.get(dest.poiId);
  const dist = galaxy.distance(originPoi, destPoi);
  const jumpsHint = Math.max(1, Math.ceil(dist / GALAXY.jumpRange));
  const reward =
    QUEST.cargoBaseReward +
    cu * QUEST.cargoPerCu +
    Math.round(dist * QUEST.cargoPerDistance);

  const sameSystem = dest.poiId === origin.poiId;
  const destLabel = sameSystem
    ? dest.name
    : `${dest.name} (${destPoi.name})`;

  return {
    id: `cargo:${origin.key}:${index}`,
    kind: "cargo",
    title: `Haul ${cu} CU ${commodity.name}`,
    blurb: sameSystem
      ? `Deliver to ${dest.name} in this system.`
      : `Deliver to ${dest.name} in ${destPoi.name} (~${jumpsHint} jump${jumpsHint === 1 ? "" : "s"}).`,
    reward,
    originStationKey: origin.key,
    originStationName: origin.name,
    originPoiId: origin.poiId,
    commodityId: commodity.id,
    commodityName: commodity.name,
    cu,
    destStationKey: dest.key,
    destStationName: destLabel,
    destPoiId: dest.poiId,
    destBodyId: dest.bodyId,
  };
}

function makeExploreOffer(
  galaxy: Galaxy,
  origin: SystemStationRef,
  rng: () => number,
  index: number,
): MissionOffer | null {
  const target = pickExploreTarget(galaxy, origin.poiId, rng);
  if (!target) return null;

  const originPoi = galaxy.get(origin.poiId);
  const dist = galaxy.distance(originPoi, target);
  const jumpsHint = Math.max(1, Math.ceil(dist / GALAXY.jumpRange));
  const reward =
    QUEST.exploreBaseReward + Math.round(dist * QUEST.explorePerDistance);

  return {
    id: `explore:${origin.key}:${index}:${target.id}`,
    kind: "explore",
    title: `Scan ${formatPoiType(target.type)}`,
    blurb: `Survey ${target.name} (~${jumpsHint} jump${jumpsHint === 1 ? "" : "s"}), then return here.`,
    reward,
    originStationKey: origin.key,
    originStationName: origin.name,
    originPoiId: origin.poiId,
    targetPoiId: target.id,
    targetPoiName: target.name,
    targetPoiType: target.type,
  };
}

function pickCargoDestination(
  galaxy: Galaxy,
  origin: SystemStationRef,
  rng: () => number,
): SystemStationRef | null {
  const originPoi = galaxy.get(origin.poiId);
  const candidates: { station: SystemStationRef; dist: number }[] = [];

  // Prefer other stations in-system, then nearby systems within ~2 jump ranges.
  const local = listSystemStations(galaxy, origin.poiId).filter(
    (s) => s.key !== origin.key,
  );
  for (const s of local) {
    candidates.push({ station: s, dist: 0 });
  }

  for (const poi of galaxy.pois) {
    if (poi.type !== "starSystem" || poi.id === origin.poiId) continue;
    const dist = galaxy.distance(originPoi, poi);
    if (dist > GALAXY.jumpRange * QUEST.cargoMaxJumpRanges) continue;
    for (const s of listSystemStations(galaxy, poi.id)) {
      candidates.push({ station: s, dist });
    }
  }

  if (candidates.length === 0) return null;
  // Soft preference for nearer destinations.
  candidates.sort((a, b) => a.dist - b.dist);
  const pool = candidates.slice(0, Math.min(12, candidates.length));
  return pool[(rng() * pool.length) | 0]!.station;
}

function pickExploreTarget(
  galaxy: Galaxy,
  originPoiId: number,
  rng: () => number,
): PoiRef | null {
  const origin = galaxy.get(originPoiId);
  const ranked = galaxy.pois
    .filter(
      (p) =>
        p.id !== originPoiId &&
        EXPLORE_TYPES.includes(p.type) &&
        galaxy.distance(origin, p) <= GALAXY.jumpRange * QUEST.exploreMaxJumpRanges,
    )
    .map((p) => ({ p, dist: galaxy.distance(origin, p) }))
    .sort((a, b) => a.dist - b.dist);

  if (ranked.length === 0) {
    // Fallback: any exotic in the chart.
    const any = galaxy.pois.filter((p) => EXPLORE_TYPES.includes(p.type));
    if (any.length === 0) return null;
    return any[(rng() * any.length) | 0]!;
  }

  const pool = ranked.slice(0, Math.min(8, ranked.length));
  return pool[(rng() * pool.length) | 0]!.p;
}

function formatPoiType(t: PoiType): string {
  switch (t) {
    case "derelict":
      return "derelict";
    case "neutronStar":
      return "neutron star";
    case "nebula":
      return "nebula";
    case "brownDwarf":
      return "brown dwarf";
    case "roguePlanet":
      return "rogue planet";
    case "blackHole":
      return "black hole";
    default:
      return "anomaly";
  }
}

/** Current station ref from local dock context, or null outside star systems. */
export function stationRefFromLocal(
  galaxy: Galaxy,
  poiId: number,
  bodyId: number | null,
  stationId: number,
  stationName: string,
): SystemStationRef | null {
  if (bodyId === null) return null;
  const poi = galaxy.get(poiId);
  if (poi.type !== "starSystem") return null;
  const key = `${poiId}:${bodyId}:${stationId}`;
  return {
    poiId,
    bodyId,
    stationId,
    name: stationName,
    key,
  };
}
