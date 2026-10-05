/**
 * Pirate and patrol fits. Same purchasable hulls and kinetic modules as the
 * player: weapon slot count is the hull's, shields then plating then core,
 * and shield-break downtime is the shortest equipped shield module.
 *
 * NPCs do not spend magazines. A cannon's eight-round belt would go silent
 * on a lingering patrol, so ammo is unlimited. Cooldown, damage, shield
 * multiplier, spread, tracking, and time-on-target are the module's.
 */

import { hullById, type HullDef } from "./hulls";
import {
  moduleById,
  type DriveModule,
  type UtilityModule,
  type WeaponModule,
} from "./equipment";

/** Purchasable hulls pirates and patrols can fly. */
export type PirateArchetypeId =
  | "sparrow"
  | "pathfinder"
  | "courier"
  | "prospector"
  | "hauler"
  | "liner"
  | "interceptor"
  | "raider"
  | "bulwark";

export interface NpcWeaponFit {
  module: WeaponModule;
  /** Index in the hull's weapon slots. Gun streams key off this. */
  slotIndex: number;
}

export interface ResolvedNpcFit {
  id: string;
  hullId: PirateArchetypeId;
  hullName: string;
  size: number;
  radius: number;
  fill: string;
  stroke: string;
  coreMax: number;
  shieldMax: number;
  platingMax: number;
  shieldRegenDelay: number;
  shieldRegenRate: number;
  shieldBreakDowntime: number;
  weapons: NpcWeaponFit[];
  thrustAccel: number;
  maxSpeed: number;
  turnRate: number;
  drag: number;
  /** Hull cargo plus any cargo utilities. */
  cargo: number;
  /** Drive tank plus hull bonus and utility tanks. */
  fuel: number;
  /** Equipped drive's max jump. NPCs do not supercruise. */
  jump: number;
  role: "pirate" | "patrol";
}

interface FitSpec {
  id: string;
  hullId: PirateArchetypeId;
  weaponIds: readonly string[];
  utilityIds: readonly string[];
  role: "pirate" | "patrol";
}

function mustHull(id: string): HullDef {
  const hull = hullById(id);
  if (!hull) throw new Error(`npc loadout missing hull ${id}`);
  return hull;
}

function mustWeapon(id: string): WeaponModule {
  const mod = moduleById(id);
  if (!mod || mod.kind !== "weapon") {
    throw new Error(`npc loadout missing weapon ${id}`);
  }
  return mod;
}

function mustUtility(id: string): UtilityModule {
  const mod = moduleById(id);
  if (!mod || mod.kind !== "utility") {
    throw new Error(`npc loadout missing utility ${id}`);
  }
  return mod;
}

function mustDrive(id: string): DriveModule {
  const mod = moduleById(id);
  if (!mod || mod.kind !== "drive") {
    throw new Error(`npc loadout missing drive ${id}`);
  }
  return mod;
}

function factoryDriveId(hull: HullDef): string {
  const index = hull.slots.findIndex((slot) => slot.kind === "drive");
  const id = index >= 0 ? hull.defaultLoadout[index] : null;
  if (!id) throw new Error(`hull ${hull.id} has no factory drive`);
  return id;
}

