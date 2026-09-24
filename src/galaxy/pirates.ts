import {
  COMBAT,
  ENCOUNTERS,
  GALAXY,
  type EncounterTemplateId,
} from "../game/config";
import { generateSystemBlueprint } from "./generateLocal";
import { hash2, mulberry32 } from "./rng";
import type { Galaxy } from "./Galaxy";
import type {
  EncounterTemplate,
  PirateEncounter,
  PirateShipSpawn,
  PirateTier,
} from "./types";

/** Stable key for a local view's pirate encounter slot. */
export function pirateViewKey(
  poiId: number,
  bodyId: number | null,
): string {
  return `${poiId}:${bodyId ?? "x"}`;
}

export type HeatBandId = (typeof ENCOUNTERS.heatBands)[number]["id"];

/** Chart-distance heat band from the start POI (near → far). */
export function heatBandForPoi(galaxy: Galaxy, poiId: number): HeatBandId {
  const start = galaxy.get(GALAXY.startPoiId);
  const poi = galaxy.get(poiId);
  const dist = galaxy.distance(start, poi);
  for (const band of ENCOUNTERS.heatBands) {
    if (dist <= band.maxDist) return band.id;
  }
  return "far";
}

function spawnChanceForBand(band: HeatBandId): number {
  const row = ENCOUNTERS.heatBands.find((b) => b.id === band);
  return row?.spawnChance ?? COMBAT.pirateSpawnChance;
}

/** Station count across a star system (0 for exotica). */
export function systemStationCount(galaxy: Galaxy, poiId: number): number {
  const poi = galaxy.get(poiId);
  if (poi.type !== "starSystem") return 0;
  const blueprint = generateSystemBlueprint(galaxy, poiId);
  let n = 0;
  for (const body of blueprint.bodies) n += body.stationCount;
  return n;
}

function isWealthySystem(galaxy: Galaxy, poiId: number): boolean {
  return systemStationCount(galaxy, poiId) >= ENCOUNTERS.wealthyStationThreshold;
}

function pickTemplate(
  rng: () => number,
  band: HeatBandId,
  wealthy: boolean,
): EncounterTemplate {
  const weights = ENCOUNTERS.templateWeights;
  const boost = wealthy ? ENCOUNTERS.wealthyBoost : null;
  const entries: { id: EncounterTemplateId; w: number }[] = [];
  for (const id of Object.keys(weights) as EncounterTemplateId[]) {
    let w = weights[id][band];
    if (boost && id in boost) {
      w += boost[id as keyof typeof boost];
    }
    if (w > 0) entries.push({ id, w });
  }
  const total = entries.reduce((s, e) => s + e.w, 0);
  if (total <= 0) return "patrol";
  let roll = rng() * total;
  for (const e of entries) {
    roll -= e.w;
    if (roll <= 0) return e.id;
  }
  return entries[entries.length - 1]!.id;
}

function randomHeading(rng: () => number): number {
  return rng() * Math.PI * 2;
}

function placeAnchor(
  rng: () => number,
  template: EncounterTemplate,
): { x: number; y: number; heading: number } {
  const ambush = template === "ambush";
  const min = ambush ? ENCOUNTERS.ambushSpawnMin : COMBAT.pirateSpawnMin;
  const max = ambush ? ENCOUNTERS.ambushSpawnMax : COMBAT.pirateSpawnMax;
  const angle = rng() * Math.PI * 2;
  const dist = min + rng() * (max - min);
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    heading: randomHeading(rng),
  };
}

function offsetFrom(
  anchor: { x: number; y: number },
  rng: () => number,
  index: number,
  count: number,
): { x: number; y: number } {
  if (count <= 1) return { x: anchor.x, y: anchor.y };
  const base = (index / count) * Math.PI * 2;
  const jitter = (rng() - 0.5) * 0.6;
  const r = ENCOUNTERS.formationRadius * (0.75 + rng() * 0.5);
  return {
    x: anchor.x + Math.cos(base + jitter) * r,
    y: anchor.y + Math.sin(base + jitter) * r,
  };
}

