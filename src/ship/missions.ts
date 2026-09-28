/**
 * Station mission board contracts.
 *
 * Archetypes:
 * - cargo: accept at A → freight loads into hold → deliver at B → paid at B
 *   (cancel at A's Missions board → cargo returned; cancel elsewhere → stolen;
 *    reputation hit on steal later). Faction-tagged **Merchants Guild**.
 * - explore: accept at A → visit/scan exotic POI (not derelicts) → return to A → claim.
 *   Faction-tagged **Cartographers**.
 * - derelictCargo: accept at A (needs Cargo Scoop + ≥1 free CU) → scoop Sensitive
 *   Derelict Cargo at a derelict debris field → return to A → claim
 *   Abandon/cancel: mild rep; cargo is NOT stolen (no steal floor / patrol debt from
 *   the abandon itself). Kept lot can be fenced on the Black Market → Rebels +rep.
 *   Eject: force-abandon, cargo discarded (no fence / no Rebels reveal).
 * - clearance: accept at giver → clear system pirates → return → claim pay
 * - distressAnswer (Fuel Rats faction): travel to a stationless site → help
 *   stranded (rep only) or fight pirate bait (no reward)
 *
 * Passenger fares (design only until berth utility ships):
 * - require passengerCapacity berths; pickup A → deliver B across multi-jump range
 * - payouts higher than cargo of similar distance/risk; berths ≠ CU
 */

import { ECONOMY, GALAXY, QUEST } from "../game/config";
import { listSystemStations, type SystemStationRef } from "../galaxy/pirates";
import { generateSystemBlueprint } from "../galaxy/generateLocal";
import type { Galaxy } from "../galaxy/Galaxy";
import type { PoiRef, PoiType } from "../galaxy/types";
import { hash2, mulberry32 } from "../galaxy/rng";
import { FUEL_RATS_FACTION_ID, MERCHANTS_GUILD_FACTION_ID, CARTOGRAPHERS_FACTION_ID } from "./reputation";
import { LEGAL_COMMODITIES } from "./market";
import { hashStationKey } from "./stationKey";

export type MissionKind =
  | "cargo"
  | "explore"
  | "derelictCargo"
  | "clearance"
  | "distressAnswer";

/** Rolled when the player arrives at a Fuel Rat distress site. */
export type DistressAnswerOutcome = "stranded" | "bait";

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
  /** Faction section on the board (Fuel Rats, Merchants Guild, Cartographers, …). */
  factionId?: string;
  factionLabel?: string;
  /** Cargo freight. */
  commodityId?: string;
  commodityName?: string;
  cu?: number;
  destStationKey?: string;
  destStationName?: string;
  destPoiId?: number;
  destBodyId?: number;
  /** Exploration / clearance / derelict-cargo / distress-answer target POI. */
  targetPoiId?: number;
  targetPoiName?: string;
  targetPoiType?: PoiType;
  /** Distress-answer: body within a star system (null = whole non-system POI). */
  targetBodyId?: number | null;
  targetBodyName?: string;
  /** Clearance: pirate view keys to clear. */
  pirateTargets?: string[];
  /** Distress-answer: seeded outcome once the site is visited. */
  distressOutcome?: DistressAnswerOutcome;
}

export type ActiveMissionStatus = "inProgress" | "readyToClaim";

export interface ActiveMission extends MissionOffer {
  status: ActiveMissionStatus;
  /**
   * Explore: arrived and scanned the target POI.
   * Derelict cargo: scooped the Sensitive Derelict Cargo lot.
   */
  scanned: boolean;
}

/** Display name for Retrieve Derelict Cargo mission freight. */
export const DERELICT_CARGO_NAME = "Sensitive Derelict Cargo";

/**
 * Abandoned derelict-cargo lot kept as ordinary freight — not stolen.
 * Catalog id is illegal (Black Market fence); selling reveals Rebels standing.
 * Do not auto-convert to stolen on cancel.
 */
export const ABANDONED_DERELICT_CARGO_ID = "sensitive_derelict_cargo";