function resolveFit(spec: FitSpec): ResolvedNpcFit {
  const hull = mustHull(spec.hullId);
  const weaponSlots = hull.slots.filter((slot) => slot.kind === "weapon").length;
  if (spec.weaponIds.length !== weaponSlots) {
    throw new Error(
      `${spec.id} fits ${spec.weaponIds.length} weapons on ${hull.name}, which has ${weaponSlots} weapon slots`,
    );
  }
  const utilitySlots = hull.slots.filter((slot) => slot.kind === "utility").length;
  if (spec.utilityIds.length > utilitySlots) {
    throw new Error(
      `${spec.id} fits ${spec.utilityIds.length} utilities on ${hull.name}, which has ${utilitySlots} utility slots`,
    );
  }

  const weapons = spec.weaponIds.map((id, slotIndex) => ({
    module: mustWeapon(id),
    slotIndex,
  }));
  const utilities = spec.utilityIds.map((id) => mustUtility(id));
  const drive = mustDrive(factoryDriveId(hull));
  const shields = utilities.filter((util) => util.shieldMax > 0);

  return {
    id: spec.id,
    hullId: spec.hullId,
    hullName: hull.name,
    size: hull.size,
    radius: Math.max(11, Math.round(hull.size * 0.95)),
    // Faction paint, not hull paint. Prior raider red / prior lawful patrol blue.
    fill: spec.role === "patrol" ? "#6a9ec8" : "#c45a4a",
    stroke: spec.role === "patrol" ? "#3a6a98" : "#8a3028",
    coreMax: hull.baseHull,
    shieldMax: utilities.reduce((sum, util) => sum + util.shieldMax, 0),
    platingMax: utilities.reduce((sum, util) => sum + util.hullBonus, 0),
    shieldRegenDelay:
      shields.length > 0
        ? Math.min(...shields.map((util) => util.shieldRegenDelay))
        : 0,
    shieldRegenRate: shields.reduce((sum, util) => sum + util.shieldRegenRate, 0),
    shieldBreakDowntime:
      shields.length > 0
        ? Math.min(...shields.map((util) => util.shieldBreakDowntime))
        : 0,
    weapons,
    thrustAccel: drive.thrustAccel,
    maxSpeed: drive.maxSpeed,
    turnRate: drive.turnRate,
    drag: drive.drag,
    cargo:
      hull.baseCargo +
      utilities.reduce((sum, util) => sum + util.cargoCapacity, 0),
    fuel:
      drive.fuelCapacity +
      hull.fuelCapacityBonus +
      utilities.reduce((sum, util) => sum + util.fuelCapacity, 0),
    jump: drive.maxJumpRange,
    role: spec.role,
  };
}

/**
 * Pirate ship fits. Several recipes share hulls with different weapons and
 * defense. Slot count is always the hull's. NPCs still do not spend ammo.
 *
 * Small (1 weapon): Sparrow, Courier, Prospector, Pathfinder.
 * Bulky (1 weapon, counts as large): Hauler, Liner.
 * Multi-weapon: Interceptor 2, Raider 2, Bulwark 3.
 */
