import { BODY_COLORS, GALAXY, LOCAL, STARS, SYSTEM } from "../game/config";
import { pirateSpawnFor } from "./pirates";
import { hash2, mulberry32 } from "./rng";
import type { Galaxy } from "./Galaxy";
import type {
  Landmark,
  LocalView,
  OrbitBodyKind,
  PoiType,
  StarClass,
  SystemBlueprint,
  SystemBodyRef,
} from "./types";

const PLANET_NAMES = [
  "Aether",
  "Borealis",
  "Cinder",
  "Drift",
  "Ember",
  "Frost",
  "Glimmer",
  "Haven",
  "Ivory",
  "Jade",
  "Kestrel",
  "Lumen",
];

export const STAR_COLORS = STARS.colors;

export const POI_CHART_COLORS: Record<PoiType, string> = {
  starSystem: "#c8d6e8",
  derelict: "#9aa3b5",
  blackHole: "#e8e8f0",
  neutronStar: "#b0ffe8",
  brownDwarf: "#a06040",
  roguePlanet: "#7a8a9a",
  nebula: "#c080c8",
};

const POI_BLURBS: Partial<Record<PoiType, string>> = {
  blackHole: "A collapsed mass warping light into a thin accretion ring.",
  derelict: "Abandoned structure adrift — no active traffic control.",
  neutronStar: "City-sized remnant spinning with a fierce magnetic field.",
  brownDwarf: "Failed star: too cool to sustain fusion, still faintly warm.",
  roguePlanet: "A free-floating world with no host sun.",
  nebula: "A discrete glowing cloud — leftover gas from a dead star.",
};

/** Build lightweight system directory from seed (no shared continuous space). */
export function generateSystemBlueprint(
  galaxy: Galaxy,
  poiId: number,
): SystemBlueprint {
  const ref = galaxy.get(poiId);
  if (ref.type !== "starSystem") {
    throw new Error(`POI ${poiId} is not a star system`);
  }
  const starClass = ref.starClass ?? "M";
  const rng = mulberry32(hash2(GALAXY.seed, poiId * 7919 + 42));

  const range = SYSTEM.bodyCountByStar[starClass];
  const bodyCount = range.min + ((rng() * (range.max - range.min + 1)) | 0);

  const bodies: SystemBodyRef[] = [
    {
      id: 0,
      name: `${ref.name} (${starClass})`,
      kind: "star",
      orbitIndex: null,
      stationCount: rng() < SYSTEM.starStationChance ? 1 : 0,
    },
  ];

  // Decide which mid slot (if any) is an asteroid belt
  let beltSlot: number | null = null;
  if (bodyCount >= 3 && rng() < SYSTEM.asteroidBeltChance) {
    beltSlot = 1 + ((rng() * (bodyCount - 2)) | 0);
  }

  const canHabitable = (SYSTEM.habitableCapable as readonly string[]).includes(
    starClass,
  );

  for (let i = 0; i < bodyCount; i += 1) {
    const kind = classifyOrbit(i, bodyCount, beltSlot, canHabitable);
    const pname = PLANET_NAMES[(poiId * 3 + i) % PLANET_NAMES.length]!;
    const label = bodyLabel(pname, kind);

    let stationCount = 0;
    if (kind === "asteroidBelt") {
      stationCount = 0;
    } else if (kind === "gasGiant") {
      stationCount = rng() < SYSTEM.gasGiantStationChance ? 1 : 0;
    } else {
      stationCount = rng() < SYSTEM.planetStationChance ? 1 : 0;
    }

    bodies.push({
      id: bodies.length,
      name: label,
      kind,
      orbitIndex: i,
      stationCount,
    });
  }

  return {
    poiId: ref.id,
    name: ref.name,
    starClass,
    bodies,
  };
}

/**
 * Distance-driven classification: inner heat → temperate → outer cold.
 * Asteroid belts occupy a reserved mid slot when the system rolls one.
 */
function classifyOrbit(
  index: number,
  count: number,
  beltSlot: number | null,
  canHabitable: boolean,
): OrbitBodyKind {
  if (beltSlot !== null && index === beltSlot) return "asteroidBelt";

  if (count === 1) {
    return canHabitable ? "habitable" : "rocky";
  }

  const t = index / (count - 1);

  if (t < 0.18) return "molten";
  if (t < 0.4) {
    // Habitable band sits in the warm-rocky region for capable stars
    if (canHabitable && t >= 0.22 && t < 0.38) return "habitable";
    return "rocky";
  }
  if (t < 0.72) return "gasGiant";
  return "ice";
}

function bodyLabel(base: string, kind: OrbitBodyKind): string {
  switch (kind) {
    case "molten":
      return `${base} (molten)`;
    case "habitable":
      return `${base} (habitable)`;
    case "rocky":
      return `${base} (rocky)`;
    case "asteroidBelt":
      return `${base} Belt`;
    case "gasGiant":
      return `${base} (gas)`;
    case "ice":
      return `${base} (ice)`;
  }
}

export function generateLocalView(
  galaxy: Galaxy,
  poiId: number,
  bodyId: number | null = null,
): LocalView {
  const ref = galaxy.get(poiId);
  const rng = mulberry32(
    hash2(GALAXY.seed, poiId * 7919 + 42 + (bodyId ?? 0) * 131),
  );

  if (ref.type === "starSystem") {
    const blueprint = generateSystemBlueprint(galaxy, poiId);
    const bid = bodyId ?? 0;
    const host =
      blueprint.bodies.find((b) => b.id === bid) ?? blueprint.bodies[0]!;
    return buildHostLocalView(ref.id, ref.name, host, blueprint, rng);
  }

  return buildExoticaView(ref.id, ref.name, ref.type, rng);
}