/** Exploration scan targets — derelicts use Retrieve Derelict Cargo instead. */
const EXPLORE_TYPES: PoiType[] = [
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
  if (mission.kind === "derelictCargo") {
    if (mission.scanned || mission.status === "readyToClaim") {
      return `Cargo secured — return to ${mission.originStationName}`;
    }
    return `Scoop cargo at ${mission.targetPoiName ?? "derelict"} (hold F)`;
  }
  if (mission.kind === "distressAnswer") {
    const where =
      mission.targetBodyName ??
      mission.targetPoiName ??
      "distress site";
    return `Answer distress at ${where}`;
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
    if (m.kind === "explore" || m.kind === "derelictCargo") {
      if (m.scanned) {
        ids.add(m.originPoiId);
      } else if (m.targetPoiId !== undefined) {
        ids.add(m.targetPoiId);
      }
    } else if (m.kind === "cargo" && m.destPoiId !== undefined) {
      ids.add(m.destPoiId);
    } else if (
      (m.kind === "clearance" || m.kind === "distressAnswer") &&
      m.targetPoiId !== undefined
    ) {
      ids.add(m.targetPoiId);
    }
  }
  return ids;
}

/** True when this local view matches a distress-answer destination. */
export function distressAnswerMatchesView(
  mission: ActiveMission,
  poiId: number,
  bodyId: number | null,
): boolean {
  if (mission.kind !== "distressAnswer") return false;
  if (mission.targetPoiId !== poiId) return false;
  if (mission.targetBodyId === undefined || mission.targetBodyId === null) {
    return bodyId === null;
  }
  return mission.targetBodyId === bodyId;
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
  // Replaces the old “scan derelict” explore flavor — scoop retrieval instead.
  if (rng() < 0.7) {
    const derelict = makeDerelictCargoOffer(galaxy, station, rng, 0);
    if (derelict) offers.push(derelict);
  }

  const distress = makeDistressAnswerOffer(galaxy, station, rng);
  if (distress) offers.push(distress);

  return offers;
}

/**
 * Exactly one new offer when a station's board is empty (Must-have 8).
 * Same cargo / explore / derelict-cargo generators and station-seeded flavor.
 * `refillIndex` must be unique per station for the session so ids never collide.
 */
export function generateStationReplenishmentOffer(
  galaxy: Galaxy,
  station: SystemStationRef,
  refillIndex: number,
): MissionOffer | null {
  const rng = mulberry32(
    hash2(
      (GALAXY.seed ^ 0xc1e4f) + (refillIndex + 1) * 0x9e3779b9,
      hashStationKey(station.key),
    ),
  );
  // Index band above the initial board's 0–1 slots so offer ids stay unique.
  const index = 1000 + refillIndex;
  const roll = rng();
  if (roll < 0.4) {
    return (
      makeCargoOffer(galaxy, station, rng, index) ??
      makeDerelictCargoOffer(galaxy, station, rng, index) ??
      makeExploreOffer(galaxy, station, rng, index)
    );
  }
  if (roll < 0.7) {
    return (
      makeDerelictCargoOffer(galaxy, station, rng, index) ??
      makeExploreOffer(galaxy, station, rng, index) ??
      makeCargoOffer(galaxy, station, rng, index)
    );
  }
  return (
    makeExploreOffer(galaxy, station, rng, index) ??
    makeDerelictCargoOffer(galaxy, station, rng, index) ??
    makeCargoOffer(galaxy, station, rng, index)
  );
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
    factionId: MERCHANTS_GUILD_FACTION_ID,
    factionLabel: "Merchants Guild",
    commodityId: commodity.id,
    commodityName: commodity.name,
    cu,
    destStationKey: dest.key,
    destStationName: destLabel,
    destPoiId: dest.poiId,
    destBodyId: dest.bodyId,
  };
}

function makeDistressAnswerOffer(
  galaxy: Galaxy,
  origin: SystemStationRef,
  rng: () => number,
): MissionOffer | null {
  const dest = pickDistressAnswerDestination(galaxy, origin.poiId, rng);
  if (!dest) return null;

  const originPoi = galaxy.get(origin.poiId);
  const destPoi = galaxy.get(dest.poiId);
  const dist = galaxy.distance(originPoi, destPoi);
  const jumpsHint = Math.max(1, Math.ceil(dist / GALAXY.jumpRange));
  const where =
    dest.bodyName && dest.bodyName !== destPoi.name
      ? `${dest.bodyName} (${destPoi.name})`
      : destPoi.name;

  return {
    id: `distressAnswer:${origin.key}`,
    kind: "distressAnswer",
    title: "Answer distress signal",
    blurb: `Respond at ${where} (~${jumpsHint} jump${jumpsHint === 1 ? "" : "s"}). Needs Expanded Fuel Tank · rep only.`,
    reward: 0,
    originStationKey: origin.key,
    originStationName: origin.name,
    originPoiId: origin.poiId,
    factionId: FUEL_RATS_FACTION_ID,
    factionLabel: "Fuel Rats",
    targetPoiId: dest.poiId,
    targetPoiName: destPoi.name,
    targetPoiType: destPoi.type,
    targetBodyId: dest.bodyId,
    targetBodyName: dest.bodyName,
    distressOutcome: rng() < QUEST.distressAnswerBaitChance ? "bait" : "stranded",
  };
}

