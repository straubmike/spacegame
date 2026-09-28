import { FUEL, GALAXY } from "../game/config";
import type { Galaxy } from "../galaxy/Galaxy";
import { generateSystemBlueprint } from "../galaxy/generateLocal";

/** Flat supercruise (system-map) fuel cost. */
export function supercruiseFuelCost(): number {
  return FUEL.supercruiseCost;
}

/** Distance-dependent galactic jump fuel cost (ly → tank units). */
export function galacticFuelCost(distanceLy: number): number {
  if (distanceLy <= 0) return 0;
  return Math.max(
    1,
    Math.ceil(distanceLy * FUEL.fuelPerLy),
  );
}

export interface NearestStationRefuel {
  /** Minimum fuel needed from here to reach a dockable station. */
  fuelNeeded: number;
  /** POI name to tell the player. */
  poiName: string;
  /** Short reason for comms. */
  detail: string;
}

/**
 * Cheapest fuel path to a station with a dock.
 * Prefers in-system bodies, then nearest other star systems with stations.
 */
export function nearestStationRefuel(
  galaxy: Galaxy,
  fromPoiId: number,
  fromBodyId: number | null,
): NearestStationRefuel {
  const from = galaxy.get(fromPoiId);
  const sc = supercruiseFuelCost();

  if (from.type === "starSystem") {
    const blueprint = generateSystemBlueprint(galaxy, fromPoiId);
    const here = blueprint.bodies.find((b) => b.id === fromBodyId);
    if (here && here.stationCount > 0) {
      return {
        fuelNeeded: 0,
        poiName: from.name,
        detail: `Dock at a station here in ${from.name}.`,
      };
    }
    const other = blueprint.bodies.find(
      (b) => b.id !== fromBodyId && b.stationCount > 0,
    );
    if (other) {
      return {
        fuelNeeded: sc,
        poiName: from.name,
        detail: `Supercruise to ${other.name} in ${from.name}.`,
      };
    }
  }

  let best: NearestStationRefuel | null = null;
  for (const poi of galaxy.pois) {
    if (poi.id === fromPoiId) continue;
    if (poi.type !== "starSystem") continue;
    const blueprint = generateSystemBlueprint(galaxy, poi.id);
    const withStation = blueprint.bodies.find((b) => b.stationCount > 0);
    if (!withStation) continue;
    const dist = galaxy.distance(from, poi);
    if (dist > GALAXY.jumpRange) continue;
    const cost = galacticFuelCost(dist) + sc;
    if (!best || cost < best.fuelNeeded) {
      best = {
        fuelNeeded: cost,
        poiName: poi.name,
        detail: `Jump to ${poi.name}, then dock at ${withStation.name}.`,
      };
    }
  }

  if (best) return best;

  // Fallback: any star system with stations, even beyond chart range.
  for (const poi of galaxy.pois) {
    if (poi.type !== "starSystem") continue;
    const blueprint = generateSystemBlueprint(galaxy, poi.id);
    const withStation = blueprint.bodies.find((b) => b.stationCount > 0);
    if (!withStation) continue;
    const dist = galaxy.distance(from, poi);
    const cost = galacticFuelCost(dist) + sc;
    if (!best || cost < best.fuelNeeded) {
      best = {
        fuelNeeded: Math.max(cost, sc),
        poiName: poi.name,
        detail: `Head for ${poi.name} (${withStation.name}).`,
      };
    }
  }

  return (
    best ?? {
      fuelNeeded: sc,
      poiName: from.name,
      detail: "Seek the nearest inhabited system.",
    }
  );
}
