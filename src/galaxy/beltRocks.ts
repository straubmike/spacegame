import { LOCAL, SCOOP } from "../game/config";

export type RockYieldId =
  | "minerals"
  | "alloys"
  | "precious_metals"
  /** Mission-only derelict debris lot (Retrieve Derelict Cargo). */
  | "derelict_cargo";

export interface BeltRock {
  id: number;
  x: number;
  y: number;
  r: number;
  /** null = barren scenery (not scoopable). */
  yieldId: RockYieldId | null;
  /** Remaining CU; 0 when depleted. */
  remaining: number;
}

/**
 * Seeded belt rocks shared by render + scoop gameplay.
 * Placement uses the same unit-hash as the former draw-only belt scatter.
 */
export function generateBeltRocks(
  focusX: number,
  focusY: number,
  span: number,
  seed: number,
): BeltRock[] {
  const target = LOCAL.beltRockCount;
  const halfLen = span;
  const halfThick = LOCAL.beltThickness;
  const falloff = LOCAL.beltDensityFalloff;
  const minGap = LOCAL.beltMinGap;
  const tilt = -0.06 + unitHash(seed, 0) * 0.12;
  const cos = Math.cos(tilt);
  const sin = Math.sin(tilt);

  const rocks: BeltRock[] = [];
  let attempts = 0;
  const maxAttempts = target * 40;

  while (rocks.length < target && attempts < maxAttempts) {
    const h1 = unitHash(seed, attempts * 3 + 1);
    const h2 = unitHash(seed, attempts * 3 + 2);
    const h3 = unitHash(seed, attempts * 3 + 3);
    attempts += 1;

    const t = h1 * 2 - 1;
    const along = Math.sign(t) * Math.pow(Math.abs(t), falloff) * halfLen;
    const wing = 0.55 + 0.45 * (1 - Math.abs(along) / halfLen);
    const across = (h2 - 0.5) * 2 * halfThick * wing;
    const bow = (along / halfLen) * (along / halfLen) * halfThick * 0.12;
    const rx = focusX + along * cos - (across + bow) * sin;
    const ry = focusY + along * sin + (across + bow) * cos;
    const size = 1.0 + h3 * 2.4;

    let ok = true;
    for (const p of rocks) {
      const need = p.r + size + minGap;
      if (Math.hypot(rx - p.x, ry - p.y) < need) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    const yieldRoll = unitHash(seed, attempts * 7 + 99);
    let yieldId: RockYieldId | null = null;
    let remaining = 0;
    if (yieldRoll < SCOOP.richRockChance) {
      const kindRoll = unitHash(seed, attempts * 11 + 101);
      yieldId = pickYield(kindRoll);
      const spanCu = SCOOP.rockYieldMax - SCOOP.rockYieldMin + 1;
      remaining =
        SCOOP.rockYieldMin +
        ((unitHash(seed, attempts * 13 + 103) * spanCu) | 0);
    }

    rocks.push({
      id: rocks.length,
      x: rx,
      y: ry,
      r: size,
      yieldId,
      remaining,
    });
  }

  return rocks;
}

function pickYield(roll: number): RockYieldId {
  const w = SCOOP.yieldWeights;
  if (roll < w.minerals) return "minerals";
  if (roll < w.minerals + w.alloys) return "alloys";
  return "precious_metals";
}

export function rockYieldLabel(id: RockYieldId): string {
  switch (id) {
    case "minerals":
      return "Minerals";
    case "alloys":
      return "Alloys";
    case "precious_metals":
      return "Precious Metals";
    case "derelict_cargo":
      return "Sensitive Derelict Cargo";
  }
}

/**
 * Seeded debris cloud around a derelict hulk — same survey/scoop feel as belts.
 * Rocks start barren; Game tags one scoopable lot when a Retrieve Derelict Cargo
 * contract targets this POI.
 */
export function generateDerelictDebris(
  focusX: number,
  focusY: number,
  hulkRadius: number,
  seed: number,
): BeltRock[] {
  const target = SCOOP.derelictDebrisCount;
  const inner = hulkRadius * 2.5;
  const outer = hulkRadius * 9.5;
  const minGap = 12;
  const rocks: BeltRock[] = [];
  let attempts = 0;
  const maxAttempts = target * 50;

  while (rocks.length < target && attempts < maxAttempts) {
    const h1 = unitHash(seed, attempts * 5 + 1);
    const h2 = unitHash(seed, attempts * 5 + 2);
    const h3 = unitHash(seed, attempts * 5 + 3);
    attempts += 1;

    const a = h1 * Math.PI * 2;
    const d = inner + h2 * (outer - inner);
    const rx = focusX + Math.cos(a) * d;
    const ry = focusY + Math.sin(a) * d;
    const size = 1.2 + h3 * 2.8;

    let ok = true;
    for (const p of rocks) {
      if (Math.hypot(rx - p.x, ry - p.y) < p.r + size + minGap) {
        ok = false;
        break;
      }
    }
    if (!ok) continue;

    rocks.push({
      id: rocks.length,
      x: rx,
      y: ry,
      r: size,
      yieldId: null,
      remaining: 0,
    });
  }

  return rocks;
}

/**
 * Mark exactly one barren debris piece as the mission scoop target.
 * No-op if a derelict_cargo lot is already present (or none left barren).
 */
export function markDerelictMissionDebris(
  rocks: BeltRock[],
  seed: number,
): BeltRock | null {
  if (rocks.some((r) => r.yieldId === "derelict_cargo" && r.remaining > 0)) {
    return rocks.find((r) => r.yieldId === "derelict_cargo") ?? null;
  }
  const barren = rocks.filter((r) => r.yieldId === null || r.remaining <= 0);
  if (barren.length === 0) return null;
  const pick = barren[(unitHash(seed, 777) * barren.length) | 0]!;
  pick.yieldId = "derelict_cargo";
  pick.remaining = 1;
  return pick;
}

/** Deterministic 0–1 hash (matches Renderer belt scatter). */
function unitHash(a: number, b: number): number {
  let n = (a * 374761393 + b * 668265263) | 0;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return ((n >>> 0) % 10000) / 10000;
}
