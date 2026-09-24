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

/** Static pirate placement regenerated with the local view. */
export interface PirateSpawn {
  x: number;
  y: number;
  heading: number;
}

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
  /** Seeded pirate placement for this local view (null = none) */
  pirate: PirateSpawn | null;
}