function buildHostLocalView(
  poiId: number,
  poiName: string,
  host: SystemBodyRef,
  blueprint: SystemBlueprint,
  rng: () => number,
): LocalView {
  const focus = makeFocusLandmark(host, blueprint.starClass, rng);
  const companions = makeStations(host, rng);

  return {
    poiId,
    poiName,
    poiType: "starSystem",
    bodyId: host.id,
    locationName: host.name,
    starClass: blueprint.starClass,
    focus,
    companions,
    systemBodies: blueprint.bodies,
    pirate: pirateSpawnFor(poiId, host.id),
  };
}

function makeFocusLandmark(
  host: SystemBodyRef,
  starClass: StarClass,
  rng: () => number,
): Landmark {
  if (host.kind === "star") {
    const scale = STARS.radiusScale[starClass];
    return {
      id: 0,
      name: host.name,
      kind: "star",
      x: 0,
      y: 0,
      radius: LOCAL.starRadiusBase * scale,
    };
  }

  const base =
    LOCAL.planetRadiusMin +
    rng() * (LOCAL.planetRadiusMax - LOCAL.planetRadiusMin);

  let radius = base;
  if (host.kind === "gasGiant") radius = base * LOCAL.gasGiantScale;
  if (host.kind === "ice") radius = base * LOCAL.iceScale;
  if (host.kind === "molten") radius = base * LOCAL.moltenScale;
  if (host.kind === "asteroidBelt") radius = LOCAL.beltSpan;

  return {
    id: 0,
    name: host.name,
    kind: host.kind,
    x: 0,
    y: 0,
    radius,
  };
}

function makeStations(host: SystemBodyRef, rng: () => number): Landmark[] {
  const companions: Landmark[] = [];
  for (let i = 0; i < host.stationCount; i += 1) {
    const a = rng() * Math.PI * 2;
    const d =
      LOCAL.stationOrbitMin +
      rng() * (LOCAL.stationOrbitMax - LOCAL.stationOrbitMin);
    const clean = host.name.replace(/ \([^)]+\)$/, "").replace(/ Belt$/, "");
    companions.push({
      id: i + 1,
      name: `${clean} Station`,
      kind: "station",
      x: Math.cos(a) * d,
      y: Math.sin(a) * d,
      radius: LOCAL.stationRadius,
    });
  }
  return companions;
}

function buildExoticaView(
  poiId: number,
  name: string,
  type: PoiType,
  rng: () => number,
): LocalView {
  const focus = exoticaFocus(name, type, rng);
  const companions: Landmark[] = [];

  if (type === "derelict") {
    // Visual debris field is drawn around the hulk; no separate landmarks needed
  }

  if (type === "nebula") {
    // Sparse wisps as companions
    for (let i = 0; i < 5; i += 1) {
      const a = rng() * Math.PI * 2;
      const d = 60 + rng() * 180;
      companions.push({
        id: i + 1,
        name: "Wisp",
        kind: "debris",
        x: Math.cos(a) * d,
        y: Math.sin(a) * d,
        radius: 12 + rng() * 20,
      });
    }
  }

  return {
    poiId,
    poiName: name,
    poiType: type,
    bodyId: null,
    locationName: name,
    blurb: POI_BLURBS[type],
    focus,
    companions,
    systemBodies: null,
    pirate: pirateSpawnFor(poiId, null),
  };
}

function exoticaFocus(name: string, type: PoiType, rng: () => number): Landmark {
  switch (type) {
    case "blackHole":
      return {
        id: 0,
        name,
        kind: "blackHole",
        x: 0,
        y: 0,
        radius: 28 + rng() * 10,
      };
    case "neutronStar":
      return {
        id: 0,
        name,
        kind: "neutronStar",
        x: 0,
        y: 0,
        radius: 22 + rng() * 8,
      };
    case "brownDwarf":
      return {
        id: 0,
        name,
        kind: "brownDwarf",
        x: 0,
        y: 0,
        radius: 32 + rng() * 10,
      };
    case "roguePlanet":
      return {
        id: 0,
        name,
        kind: "roguePlanet",
        x: 0,
        y: 0,
        radius: 28 + rng() * 12,
      };
    case "nebula":
      return {
        id: 0,
        name,
        kind: "nebula",
        x: 0,
        y: 0,
        radius: 70 + rng() * 30,
      };
    case "derelict":
      return {
        id: 0,
        name,
        kind: "derelict",
        x: 0,
        y: 0,
        radius: 40 + rng() * 18,
      };
    default:
      return {
        id: 0,
        name,
        kind: "derelict",
        x: 0,
        y: 0,
        radius: 30,
      };
  }
}

export function bodyColor(kind: Landmark["kind"]): string {
  switch (kind) {
    case "molten":
      return BODY_COLORS.molten;
    case "habitable":
      return BODY_COLORS.habitable;
    case "rocky":
      return BODY_COLORS.rocky;
    case "gasGiant":
      return BODY_COLORS.gasGiant;
    case "ice":
      return BODY_COLORS.ice;
    case "asteroidBelt":
      return BODY_COLORS.asteroidBelt;
    default:
      return "#aaa";
  }
}
