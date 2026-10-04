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

/** Heat / distress band. Mapped onto a hull archetype at spawn. */
export type NpcBandId = "scout" | "raider" | "gunship" | "corsair";

/** One pirate loadout per purchasable (and starter) hull. */
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

const BAND_POOLS: Record<NpcBandId, readonly PirateArchetypeId[]> = {
  scout: ["sparrow", "pathfinder", "courier"],
  raider: ["prospector", "interceptor", "liner"],
  gunship: ["hauler", "raider", "liner"],
  corsair: ["bulwark", "raider"],
};

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
    fill: hull.fill,
    stroke: spec.role === "patrol" ? "#8ec6ff" : hull.stroke,
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
 * One of each hull. Slot count is the hull's, so a 1-slot hull fires one
 * family, Interceptor and Raider mix two, and Bulwark runs all three.
 * Drives are the factory coil for that hull.
 */
const PIRATE_SPECS: readonly FitSpec[] = [
  {
    id: "sparrow",
    hullId: "sparrow",
    weaponIds: ["gun_mk1"],
    utilityIds: ["light_shield"],
    role: "pirate",
  },
  {
    id: "pathfinder",
    hullId: "pathfinder",
    weaponIds: ["missile_mk1"],
    utilityIds: ["light_shield"],
    role: "pirate",
  },
  {
    id: "courier",
    hullId: "courier",
    weaponIds: ["gun_mk2"],
    utilityIds: ["light_shield"],
    role: "pirate",
  },
  {
    id: "prospector",
    hullId: "prospector",
    weaponIds: ["cannon_mk1"],
    utilityIds: ["light_shield"],
    role: "pirate",
  },
  {
    id: "hauler",
    hullId: "hauler",
    weaponIds: ["cannon_mk2"],
    utilityIds: ["medium_shield", "hull_plating"],
    role: "pirate",
  },
  {
    id: "liner",
    hullId: "liner",
    weaponIds: ["missile_mk2"],
    utilityIds: ["medium_shield"],
    role: "pirate",
  },
  {
    id: "interceptor",
    hullId: "interceptor",
    weaponIds: ["gun_mk1", "cannon_mk1"],
    utilityIds: ["light_shield"],
    role: "pirate",
  },
  {
    id: "raider",
    hullId: "raider",
    weaponIds: ["gun_mk2", "missile_mk1"],
    utilityIds: ["light_shield", "hull_plating"],
    role: "pirate",
  },
  {
    id: "bulwark",
    hullId: "bulwark",
    weaponIds: ["cannon_mk2", "gun_mk2", "missile_mk2"],
    utilityIds: ["medium_shield", "reinforced_hull"],
    role: "pirate",
  },
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

const PIRATE_BY_ID: Record<PirateArchetypeId, ResolvedNpcFit> = {
  sparrow: PIRATE_FITS[0]!,
  pathfinder: PIRATE_FITS[1]!,
  courier: PIRATE_FITS[2]!,
  prospector: PIRATE_FITS[3]!,
  hauler: PIRATE_FITS[4]!,
  liner: PIRATE_FITS[5]!,
  interceptor: PIRATE_FITS[6]!,
  raider: PIRATE_FITS[7]!,
  bulwark: PIRATE_FITS[8]!,
};

export function pirateFit(id: PirateArchetypeId): ResolvedNpcFit {
  return PIRATE_BY_ID[id];
}

export function archetypeForBand(
  band: NpcBandId,
  rng: () => number,
): PirateArchetypeId {
  const pool = BAND_POOLS[band];
  const index = Math.floor(rng() * pool.length) % pool.length;
  return pool[index]!;
}

/** Stable per station key hash — neighboring stations can field different hulls. */
export function patrolFitForStation(stationKeyHash: number): ResolvedNpcFit {
  const index = stationKeyHash % PATROL_FITS.length;
  return PATROL_FITS[index]!;
}
