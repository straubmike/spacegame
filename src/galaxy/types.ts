export type PoiType =
  | "starSystem"
  | "blackHole"
  | "derelict"
  | "neutronStar"
  | "brownDwarf"
  | "roguePlanet"
  | "nebula";

/** Main-sequence spectral class */
export type StarClass = "O" | "B" | "A" | "F" | "G" | "K" | "M";

/** Orbiting body classification (distance-driven). */
export type OrbitBodyKind =
  | "molten"
  | "habitable"
  | "rocky"
  | "asteroidBelt"
  | "gasGiant"
  | "ice";

export type HostKind =
  | "star"
  | OrbitBodyKind
  | "blackHole"
  | "derelict"
  | "neutronStar"
  | "brownDwarf"
  | "roguePlanet"
  | "nebula";

export type LandmarkKind = HostKind | "station" | "debris";

export interface PoiRef {
  id: number;
  name: string;
  type: PoiType;
  chartX: number;
  chartY: number;
  starClass?: StarClass;
}

export interface SystemBodyRef {
  id: number;
  name: string;
  kind: "star" | OrbitBodyKind;
  /** Orbit index among non-star bodies (0 = innermost); null for star */
  orbitIndex: number | null;
  stationCount: number;
}

export interface SystemBlueprint {
  poiId: number;
  name: string;
  starClass: StarClass;
  bodies: SystemBodyRef[];
}

export interface Landmark {
  id: number;
  name: string;
  kind: LandmarkKind;
  x: number;
  y: number;
  radius: number;
}

/** Hull tier for a seeded pirate ship. */
export type PirateTier = "scout" | "raider" | "gunship" | "corsair";

/** Encounter shape chosen by heat / wealth (Must-have 4). */
export type EncounterTemplate =
  | "scout"
  | "patrol"
  | "wing"
  | "ambush"
  | "heat";

/** One ship inside a seeded pirate encounter. */
export interface PirateShipSpawn {
  x: number;
  y: number;
  heading: number;
  tier: PirateTier;
}

/**
 * Seeded pirate encounter for a local view.
 * Multi-ship packs share one view key for clearance / fee payment.
 */
export interface PirateEncounter {
  template: EncounterTemplate;
  ships: PirateShipSpawn[];
  /** Group tribute for safe passage (credits). */
  fee: number;
}

/** @deprecated Prefer PirateEncounter — kept as alias for older call sites. */
export type PirateSpawn = PirateEncounter;

export interface LocalView {
  poiId: number;
  poiName: string;
  poiType: PoiType;
  bodyId: number | null;
  locationName: string;
  starClass?: StarClass;
  /** Short flavor for non-system POIs */
  blurb?: string;
  focus: Landmark;
  companions: Landmark[];
  systemBodies: SystemBodyRef[] | null;
  /** Seeded pirate encounter for this local view (null = none) */
  pirate: PirateEncounter | null;
  /**
   * Mutable belt ore rocks when focus is an asteroid belt.
   * Shared by render + scoop gameplay; remaining CU depletes in-session.
   */
  beltRocks: BeltRockRef[] | null;
}

/** Lightweight rock payload on LocalView (avoids circular imports). */
export interface BeltRockRef {
  id: number;
  x: number;
  y: number;
  r: number;
  yieldId: "minerals" | "alloys" | "precious_metals" | null;
  remaining: number;
}
