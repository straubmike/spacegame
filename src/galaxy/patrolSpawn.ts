import { GALAXY, PATROL } from "../game/config";
import { hashStationKey } from "../ship/stationKey";
import { hash2 } from "./rng";

/**
 * Seeded roll matching Game.spawnStationPatrols — whether a station gets a
 * patrol when its local view is entered.
 */
export function patrolWouldSpawn(stationKey: string): boolean {
  const roll =
    (hash2(GALAXY.seed ^ 0x9a71, hashStationKey(stationKey)) % 1000) / 1000;
  return roll <= PATROL.spawnChance;
}
