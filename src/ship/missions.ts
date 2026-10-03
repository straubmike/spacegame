/**
 * Station mission board contracts.
 *
 * Archetypes:
 * - cargo: accept at A → freight loads into hold → deliver at B → paid at B
 *   (cancel at A's Missions board → cargo returned; cancel elsewhere → stolen;
 *    reputation hit on steal later). Faction-tagged **Merchants Guild**.
 * - passenger: accept at A (free berths ≥ party) → occupy berths → deliver at B → paid at B
 *   Long-range preferred; ~10% pirate intercept on pre-destination jumps (Game).
 *   Abandon while passengers are still aboard: mild origin hit plus a severe
 *   Imperial kidnapping drop (not berth-clear with only the mild cancel).
 * - explore: accept at A (needs Survey Scanner) → jump to exotic POI
 *   (non-derelict) → hold F to scan → return to A → claim.
 *   Faction-tagged **Cartographers**.
 * - derelictCargo: accept at A (needs Cargo Scoop + ≥1 free CU) → scoop Sensitive
 *   Derelict Cargo at a derelict debris field → return to A → claim
 *   Abandon/cancel: mild rep; cargo is NOT stolen (no steal floor / patrol debt from
 *   the abandon itself). Kept lot can be fenced on the Black Market → Rebels +rep.
 *   Eject: force-abandon, cargo discarded (no fence / no Rebels reveal).
 * - clearance: accept at giver → clear system pirates → return → claim pay
 * - distressAnswer (Fuel Rats faction): travel to a stationless site → help
 *   stranded (rep only) or fight pirate bait (no reward)
 * - bmDestroyPatrol (Black Market, after Rebels revealed): destroy the patrol
 *   at a destination station, then claim back at the giver
 * - bmKidnap (Black Market, after Rebels revealed): divert an active fare and
 *   turn those passengers in at a black market
 * Secret rebel mission line is not implemented.
 *
 * Offer rules:
 * - One station: cargo slots never share commodity + destination; explore slots
 *   never share a target POI; at most one derelict scoop.
 * - Across stations: haul, passenger, and POI-scan duplicates are allowed.
 *   Derelict scoops may list the same wreck until one is accepted (Game hides
 *   it elsewhere until abandon or complete). Each distress site is assigned
 *   to at most one station so bait vs stranded cannot conflict.
 * - Refills may repeat completed work. Finished scans and hauls are not consumed.
 */

import { ECONOMY, GALAXY, QUEST } from "../game/config";
import { listSystemStations, type SystemStationRef } from "../galaxy/pirates";
import { generateSystemBlueprint } from "../galaxy/generateLocal";
import type { Galaxy } from "../galaxy/Galaxy";
import type { PoiRef, PoiType } from "../galaxy/types";
import { hash2, mulberry32 } from "../galaxy/rng";
import { patrolWouldSpawn } from "../galaxy/patrolSpawn";
import { FUEL_RATS_FACTION_ID, MERCHANTS_GUILD_FACTION_ID, CARTOGRAPHERS_FACTION_ID, REBELS_FACTION_ID } from "./reputation";
import { LEGAL_COMMODITIES } from "./market";
import { hashStationKey } from "./stationKey";

export type MissionKind =
  | "cargo"
  | "passenger"
  | "explore"
  | "derelictCargo"
  | "clearance"
  | "distressAnswer"
  | "bmDestroyPatrol"
  | "bmKidnap";

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
  /** Passenger fare party size (berths occupied, not CU). */
  passengers?: number;
  /**
   * Black-market kidnap: the active passenger fare to divert.
   * Passengers stay on that fare until turn-in.
   */
  linkedMissionId?: string;
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
   * Explore: surveyed the target POI with a Survey Scanner (hold F).
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
  if (mission.kind === "passenger") {
    const n = mission.passengers ?? 0;
    return `Deliver ${n} passenger${n === 1 ? "" : "s"} to ${mission.destStationName ?? "destination"}`;
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
    return `Scoop cargo at ${mission.targetPoiName ?? "derelict"}`;
  }
  if (mission.kind === "distressAnswer") {
    const where =
      mission.targetBodyName ??
      mission.targetPoiName ??
      "distress site";
    return `Answer distress at ${where}`;
  }
  if (mission.kind === "bmDestroyPatrol") {
    if (mission.scanned || mission.status === "readyToClaim") {
      return `Patrol down — claim at ${mission.originStationName}`;
    }
    return `Destroy the patrol at ${mission.destStationName ?? "destination"}`;
  }
  if (mission.kind === "bmKidnap") {
    const n = mission.passengers ?? 0;
    return `Turn in ${n} kidnapped passenger${n === 1 ? "" : "s"} at a black market`;
  }
  if (mission.scanned) {
    return `Scan complete — return to ${mission.originStationName}`;
  }
  return `Travel to ${mission.targetPoiName ?? "target"}`;
}