interface DistressDest {
  poiId: number;
  bodyId: number | null;
  bodyName: string;
}

/**
 * Stationless local view outside the origin system — star, orbital, or exotic POI.
 */
function pickDistressAnswerDestination(
  galaxy: Galaxy,
  originPoiId: number,
  rng: () => number,
): DistressDest | null {
  const origin = galaxy.get(originPoiId);
  const candidates: { dest: DistressDest; dist: number }[] = [];

  for (const poi of galaxy.pois) {
    if (poi.id === originPoiId) continue;
    const dist = galaxy.distance(origin, poi);
    if (dist > GALAXY.jumpRange * QUEST.distressAnswerMaxJumpRanges) continue;

    if (poi.type !== "starSystem") {
      candidates.push({
        dest: {
          poiId: poi.id,
          bodyId: null,
          bodyName: poi.name,
        },
        dist,
      });
      continue;
    }

    let blueprint;
    try {
      blueprint = generateSystemBlueprint(galaxy, poi.id);
    } catch {
      continue;
    }
    for (const body of blueprint.bodies) {
      if (body.stationCount > 0) continue;
      candidates.push({
        dest: {
          poiId: poi.id,
          bodyId: body.id,
          bodyName: body.name,
        },
        dist,
      });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.dist - b.dist);
  const pool = candidates.slice(0, Math.min(14, candidates.length));
  return pool[(rng() * pool.length) | 0]!.dest;
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
    factionId: CARTOGRAPHERS_FACTION_ID,
    factionLabel: "Cartographers",
    targetPoiId: target.id,
    targetPoiName: target.name,
    targetPoiType: target.type,
  };
}

/**
 * Retrieve Derelict Cargo — scoop mission freight at a derelict debris field.
 * Replaces the old “scan derelict” explore offer.
 */
function makeDerelictCargoOffer(
  galaxy: Galaxy,
  origin: SystemStationRef,
  rng: () => number,
  index: number,
): MissionOffer | null {
  const target = pickDerelictTarget(galaxy, origin.poiId, rng);
  if (!target) return null;

  const originPoi = galaxy.get(origin.poiId);
  const dist = galaxy.distance(originPoi, target);
  const jumpsHint = Math.max(1, Math.ceil(dist / GALAXY.jumpRange));
  const cu = QUEST.derelictCargoCu;
  const reward =
    QUEST.derelictCargoBaseReward +
    Math.round(dist * QUEST.derelictCargoPerDistance);

  return {
    id: `derelictCargo:${origin.key}:${index}:${target.id}`,
    kind: "derelictCargo",
    title: "Retrieve Derelict Cargo",
    blurb: `Scoop ${cu} CU at ${target.name} (~${jumpsHint} jump${jumpsHint === 1 ? "" : "s"}). Needs Cargo Scoop.`,
    reward,
    originStationKey: origin.key,
    originStationName: origin.name,
    originPoiId: origin.poiId,
    commodityId: ABANDONED_DERELICT_CARGO_ID,
    commodityName: DERELICT_CARGO_NAME,
    cu,
    targetPoiId: target.id,
    targetPoiName: target.name,
    targetPoiType: "derelict",
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
    // Fallback: any exotic in the chart (still no derelicts).
    const any = galaxy.pois.filter((p) => EXPLORE_TYPES.includes(p.type));
    if (any.length === 0) return null;
    return any[(rng() * any.length) | 0]!;
  }

  const pool = ranked.slice(0, Math.min(8, ranked.length));
  return pool[(rng() * pool.length) | 0]!.p;
}

function pickDerelictTarget(
  galaxy: Galaxy,
  originPoiId: number,
  rng: () => number,
): PoiRef | null {
  const origin = galaxy.get(originPoiId);
  const ranked = galaxy.pois
    .filter(
      (p) =>
        p.type === "derelict" &&
        galaxy.distance(origin, p) <=
          GALAXY.jumpRange * QUEST.derelictCargoMaxJumpRanges,
    )
    .map((p) => ({ p, dist: galaxy.distance(origin, p) }))
    .sort((a, b) => a.dist - b.dist);

  if (ranked.length === 0) {
    const any = galaxy.pois.filter((p) => p.type === "derelict");
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