function pickTier(
  rng: () => number,
  template: EncounterTemplate,
  band: HeatBandId,
): PirateTier[] {
  switch (template) {
    case "scout":
      return ["scout"];
    case "patrol":
      return [band === "far" && rng() < 0.35 ? "gunship" : "raider"];
    case "wing": {
      const n = band === "far" ? (rng() < 0.45 ? 3 : 2) : 2;
      const tiers: PirateTier[] = [];
      for (let i = 0; i < n; i += 1) {
        if (i === 0 && band !== "near" && rng() < 0.4) {
          tiers.push("raider");
        } else {
          tiers.push(rng() < 0.65 ? "scout" : "raider");
        }
      }
      return tiers;
    }
    case "ambush": {
      const lead: PirateTier =
        band === "far" && rng() < 0.4 ? "gunship" : "raider";
      const wing: PirateTier = rng() < 0.55 ? "scout" : "raider";
      return [lead, wing];
    }
    case "heat": {
      if (band === "far" && rng() < 0.45) {
        // Elite corsair + optional scout wingman
        return rng() < 0.55 ? ["corsair", "scout"] : ["corsair"];
      }
      const escortCount = band === "near" ? 0 : rng() < 0.55 ? 2 : 1;
      const tiers: PirateTier[] = ["gunship"];
      for (let i = 0; i < escortCount; i += 1) {
        tiers.push(rng() < 0.5 ? "scout" : "raider");
      }
      return tiers;
    }
  }
}

function buildShips(
  rng: () => number,
  template: EncounterTemplate,
  tiers: PirateTier[],
): PirateShipSpawn[] {
  const anchor = placeAnchor(rng, template);
  return tiers.map((tier, i) => {
    const pos = offsetFrom(anchor, rng, i, tiers.length);
    return {
      x: pos.x,
      y: pos.y,
      heading: randomHeading(rng),
      tier,
    };
  });
}

/**
 * Seeded pirate encounter for a local view — independent of landmark RNG
 * so presence can be queried without rebuilding the full scene.
 */
export function pirateEncounterFor(
  galaxy: Galaxy,
  poiId: number,
  bodyId: number | null,
): PirateEncounter | null {
  const rng = mulberry32(
    hash2(GALAXY.seed ^ 0x9e3779b9, poiId * 7919 + 9001 + (bodyId ?? 0) * 131),
  );
  const band = heatBandForPoi(galaxy, poiId);
  if (rng() >= spawnChanceForBand(band)) return null;

  const wealthy = isWealthySystem(galaxy, poiId) && band !== "near";
  const template = pickTemplate(rng, band, wealthy);
  const tiers = pickTier(rng, template, band);
  const ships = buildShips(rng, template, tiers);
  const fee = ENCOUNTERS.feeByTemplate[template];

  return { template, ships, fee };
}

/** @deprecated Use pirateEncounterFor — same encounter, renamed. */
export function pirateSpawnFor(
  galaxy: Galaxy,
  poiId: number,
  bodyId: number | null,
): PirateEncounter | null {
  return pirateEncounterFor(galaxy, poiId, bodyId);
}

/** All seeded pirate slots in a star system (may include already-cleared ones). */
export function listSystemPirateKeys(
  galaxy: Galaxy,
  poiId: number,
): string[] {
  const blueprint = generateSystemBlueprint(galaxy, poiId);
  const keys: string[] = [];
  for (const body of blueprint.bodies) {
    if (pirateEncounterFor(galaxy, poiId, body.id)) {
      keys.push(pirateViewKey(poiId, body.id));
    }
  }
  return keys;
}

export interface SystemStationRef {
  poiId: number;
  bodyId: number;
  stationId: number;
  /** Matches Landmark.name from generateLocal makeStations. */
  name: string;
  key: string;
}

export function stationKey(
  poiId: number,
  bodyId: number,
  stationId: number,
): string {
  return `${poiId}:${bodyId}:${stationId}`;
}

/** Stations across a star system (deterministic names/ids). */
export function listSystemStations(
  galaxy: Galaxy,
  poiId: number,
): SystemStationRef[] {
  const blueprint = generateSystemBlueprint(galaxy, poiId);
  const stations: SystemStationRef[] = [];
  for (const body of blueprint.bodies) {
    for (let i = 0; i < body.stationCount; i += 1) {
      const stationId = i + 1;
      const clean = body.name
        .replace(/ \([^)]+\)$/, "")
        .replace(/ Belt$/, "");
      stations.push({
        poiId,
        bodyId: body.id,
        stationId,
        name: `${clean} Station`,
        key: stationKey(poiId, body.id, stationId),
      });
    }
  }
  return stations;
}

/**
 * Exactly one quest-giver station per system that has pirates and stations.
 * Returns null when the system cannot offer a clearance quest.
 */
export function pickQuestGiverStation(
  galaxy: Galaxy,
  poiId: number,
): SystemStationRef | null {
  const pirateKeys = listSystemPirateKeys(galaxy, poiId);
  if (pirateKeys.length === 0) return null;
  const stations = listSystemStations(galaxy, poiId);
  if (stations.length === 0) return null;
  const rng = mulberry32(hash2(GALAXY.seed, poiId * 1337 + 99));
  const index = Math.floor(rng() * stations.length) % stations.length;
  return stations[index]!;
}
