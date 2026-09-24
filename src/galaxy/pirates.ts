import { COMBAT, GALAXY } from "../game/config";
import { generateSystemBlueprint } from "./generateLocal";
import { hash2, mulberry32 } from "./rng";
import type { Galaxy } from "./Galaxy";
import type { PirateSpawn } from "./types";

/** Stable key for a local view's pirate slot. */
export function pirateViewKey(
  poiId: number,
  bodyId: number | null,
): string {
  return `${poiId}:${bodyId ?? "x"}`;
}

/**
 * Seeded pirate placement for a local view — independent of landmark RNG
 * so presence can be queried without rebuilding the full scene.
 */
export function pirateSpawnFor(
  poiId: number,
  bodyId: number | null,
): PirateSpawn | null {
  const rng = mulberry32(
    hash2(GALAXY.seed ^ 0x9e3779b9, poiId * 7919 + 9001 + (bodyId ?? 0) * 131),
  );
  if (rng() >= COMBAT.pirateSpawnChance) return null;
  const angle = rng() * Math.PI * 2;
  const dist =
    COMBAT.pirateSpawnMin +
    rng() * (COMBAT.pirateSpawnMax - COMBAT.pirateSpawnMin);
  return {
    x: Math.cos(angle) * dist,
    y: Math.sin(angle) * dist,
    heading: rng() * Math.PI * 2,
  };
}

/** All seeded pirate slots in a star system (may include already-cleared ones). */
export function listSystemPirateKeys(
  galaxy: Galaxy,
  poiId: number,
): string[] {
  const blueprint = generateSystemBlueprint(galaxy, poiId);
  const keys: string[] = [];
  for (const body of blueprint.bodies) {
    if (pirateSpawnFor(poiId, body.id)) {
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