const PIRATE_SPECS: readonly FitSpec[] = [
  { id: "sp-gun1", hullId: "sparrow", weaponIds: ["gun_mk1"], utilityIds: [], role: "pirate" },
  { id: "co-gun1-s", hullId: "courier", weaponIds: ["gun_mk1"], utilityIds: ["light_shield"], role: "pirate" },
  { id: "pf-mis1-s", hullId: "pathfinder", weaponIds: ["missile_mk1"], utilityIds: ["light_shield"], role: "pirate" },
  { id: "pr-can1-p", hullId: "prospector", weaponIds: ["cannon_mk1"], utilityIds: ["hull_plating"], role: "pirate" },
  { id: "co-gun2-s", hullId: "courier", weaponIds: ["gun_mk2"], utilityIds: ["light_shield"], role: "pirate" },
  { id: "pf-mis2", hullId: "pathfinder", weaponIds: ["missile_mk2"], utilityIds: [], role: "pirate" },
  { id: "sp-can1-sp", hullId: "sparrow", weaponIds: ["cannon_mk1"], utilityIds: ["light_shield", "hull_plating"], role: "pirate" },
  { id: "co-mis1-s", hullId: "courier", weaponIds: ["missile_mk1"], utilityIds: ["light_shield"], role: "pirate" },
  { id: "rd-g1m1-s", hullId: "raider", weaponIds: ["gun_mk1", "missile_mk1"], utilityIds: ["light_shield"], role: "pirate" },
  { id: "in-c1g1-p", hullId: "interceptor", weaponIds: ["cannon_mk1", "gun_mk1"], utilityIds: ["hull_plating"], role: "pirate" },
  { id: "ha-can1", hullId: "hauler", weaponIds: ["cannon_mk1"], utilityIds: [], role: "pirate" },
  { id: "ln-mis1-p", hullId: "liner", weaponIds: ["missile_mk1"], utilityIds: ["hull_plating"], role: "pirate" },
  { id: "pf-gun2-s", hullId: "pathfinder", weaponIds: ["gun_mk2"], utilityIds: ["light_shield"], role: "pirate" },
  { id: "rd-g2c2-s2p1", hullId: "raider", weaponIds: ["gun_mk2", "cannon_mk2"], utilityIds: ["medium_shield", "hull_plating"], role: "pirate" },
  { id: "rd-m2g2-s2p1", hullId: "raider", weaponIds: ["missile_mk2", "gun_mk2"], utilityIds: ["medium_shield", "hull_plating"], role: "pirate" },
  { id: "ha-can2-s", hullId: "hauler", weaponIds: ["cannon_mk2"], utilityIds: ["light_shield"], role: "pirate" },
  { id: "bw-all1-s", hullId: "bulwark", weaponIds: ["cannon_mk1", "gun_mk1", "missile_mk1"], utilityIds: ["light_shield"], role: "pirate" },
  { id: "rd-g2m2-s2p2", hullId: "raider", weaponIds: ["gun_mk2", "missile_mk2"], utilityIds: ["medium_shield", "reinforced_hull"], role: "pirate" },
  { id: "ln-mis2-s2", hullId: "liner", weaponIds: ["missile_mk2"], utilityIds: ["medium_shield"], role: "pirate" },
  { id: "pf-gun2-p", hullId: "pathfinder", weaponIds: ["gun_mk2"], utilityIds: ["hull_plating"], role: "pirate" },
  { id: "bw-all1-sp", hullId: "bulwark", weaponIds: ["cannon_mk1", "gun_mk1", "missile_mk1"], utilityIds: ["light_shield", "hull_plating"], role: "pirate" },
  { id: "rd-g3c2-s2p2", hullId: "raider", weaponIds: ["gun_mk3", "cannon_mk2"], utilityIds: ["medium_shield", "reinforced_hull"], role: "pirate" },
  { id: "ha-can2-s2p1", hullId: "hauler", weaponIds: ["cannon_mk2"], utilityIds: ["medium_shield", "hull_plating"], role: "pirate" },
  { id: "sp-mis2-s", hullId: "sparrow", weaponIds: ["missile_mk2"], utilityIds: ["light_shield"], role: "pirate" },
  { id: "bw-all2-sp", hullId: "bulwark", weaponIds: ["cannon_mk2", "gun_mk2", "missile_mk2"], utilityIds: ["light_shield", "hull_plating"], role: "pirate" },
  { id: "rd-g3c3-s2p2", hullId: "raider", weaponIds: ["gun_mk3", "cannon_mk3"], utilityIds: ["medium_shield", "reinforced_hull"], role: "pirate" },
  { id: "ha-can3-s2p1", hullId: "hauler", weaponIds: ["cannon_mk3"], utilityIds: ["medium_shield", "hull_plating"], role: "pirate" },
  { id: "co-mis2-s", hullId: "courier", weaponIds: ["missile_mk2"], utilityIds: ["light_shield"], role: "pirate" },
];

/**
 * Station defenders. Same three hulls pirates can fly, with thicker shields
 * and plating and higher weapon marks. They do not flee.
 * Interceptor has one utility bay, so the patrol fit is a Dual Lattice
 * (shield and plating in that single slot). Heavy Shield also adds 1 plating,
 * so the Hauler and Bulwark fits include that bonus.
 */