/** Berths occupied by active passenger fare contracts. */
export function occupiedPassengerBerths(
  missions: readonly ActiveMission[],
): number {
  let n = 0;
  for (const m of missions) {
    if (m.kind === "passenger") n += m.passengers ?? 0;
  }
  return n;
}

/** Free berths remaining after active fares. */
export function freePassengerBerths(
  capacity: number,
  missions: readonly ActiveMission[],
): number {
  return Math.max(0, capacity - occupiedPassengerBerths(missions));
}

/**
 * Chart POI ids that are active quest destinations (or return-to-claim origins).
 */
export function questChartPoiIds(
  missions: readonly (MissionOffer | ActiveMission)[],
): Set<number> {
  const ids = new Set<number>();
  for (const m of missions) {
    const scanned = "scanned" in m && m.scanned;
    if (m.kind === "explore" || m.kind === "derelictCargo") {
      if (scanned) {
        ids.add(m.originPoiId);
      } else if (m.targetPoiId !== undefined) {
        ids.add(m.targetPoiId);
      }
    } else if (
      (m.kind === "cargo" || m.kind === "passenger") &&
      m.destPoiId !== undefined
    ) {
      ids.add(m.destPoiId);
    } else if (
      (m.kind === "clearance" || m.kind === "distressAnswer") &&
      m.targetPoiId !== undefined
    ) {
      ids.add(m.targetPoiId);
    } else if (m.kind === "bmDestroyPatrol") {
      if (scanned) {
        ids.add(m.originPoiId);
      } else if (m.destPoiId !== undefined) {
        ids.add(m.destPoiId);
      }
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

  const usedHauls = new Set<string>();
  for (let i = 0; i < cargoCount; i += 1) {
    const cargo = makeCargoOffer(galaxy, station, rng, i, usedHauls);
    if (!cargo) continue;
    offers.push(cargo);
    if (cargo.commodityId && cargo.destStationKey) {
      usedHauls.add(haulPairKey(cargo.commodityId, cargo.destStationKey));
    }
  }
  const usedExplore = new Set<number>();
  for (let i = 0; i < exploreCount; i += 1) {
    const explore = makeExploreOffer(galaxy, station, rng, i, usedExplore);
    if (!explore || explore.targetPoiId === undefined) continue;
    offers.push(explore);
    usedExplore.add(explore.targetPoiId);
  }
  // Replaces the old “scan derelict” explore flavor — scoop retrieval instead.
  // At most one scoop on this board.
  if (rng() < 0.7) {
    const derelict = makeDerelictCargoOffer(galaxy, station, rng, 0);
    if (derelict) offers.push(derelict);
  }
  // Long-range passenger fares — accept gated on free berths in Game.
  if (rng() < 0.75) {
    const fare = makePassengerOffer(galaxy, station, rng, 0);
    if (fare) offers.push(fare);
  }

  const distress = distressOfferForStation(galaxy, station);
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
  if (roll < 0.3) {
    return (
      makeCargoOffer(galaxy, station, rng, index, NO_BLOCKED_HAULS) ??
      makePassengerOffer(galaxy, station, rng, index) ??
      makeDerelictCargoOffer(galaxy, station, rng, index) ??
      makeExploreOffer(galaxy, station, rng, index, NO_BLOCKED_EXPLORE)
    );
  }
  if (roll < 0.55) {
    return (
      makePassengerOffer(galaxy, station, rng, index) ??
      makeCargoOffer(galaxy, station, rng, index, NO_BLOCKED_HAULS) ??
      makeExploreOffer(galaxy, station, rng, index, NO_BLOCKED_EXPLORE) ??
      makeDerelictCargoOffer(galaxy, station, rng, index)
    );
  }
  if (roll < 0.8) {
    return (
      makeDerelictCargoOffer(galaxy, station, rng, index) ??
      makeExploreOffer(galaxy, station, rng, index, NO_BLOCKED_EXPLORE) ??
      makePassengerOffer(galaxy, station, rng, index) ??
      makeCargoOffer(galaxy, station, rng, index, NO_BLOCKED_HAULS)
    );
  }
  return (
    makeExploreOffer(galaxy, station, rng, index, NO_BLOCKED_EXPLORE) ??
    makeDerelictCargoOffer(galaxy, station, rng, index) ??
    makePassengerOffer(galaxy, station, rng, index) ??
    makeCargoOffer(galaxy, station, rng, index, NO_BLOCKED_HAULS)
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

/** commodity id + destination station. Same good to two stations is a different haul. */
function haulPairKey(commodityId: string, destStationKey: string): string {
  return `${commodityId}|${destStationKey}`;
}

const NO_BLOCKED_HAULS: ReadonlySet<string> = new Set();
const NO_BLOCKED_EXPLORE: ReadonlySet<number> = new Set();

function makeCargoOffer(
  galaxy: Galaxy,
  origin: SystemStationRef,
  rng: () => number,
  index: number,
  blocked: ReadonlySet<string>,
): MissionOffer | null {
  // A few redraws so a second slot can be a different good or destination.
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const dest = pickCargoDestination(galaxy, origin, rng);
    if (!dest) return null;
    const commodity = LEGAL_COMMODITIES[(rng() * LEGAL_COMMODITIES.length) | 0]!;
    if (blocked.has(haulPairKey(commodity.id, dest.key))) continue;
    return buildCargoOffer(galaxy, origin, rng, index, dest, commodity);
  }
  return null;
}

function buildCargoOffer(
  galaxy: Galaxy,
  origin: SystemStationRef,
  rng: () => number,
  index: number,
  dest: SystemStationRef,
  commodity: (typeof LEGAL_COMMODITIES)[number],
): MissionOffer {
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

/**
 * Long-range passenger fare — occupy berths (not CU) until delivery.
 * Party size is 1 / 2 / 4 to match berth capacities (Single / Twin / Quad).
 */
function makePassengerOffer(
  galaxy: Galaxy,
  origin: SystemStationRef,
  rng: () => number,
  index: number,
): MissionOffer | null {
  const dest = pickPassengerDestination(galaxy, origin, rng);
  if (!dest) return null;

  const sizes = QUEST.passengerPartySizes;
  const passengers = sizes[(rng() * sizes.length) | 0]!;
  const originPoi = galaxy.get(origin.poiId);
  const destPoi = galaxy.get(dest.poiId);
  const dist = galaxy.distance(originPoi, destPoi);
  const jumpsHint = Math.max(1, Math.ceil(dist / GALAXY.jumpRange));
  const reward =
    QUEST.passengerBaseReward +
    passengers * QUEST.passengerPerBerth +
    Math.round(dist * QUEST.passengerPerDistance);

  const destLabel = `${dest.name} (${destPoi.name})`;
  const partyLabel =
    passengers === 1
      ? "1 passenger"
      : `${passengers} passengers`;

  return {
    id: `passenger:${origin.key}:${index}`,
    kind: "passenger",
    title: `Fare: ${partyLabel}`,
    blurb: `Deliver to ${dest.name} in ${destPoi.name} (~${jumpsHint} jump${jumpsHint === 1 ? "" : "s"}). Requires ${passengers} unoccupied passenger berth${passengers === 1 ? "" : "s"}.`,
    reward,
    originStationKey: origin.key,
    originStationName: origin.name,
    originPoiId: origin.poiId,
    passengers,
    destStationKey: dest.key,
    destStationName: destLabel,
    destPoiId: dest.poiId,
    destBodyId: dest.bodyId,
  };
}

function makeDistressAnswerOffer(
  galaxy: Galaxy,
  origin: SystemStationRef,
  dest: DistressDest,
  outcome: DistressAnswerOutcome,
): MissionOffer {

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
    blurb: `Respond at ${where} (~${jumpsHint} jump${jumpsHint === 1 ? "" : "s"}). Requires Expanded Fuel Tank · rep only.`,
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
    distressOutcome: outcome,
  };
}

interface DistressDest {
  poiId: number;
  bodyId: number | null;
  bodyName: string;
}

function distressSiteKey(dest: DistressDest): string {
  return `${dest.poiId}:${dest.bodyId ?? "poi"}`;
}

interface AssignedDistress {
  dest: DistressDest;
  outcome: DistressAnswerOutcome;
}

/** One assignment per galaxy so two boards never list the same distress site. */
const distressAssignmentCache = new WeakMap<Galaxy, Map<string, AssignedDistress | null>>();

/**
 * Stationless local views outside the origin system — star, orbital, or exotic POI.
 * Nearest first. Boards roll inside the nearest 14; a site already assigned to
 * another station falls through to the next free candidate in range.
 */
function listDistressCandidates(
  galaxy: Galaxy,
  originPoiId: number,
): DistressDest[] {
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

  candidates.sort(
    (a, b) =>
      a.dist - b.dist ||
      a.dest.poiId - b.dest.poiId ||
      (a.dest.bodyId ?? -1) - (b.dest.bodyId ?? -1),
  );
  return candidates.map((row) => row.dest);
}

function allStarStations(galaxy: Galaxy): SystemStationRef[] {
  const stations: SystemStationRef[] = [];
  for (const poi of galaxy.pois) {
    if (poi.type !== "starSystem") continue;
    stations.push(...listSystemStations(galaxy, poi.id));
  }
  stations.sort(
    (a, b) => a.poiId - b.poiId || a.bodyId - b.bodyId || a.stationId - b.stationId,
  );
  return stations;
}

function ensureDistressAssignments(
  galaxy: Galaxy,
): Map<string, AssignedDistress | null> {
  const cached = distressAssignmentCache.get(galaxy);
  if (cached) return cached;

  const assigned = new Map<string, AssignedDistress | null>();
  const taken = new Set<string>();
  const pools = new Map<number, DistressDest[]>();

  for (const station of allStarStations(galaxy)) {
    let pool = pools.get(station.poiId);
    if (!pool) {
      pool = listDistressCandidates(galaxy, station.poiId);
      pools.set(station.poiId, pool);
    }
    const rng = mulberry32(
      hash2(GALAXY.seed ^ 0xd15e55, hashStationKey(station.key)),
    );
    const nearest = pool.slice(0, Math.min(14, pool.length));
    if (nearest.length === 0) {
      assigned.set(station.key, null);
      continue;
    }
    const natural = nearest[(rng() * nearest.length) | 0]!;
    let dest = natural;
    if (taken.has(distressSiteKey(natural))) {
      const openNear = nearest.filter((d) => !taken.has(distressSiteKey(d)));
      if (openNear.length > 0) {
        dest = openNear[(rng() * openNear.length) | 0]!;
      } else {
        const farther = pool.find((d) => !taken.has(distressSiteKey(d)));
        if (!farther) {
          assigned.set(station.key, null);
          continue;
        }
        dest = farther;
      }
    }
    const outcome: DistressAnswerOutcome =
      rng() < QUEST.distressAnswerBaitChance ? "bait" : "stranded";
    taken.add(distressSiteKey(dest));
    assigned.set(station.key, { dest, outcome });
  }

  distressAssignmentCache.set(galaxy, assigned);
  return assigned;
}

function distressOfferForStation(
  galaxy: Galaxy,
  station: SystemStationRef,
): MissionOffer | null {
  const row = ensureDistressAssignments(galaxy).get(station.key);
  if (!row) return null;
  return makeDistressAnswerOffer(galaxy, station, row.dest, row.outcome);
}

function makeExploreOffer(
  galaxy: Galaxy,
  origin: SystemStationRef,
  rng: () => number,
  index: number,
  blocked: ReadonlySet<number>,
): MissionOffer | null {
  const target = pickExploreTarget(galaxy, origin.poiId, rng, blocked);
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
    blurb: `Survey ${target.name} (~${jumpsHint} jump${jumpsHint === 1 ? "" : "s"}). Requires Survey Scanner.`,
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
    blurb: `Scoop ${cu} CU at ${target.name} (~${jumpsHint} jump${jumpsHint === 1 ? "" : "s"}). Requires Cargo Scoop.`,
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

/**
 * Prefer other-system stations at least ~1 jump-range away (long-haul fares).
 */
function pickPassengerDestination(
  galaxy: Galaxy,
  origin: SystemStationRef,
  rng: () => number,
): SystemStationRef | null {
  const originPoi = galaxy.get(origin.poiId);
  const minDist = GALAXY.jumpRange * QUEST.passengerMinJumpRanges;
  const maxDist = GALAXY.jumpRange * QUEST.passengerMaxJumpRanges;
  const longHaul: { station: SystemStationRef; dist: number }[] = [];
  const fallback: { station: SystemStationRef; dist: number }[] = [];

  for (const poi of galaxy.pois) {
    if (poi.type !== "starSystem" || poi.id === origin.poiId) continue;
    const dist = galaxy.distance(originPoi, poi);
    if (dist > maxDist) continue;
    for (const s of listSystemStations(galaxy, poi.id)) {
      const row = { station: s, dist };
      if (dist >= minDist) longHaul.push(row);
      else fallback.push(row);
    }
  }

  const poolSrc = longHaul.length > 0 ? longHaul : fallback;
  if (poolSrc.length === 0) return null;
  // Prefer farther end of the long-haul band so planning matters.
  poolSrc.sort((a, b) => b.dist - a.dist);
  const pool = poolSrc.slice(0, Math.min(14, poolSrc.length));
  return pool[(rng() * pool.length) | 0]!.station;
}

function pickExploreTarget(
  galaxy: Galaxy,
  originPoiId: number,
  rng: () => number,
  blocked: ReadonlySet<number>,
): PoiRef | null {
  const origin = galaxy.get(originPoiId);
  const ranked = galaxy.pois
    .filter(
      (p) =>
        p.id !== originPoiId &&
        !blocked.has(p.id) &&
        EXPLORE_TYPES.includes(p.type) &&
        galaxy.distance(origin, p) <= GALAXY.jumpRange * QUEST.exploreMaxJumpRanges,
    )
    .map((p) => ({ p, dist: galaxy.distance(origin, p) }))
    .sort((a, b) => a.dist - b.dist);

  if (ranked.length === 0) {
    // Fallback: any exotic in the chart (still no derelicts).
    const any = galaxy.pois.filter(
      (p) => EXPLORE_TYPES.includes(p.type) && !blocked.has(p.id),
    );
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

/**
 * Black-market jobs for one dock. Caller must already know Rebels are
 * revealed and this station has a black market.
 * One destroy-patrol offer (seeded) plus one divert per active fare.
 */
export function blackMarketMissionOffers(
  galaxy: Galaxy,
  origin: SystemStationRef,
  active: readonly ActiveMission[],
  acceptedIds: ReadonlySet<string>,
): MissionOffer[] {
  const offers: MissionOffer[] = [];
  const destroyActive = active.some((m) => m.kind === "bmDestroyPatrol");
  const destroy = makeBmDestroyPatrolOffer(galaxy, origin);
  if (destroy && !destroyActive && !acceptedIds.has(destroy.id)) {
    offers.push(destroy);
  }

  const taken = new Set(
    active
      .filter((m) => m.kind === "bmKidnap" && m.linkedMissionId)
      .map((m) => m.linkedMissionId!),
  );
  for (const fare of active) {
    if (fare.kind !== "passenger") continue;
    if ((fare.passengers ?? 0) <= 0) continue;
    if (taken.has(fare.id)) continue;
    const kidnap = makeBmKidnapOffer(origin, fare);
    if (!kidnap || acceptedIds.has(kidnap.id)) continue;
    offers.push(kidnap);
  }
  return offers;
}

function makeBmDestroyPatrolOffer(
  galaxy: Galaxy,
  origin: SystemStationRef,
): MissionOffer | null {
  const rng = mulberry32(
    hash2(GALAXY.seed ^ 0xb1ac, hashStationKey(origin.key)),
  );
  const dest = pickPatrolHuntDestination(galaxy, origin, rng);
  if (!dest) return null;

  const originPoi = galaxy.get(origin.poiId);
  const destPoi = galaxy.get(dest.poiId);
  const sameSystem = dest.poiId === origin.poiId;
  const dist = sameSystem ? 0 : galaxy.distance(originPoi, destPoi);
  const jumpsHint = sameSystem
    ? 0
    : Math.max(1, Math.ceil(dist / GALAXY.jumpRange));
  const reward =
    QUEST.bmDestroyPatrolBaseReward +
    Math.round(dist * QUEST.bmDestroyPatrolPerDistance);
  const where = sameSystem
    ? `${dest.name} in this system`
    : `${dest.name} in ${destPoi.name} (~${jumpsHint} jump${jumpsHint === 1 ? "" : "s"})`;

  return {
    id: `bmDestroyPatrol:${origin.key}`,
    kind: "bmDestroyPatrol",
    title: "Destroy station patrol",
    blurb: `Destroy the patrol at ${where}, then return here. Shooting a patrol makes you Hostile there.`,
    reward,
    originStationKey: origin.key,
    originStationName: origin.name,
    originPoiId: origin.poiId,
    factionId: REBELS_FACTION_ID,
    factionLabel: "Black Market",
    destStationKey: dest.key,
    destStationName: `${dest.name} (${destPoi.name})`,
    destPoiId: dest.poiId,
    destBodyId: dest.bodyId,
  };
}

function makeBmKidnapOffer(
  origin: SystemStationRef,
  fare: ActiveMission,
): MissionOffer | null {
  const n = fare.passengers ?? 0;
  if (n <= 0) return null;
  const party = n === 1 ? "1 passenger" : `${n} passengers`;
  return {
    id: `bmKidnap:${origin.key}:${fare.id}`,
    kind: "bmKidnap",
    title: `Divert ${party}`,
    blurb: `Take the fare for ${party} off its route and turn them in at any black market that is not their destination. Pays the fare plus ${QUEST.bmKidnapPremium} cr. Severe Imperial hit.`,
    reward: fare.reward + QUEST.bmKidnapPremium,
    originStationKey: origin.key,
    originStationName: origin.name,
    originPoiId: origin.poiId,
    factionId: REBELS_FACTION_ID,
    factionLabel: "Black Market",
    passengers: n,
    linkedMissionId: fare.id,
    destStationName: fare.destStationName,
  };
}

/**
 * A station that will spawn a patrol, other than the giver.
 * Nearest pool so the hunt is reachable.
 */
function pickPatrolHuntDestination(
  galaxy: Galaxy,
  origin: SystemStationRef,
  rng: () => number,
): SystemStationRef | null {
  const originPoi = galaxy.get(origin.poiId);
  const maxDist = GALAXY.jumpRange * QUEST.bmDestroyPatrolMaxJumpRanges;
  const candidates: { station: SystemStationRef; dist: number }[] = [];

  for (const poi of galaxy.pois) {
    if (poi.type !== "starSystem") continue;
    const dist =
      poi.id === origin.poiId ? 0 : galaxy.distance(originPoi, poi);
    if (poi.id !== origin.poiId && dist > maxDist) continue;
    for (const station of listSystemStations(galaxy, poi.id)) {
      if (station.key === origin.key) continue;
      if (!patrolWouldSpawn(station.key)) continue;
      candidates.push({ station, dist });
    }
  }

  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.dist - b.dist);
  const pool = candidates.slice(0, Math.min(12, candidates.length));
  return pool[(rng() * pool.length) | 0]!.station;
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
