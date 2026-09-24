import { GALAXY, STARS } from "../game/config";
import { hash2, mulberry32 } from "./rng";
import type { PoiRef, PoiType, StarClass } from "./types";

const STAR_PREFIXES = [
  "Lave",
  "Zaonce",
  "Isinor",
  "Tionisla",
  "Reorte",
  "Orarra",
  "Diso",
  "Leesti",
  "Riedquat",
  "Uszaa",
  "Quorte",
  "Anle",
  "Bemaera",
  "Esbira",
  "Artemis",
  "Sol",
  "Vega",
  "Rigel",
  "Deneb",
  "Altair",
  "Sirius",
  "Procyon",
  "Kepler",
  "Auriga",
  "Lyra",
  "Cygnus",
  "Eridan",
  "Hydra",
  "Persei",
];

const STAR_SUFFIXES = [
  "",
  " Prime",
  " Minor",
  " Major",
  " Reach",
  " Gate",
  " Rim",
  " Expanse",
  " Haven",
];

const STAR_CLASSES: StarClass[] = ["O", "B", "A", "F", "G", "K", "M"];

function catalogSkyId(rng: () => number): string {
  const raH = (rng() * 24) | 0;
  const raM = (rng() * 60) | 0;
  const sign = rng() < 0.5 ? "+" : "-";
  const decD = (rng() * 90) | 0;
  const decM = (rng() * 60) | 0;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(raH)}${p(raM)}${sign}${p(decD)}${p(decM)}`;
}

export class Galaxy {
  readonly pois: readonly PoiRef[];

  constructor(seed: number = GALAXY.seed, count: number = GALAXY.poiCount) {
    this.pois = buildPois(seed, count);
  }

  get(id: number): PoiRef {
    const poi = this.pois[id];
    if (!poi) throw new Error(`Unknown POI id ${id}`);
    return poi;
  }

  distance(a: PoiRef, b: PoiRef): number {
    return Math.hypot(a.chartX - b.chartX, a.chartY - b.chartY);
  }

  poisInRange(fromId: number, range: number): PoiRef[] {
    const from = this.get(fromId);
    return this.pois.filter(
      (p) => p.id !== fromId && this.distance(from, p) <= range,
    );
  }
}

function shuffleInPlace<T>(arr: T[], rng: () => number): void {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = (rng() * (i + 1)) | 0;
    const tmp = arr[i]!;
    arr[i] = arr[j]!;
    arr[j] = tmp;
  }
}

function buildForcedTypes(count: number, rng: () => number): PoiType[] {
  const { rarity } = GALAXY;
  const types: PoiType[] = ["starSystem"];
  const remaining: PoiType[] = [];
  const push = (t: PoiType, n: number) => {
    for (let i = 0; i < n; i += 1) remaining.push(t);
  };
  push("starSystem", rarity.starSystem - 1);
  push("derelict", rarity.derelict);
  push("brownDwarf", rarity.brownDwarf);
  push("neutronStar", rarity.neutronStar);
  push("roguePlanet", rarity.roguePlanet);
  push("nebula", rarity.nebula);
  push("blackHole", rarity.blackHole);
  shuffleInPlace(remaining, rng);
  const out = types.concat(remaining);
  while (out.length < count) out.push("starSystem");
  return out.slice(0, count);
}

/** Weighted star classes with rarity floors for the starter cluster. */
function buildStarClasses(starSystemCount: number, rng: () => number): StarClass[] {
  // Floors first (excluding start slot, forced G), then weighted fill
  const remainingSlots = starSystemCount - 1;
  const pool: StarClass[] = [];

  for (const c of STAR_CLASSES) {
    const floor = STARS.floors[c];
    for (let i = 0; i < floor; i += 1) pool.push(c);
  }

  while (pool.length < remainingSlots) {
    pool.push(pickWeightedStar(rng));
  }
  while (pool.length > remainingSlots) pool.pop();
  shuffleInPlace(pool, rng);

  return [STARS.startClass, ...pool];
}

function pickWeightedStar(rng: () => number): StarClass {
  const entries = STAR_CLASSES.map((c) => ({ c, w: STARS.weights[c] }));
  const total = entries.reduce((s, e) => s + e.w, 0);
  let r = rng() * total;
  for (const e of entries) {
    r -= e.w;
    if (r <= 0) return e.c;
  }
  return "M";
}

function buildPois(seed: number, count: number): PoiRef[] {
  const rng = mulberry32(seed);
  const spread = GALAXY.chartSpread;
  const minSep = GALAXY.minSeparation;
  const forced = buildForcedTypes(count, rng);
  const starCount = forced.filter((t) => t === "starSystem").length;
  const starClasses = buildStarClasses(starCount, rng);
  let starCursor = 0;

  const pois: PoiRef[] = [];
  let attempts = 0;
  const maxAttempts = count * 80;

  while (pois.length < count && attempts < maxAttempts) {
    attempts += 1;
    const chartX = (rng() * 2 - 1) * spread;
    const chartY = (rng() * 2 - 1) * spread;

    let ok = true;
    for (const other of pois) {
      if (Math.hypot(chartX - other.chartX, chartY - other.chartY) < minSep) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const id = pois.length;
    const type = forced[id]!;
    let starClass: StarClass | undefined;
    if (type === "starSystem") {
      starClass = starClasses[starCursor] ?? pickWeightedStar(rng);
      starCursor += 1;
    }
    pois.push(makePoi(seed, id, type, chartX, chartY, starClass));
  }

  while (pois.length < count) {
    const id = pois.length;
    const r = mulberry32(hash2(seed, id + 50000));
    const type = forced[id] ?? "starSystem";
    let starClass: StarClass | undefined;
    if (type === "starSystem") {
      starClass = starClasses[starCursor] ?? "M";
      starCursor += 1;
    }
    pois.push(
      makePoi(
        seed,
        id,
        type,
        (r() * 2 - 1) * spread,
        (r() * 2 - 1) * spread,
        starClass,
      ),
    );
  }

  return pois;
}

function makePoi(
  seed: number,
  id: number,
  type: PoiType,
  chartX: number,
  chartY: number,
  starClass?: StarClass,
): PoiRef {
  const nameRng = mulberry32(hash2(seed, id * 9973 + 1));

  if (type === "starSystem") {
    const prefix = STAR_PREFIXES[(nameRng() * STAR_PREFIXES.length) | 0]!;
    const suffix = STAR_SUFFIXES[(nameRng() * STAR_SUFFIXES.length) | 0]!;
    return {
      id,
      name: `${prefix}${suffix}`,
      type,
      chartX,
      chartY,
      starClass: starClass ?? "M",
    };
  }

  if (type === "derelict") {
    const serial = 100 + ((nameRng() * 900) | 0);
    const kinds = ["Hull", "Relay", "Drydock", "Hab", "Probe", "Tanker"];
    const kind = kinds[(nameRng() * kinds.length) | 0]!;
    return {
      id,
      name: `${kind} Remnant ${serial}`,
      type,
      chartX,
      chartY,
    };
  }

  if (type === "neutronStar") {
    return {
      id,
      name: `PSR J${catalogSkyId(nameRng)}`,
      type,
      chartX,
      chartY,
    };
  }

  if (type === "brownDwarf") {
    return {
      id,
      name: `WISE J${catalogSkyId(nameRng)}`,
      type,
      chartX,
      chartY,
    };
  }

  if (type === "roguePlanet") {
    return {
      id,
      name: `PSO J${catalogSkyId(nameRng)}`,
      type,
      chartX,
      chartY,
    };
  }

  if (type === "nebula") {
    const ngc = 1000 + ((nameRng() * 7000) | 0);
    return {
      id,
      name: `NGC ${ngc}`,
      type,
      chartX,
      chartY,
    };
  }

  // black hole — X-ray / radio source style
  return {
    id,
    name: `CXOU J${catalogSkyId(nameRng)}`,
    type: "blackHole",
    chartX,
    chartY,
  };
}