const PATROL_SPECS: readonly FitSpec[] = [
  {
    id: "patrol_interceptor",
    hullId: "interceptor",
    weaponIds: ["gun_mk2", "cannon_mk2"],
    utilityIds: ["dual_lattice"],
    role: "patrol",
  },
  {
    id: "patrol_hauler",
    hullId: "hauler",
    weaponIds: ["cannon_mk3"],
    utilityIds: ["heavy_shield", "reinforced_hull"],
    role: "patrol",
  },
  {
    id: "patrol_bulwark",
    hullId: "bulwark",
    weaponIds: ["cannon_mk3", "gun_mk3", "missile_mk2"],
    utilityIds: ["heavy_shield", "fortress_plating"],
    role: "patrol",
  },
];

const PIRATE_FITS = PIRATE_SPECS.map(resolveFit);
const PATROL_FITS = PATROL_SPECS.map(resolveFit);

const PIRATE_BY_ID = new Map(PIRATE_FITS.map((fit) => [fit.id, fit]));

export type PirateDifficulty = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** One pack at a difficulty. Ship ids are pirate fit ids. */
const RECIPES: readonly { difficulty: PirateDifficulty; ships: readonly string[] }[] = [
  // 1 — one small, Mk I, shield or plating or neither.
  { difficulty: 1, ships: ["sp-gun1"] },
  { difficulty: 1, ships: ["co-gun1-s"] },
  { difficulty: 1, ships: ["pf-mis1-s"] },
  { difficulty: 1, ships: ["pr-can1-p"] },
  // 2 — one better small, or two difficulty-1 ships.
  { difficulty: 2, ships: ["co-gun2-s"] },
  { difficulty: 2, ships: ["pf-mis2"] },
  { difficulty: 2, ships: ["sp-can1-sp"] },
  { difficulty: 2, ships: ["sp-gun1", "pf-mis1-s"] },
  // 3 — one multi with one defense, or a poor bulky plus smalls.
  { difficulty: 3, ships: ["rd-g1m1-s"] },
  { difficulty: 3, ships: ["in-c1g1-p"] },
  { difficulty: 3, ships: ["ha-can1", "sp-gun1", "co-mis1-s"] },
  { difficulty: 3, ships: ["ln-mis1-p", "pf-gun2-s"] },
  // 4 — multi with Mk II weapons and both defense layers, or bulky plus a better small.
  { difficulty: 4, ships: ["rd-g2c2-s2p1"] },
  { difficulty: 4, ships: ["rd-m2g2-s2p1"] },
  { difficulty: 4, ships: ["ha-can2-s", "co-gun2-s"] },
  // 5 — Bulwark enters on a thin shield, or the raider's plating steps up, or the bulky shield does.
  { difficulty: 5, ships: ["bw-all1-s"] },
  { difficulty: 5, ships: ["rd-g2m2-s2p2"] },
  { difficulty: 5, ships: ["ln-mis2-s2", "pf-gun2-p"] },
  // 6 — one layer or one mark on the previous step.
  { difficulty: 6, ships: ["bw-all1-sp"] },
  { difficulty: 6, ships: ["rd-g3c2-s2p2"] },
  { difficulty: 6, ships: ["ha-can2-s2p1", "sp-mis2-s"] },
  // 7 — one more mark. A kitted player can still fight a single top ship.
  { difficulty: 7, ships: ["bw-all2-sp"] },
  { difficulty: 7, ships: ["rd-g3c3-s2p2"] },
  { difficulty: 7, ships: ["ha-can3-s2p1", "co-mis2-s"] },
];

const MULTI_HULLS = new Set<PirateArchetypeId>(["interceptor", "raider", "bulwark"]);

