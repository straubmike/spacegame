/**
 * Per-station dock menu variety (Must-have 10).
 *
 * Repair is always available. Optional service menus are a seed-stable subset
 * of the rollable set — more menus is rarer; the full set is the rarest roll.
 */

import { GALAXY, STATION_MENU_VARIETY } from "../game/config";
import { hash2, mulberry32 } from "../galaxy/rng";
import { hashStationKey } from "./stationKey";

/** Service menus that may or may not appear at a station (Repair / Launch are fixed). */
export type OptionalStationMenu =
  | "bay"
  | "hangar"
  | "market"
  | "blackMarket"
  | "missions";

/** Canonical order for dock UI layout. */
export const OPTIONAL_STATION_MENUS: readonly OptionalStationMenu[] = [
  "bay",
  "hangar",
  "market",
  "blackMarket",
  "missions",
] as const;

export type StationMenuSet = ReadonlySet<OptionalStationMenu>;

/**
 * Seed-stable optional menus for a station.
 * Always returns at least one menu; full set is the rarest outcome.
 */
export function rollStationMenus(stationKey: string): StationMenuSet {
  const rng = mulberry32(
    hash2(GALAXY.seed ^ 0x10e7, hashStationKey(stationKey)),
  );

  const weights = STATION_MENU_VARIETY.countWeights;
  const maxCount = OPTIONAL_STATION_MENUS.length;
  let total = 0;
  for (let k = 1; k <= maxCount; k += 1) {
    total += weights[k] ?? 0;
  }
  // Fallback: if misconfigured, always offer exactly one menu.
  if (total <= 0) {
    const idx = Math.floor(rng() * maxCount) % maxCount;
    return new Set([OPTIONAL_STATION_MENUS[idx]!]);
  }

  let pick = rng() * total;
  let count = 1;
  for (let k = 1; k <= maxCount; k += 1) {
    pick -= weights[k] ?? 0;
    if (pick < 0) {
      count = k;
      break;
    }
  }
  count = Math.max(1, Math.min(maxCount, count));

  // Fisher–Yates shuffle a copy, then take the first `count`.
  const pool = OPTIONAL_STATION_MENUS.slice();
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = pool[i]!;
    pool[i] = pool[j]!;
    pool[j] = tmp;
  }

  return new Set(pool.slice(0, count));
}

export function stationHasMenu(
  stationKey: string,
  menu: OptionalStationMenu,
): boolean {
  return rollStationMenus(stationKey).has(menu);
}
