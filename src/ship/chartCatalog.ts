import { listSystemStations } from "../galaxy/pirates";
import type { Galaxy } from "../galaxy/Galaxy";
import { rollStationMenus, type OptionalStationMenu } from "./market";

/** Chart visibility degree for a POI (per-player fog-of-war). */
export type ChartReveal = "hidden" | "identified" | "visited";

/** Letter shown beside Station on visited chart select (deduped). */
const MENU_LETTER: Record<OptionalStationMenu, string> = {
  bay: "B",
  hangar: "H",
  market: "M",
  blackMarket: "K",
};

const LETTER_ORDER = ["B", "H", "M", "K"] as const;

/**
 * Per-player galactic chart catalog (multiplayer-ready).
 * World POIs all exist; only visited / identified ids appear on G.
 */
export class ChartCatalog {
  private readonly visited = new Set<number>();
  /** In-range neighbors of visited POIs + mission target grants. */
  private readonly identified = new Set<number>();

  get visitedIds(): ReadonlySet<number> {
    return this.visited;
  }

  get identifiedIds(): ReadonlySet<number> {
    return this.identified;
  }

  isVisited(poiId: number): boolean {
    return this.visited.has(poiId);
  }

  isIdentified(poiId: number): boolean {
    return this.identified.has(poiId) || this.visited.has(poiId);
  }

  isVisible(poiId: number): boolean {
    return this.isIdentified(poiId);
  }

  reveal(poiId: number): ChartReveal {
    if (this.visited.has(poiId)) return "visited";
    if (this.identified.has(poiId)) return "identified";
    return "hidden";
  }

  /**
   * Mark a POI visited and expand identified neighbors within jump range.
   * Call on local-view enter (including session start).
   */
  markVisited(poiId: number, galaxy: Galaxy, jumpRange: number): void {
    this.visited.add(poiId);
    this.identified.add(poiId);
    this.expandFrom(poiId, galaxy, jumpRange);
  }

  /** Grant in-range-neighbor visibility (icon + name) without visiting. */
  grantIdentified(poiId: number): void {
    this.identified.add(poiId);
  }

  private expandFrom(poiId: number, galaxy: Galaxy, jumpRange: number): void {
    for (const neighbor of galaxy.poisInRange(poiId, jumpRange)) {
      this.identified.add(neighbor.id);
    }
  }
}

/**
 * Deduped service letters for all stations in a POI system.
 * Empty when the POI has no stations (exotica / stationless).
 */
export function stationMenuLettersForPoi(
  galaxy: Galaxy,
  poiId: number,
): readonly string[] {
  const poi = galaxy.get(poiId);
  if (poi.type !== "starSystem") return [];

  const found = new Set<string>();
  for (const st of listSystemStations(galaxy, poiId)) {
    for (const menu of rollStationMenus(st.key)) {
      if (menu === "missions") continue;
      const letter = MENU_LETTER[menu as OptionalStationMenu];
      if (letter) found.add(letter);
    }
  }
  return LETTER_ORDER.filter((l) => found.has(l));
}