function assertRecipes(): void {
  const seen = new Set<string>();
  for (const fit of PIRATE_FITS) {
    if (seen.has(fit.id)) throw new Error(`duplicate pirate fit ${fit.id}`);
    seen.add(fit.id);
  }
  for (const recipe of RECIPES) {
    if (recipe.ships.length < 1 || recipe.ships.length > 4) {
      throw new Error(`pirate recipe pack size ${recipe.ships.length}`);
    }
    for (const id of recipe.ships) {
      const fit = PIRATE_BY_ID.get(id);
      if (!fit) throw new Error(`recipe missing fit ${id}`);
      if (recipe.difficulty >= 3 && MULTI_HULLS.has(fit.hullId)) {
        if (fit.shieldMax <= 0 && fit.platingMax <= 0) {
          throw new Error(`${id} is a multi-weapon ship with no defense`);
        }
      }
    }
  }
  for (let d = 1; d <= 7; d += 1) {
    const at = RECIPES.filter((recipe) => recipe.difficulty === d);
    if (at.length < 3) throw new Error(`difficulty ${d} needs several recipes`);
    if (!at.some((recipe) => recipe.ships.length === 1)) {
      throw new Error(`difficulty ${d} needs a one-ship recipe`);
    }
  }
}

assertRecipes();

export function pirateFitById(id: string): ResolvedNpcFit {
  const fit = PIRATE_BY_ID.get(id);
  if (!fit) throw new Error(`unknown pirate fit ${id}`);
  return fit;
}

function pickWeighted(weights: readonly number[], rng: () => number): number {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = rng() * total;
  for (let i = 0; i < weights.length; i += 1) {
    roll -= weights[i]!;
    if (roll <= 0) return i;
  }
  return weights.length - 1;
}

/** Index 0 is difficulty 1. Adjacent bands share a step or two. */
const HEAT_WEIGHTS: Record<string, readonly number[]> = {
  near: [50, 34, 16, 0, 0, 0, 0],
  mid: [0, 18, 34, 32, 16, 0, 0],
  far: [0, 0, 0, 16, 34, 32, 18],
  midWealthy: [0, 0, 18, 34, 32, 16, 0],
  farWealthy: [0, 0, 0, 0, 22, 40, 38],
};

const DISTRESS_BAND_DIFFICULTY = {
  scout: [1, 1, 2],
  raider: [2, 3, 4],
  gunship: [4, 5, 6],
  corsair: [5, 6, 7],
} as const;

export function rollHeatDifficulty(
  band: "near" | "mid" | "far",
  wealthy: boolean,
  rng: () => number,
): PirateDifficulty {
  const key = wealthy && band !== "near" ? `${band}Wealthy` : band;
  const index = pickWeighted(HEAT_WEIGHTS[key]!, rng);
  return (index + 1) as PirateDifficulty;
}

export function rollDistressDifficulty(
  weights: { scout: number; raider: number; gunship: number; corsair: number },
  rng: () => number,
): PirateDifficulty {
  const bands = ["scout", "raider", "gunship", "corsair"] as const;
  const bandIndex = pickWeighted(
    bands.map((band) => Math.max(0, weights[band])),
    rng,
  );
  const options = DISTRESS_BAND_DIFFICULTY[bands[bandIndex]!];
  return options[Math.floor(rng() * options.length) % options.length]!;
}

export function rollPassengerDifficulty(
  passengers: number,
  rng: () => number,
): PirateDifficulty {
  const table =
    passengers <= 1
      ? [1, 1, 2]
      : passengers === 2
        ? [2, 2, 3]
        : passengers === 3
          ? [3, 4, 4]
          : [4, 5, 6];
  return table[Math.floor(rng() * table.length) % table.length] as PirateDifficulty;
}

export function pirateRecipeFits(
  difficulty: PirateDifficulty,
  rng: () => number,
  solo = false,
): ResolvedNpcFit[] {
  const pool = RECIPES.filter(
    (recipe) =>
      recipe.difficulty === difficulty && (!solo || recipe.ships.length === 1),
  );
  const recipe = pool[Math.floor(rng() * pool.length) % pool.length]!;
  return recipe.ships.map((id) => pirateFitById(id));
}

/** Stable per station key hash — neighboring stations can field different hulls. */
export function patrolFitForStation(stationKeyHash: number): ResolvedNpcFit {
  const index = stationKeyHash % PATROL_FITS.length;
  return PATROL_FITS[index]!;
}
