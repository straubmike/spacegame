import {
  MODULES,
  cloneModule,
  type EquipModule,
  type ShipSlot,
  type SlotKind,
} from "./equipment";

/**
 * Special-purpose hulls — layouts and base stats matter more than cosmetics.
 * Buy / swap at station Hangar; one active ship in flight.
 */

export interface HullSlotSpec {
  kind: SlotKind;
  label: string;
}

export interface HullDef {
  id: string;
  name: string;
  /** Short role tag shown in hangar lists. */
  specialty: string;
  blurb: string;
  /** Purchase price (0 = starter; already owned). */
  price: number;
  slots: readonly HullSlotSpec[];
  /** Core hull HP. Plating modules are a separate bank and do not add to this. */
  baseHull: number;
  /** Built-in cargo CU before utility racks. */
  baseCargo: number;
  /** Added to equipped drive fuel tank. */
  fuelCapacityBonus: number;
  /** Visual / hit silhouette scale. */
  size: number;
  fill: string;
  stroke: string;
  /** Default module id per slot index; null = empty. */
  defaultLoadout: readonly (string | null)[];
}

export const HULLS = {
  sparrow: {
    id: "sparrow",
    name: "Sparrow",
    specialty: "Starter",
    blurb:
      "Light multipurpose hull. Twin utility bays so scanner + scoop (or berth) can ride together.",
    price: 0,
    slots: [
      { kind: "weapon", label: "Weapon" },
      { kind: "drive", label: "Drive" },
      { kind: "utility", label: "Utility A" },
      { kind: "utility", label: "Utility B" },
    ],
    baseHull: 10,
    baseCargo: 0,
    fuelCapacityBonus: 0,
    size: 14,
    fill: "#c8d6e8",
    stroke: "#6a8bb0",
    // Utility A: Survey Scanner so new players can take explore missions
    // without a Bay buy first; Utility B left empty for scoop/rack/etc.
    defaultLoadout: ["gun_mk1", "basic_drive", "survey_scanner", null],
  } satisfies HullDef,

  pathfinder: {
    id: "pathfinder",
    name: "Pathfinder",
    specialty: "Explorer",
    blurb:
      "Survey frame. One gun, two utilities, a long-range coil, and a deep built-in tank.",
    price: 160,
    slots: [
      { kind: "weapon", label: "Weapon" },
      { kind: "drive", label: "Drive" },
      { kind: "utility", label: "Utility A" },
      { kind: "utility", label: "Utility B" },
    ],
    baseHull: 9,
    baseCargo: 3,
    fuelCapacityBonus: 16,
    size: 14,
    fill: "#a8d4c8",
    stroke: "#4a8878",
    defaultLoadout: [
      "gun_mk1",
      "long_range_drive",
      "survey_scanner",
      "fuel_scoop",
    ],
  } satisfies HullDef,

  prospector: {
    id: "prospector",
    name: "Prospector",
    specialty: "Miner",
    blurb:
      "Belt boat. Huge built-in hold, one utility — the rig has to earn the bay.",
    price: 200,
    slots: [
      { kind: "weapon", label: "Weapon" },
      { kind: "drive", label: "Drive" },
      { kind: "utility", label: "Utility" },
    ],
    baseHull: 12,
    baseCargo: 16,
    fuelCapacityBonus: 2,
    size: 16,
    fill: "#c4b48a",
    stroke: "#7a6840",
    defaultLoadout: ["gun_mk1", "basic_drive", "prospecting_rig"],
  } satisfies HullDef,

  courier: {
    id: "courier",
    name: "Courier",
    specialty: "Passenger",
    blurb:
      "Light runner. Two berth bays, extra tank, almost no freight. One gun.",
    price: 240,
    slots: [
      { kind: "weapon", label: "Weapon" },
      { kind: "drive", label: "Drive" },
      { kind: "utility", label: "Utility A" },
      { kind: "utility", label: "Utility B" },
    ],
    baseHull: 8,
    baseCargo: 0,
    fuelCapacityBonus: 8,
    size: 13,
    fill: "#d8c8e8",
    stroke: "#786898",
    defaultLoadout: ["gun_mk1", "courier_drive", "passenger_berth_2", null],
  } satisfies HullDef,

  interceptor: {
    id: "interceptor",
    name: "Interceptor",
    specialty: "Fighter",
    blurb:
      "Glass twin-gun. Weapon A is Space, Weapon B is left click. One utility, no hold.",
    price: 340,
    slots: [
      { kind: "weapon", label: "Weapon A" },
      { kind: "weapon", label: "Weapon B" },
      { kind: "drive", label: "Drive" },
      { kind: "utility", label: "Utility" },
    ],
    baseHull: 7,
    baseCargo: 0,
    fuelCapacityBonus: 0,
    size: 12,
    fill: "#e8b0a0",
    stroke: "#a06050",
    defaultLoadout: [
      "gun_mk1",
      "cannon_mk1",
      "interceptor_drive",
      "light_shield",
    ],
  } satisfies HullDef,

  hauler: {
    id: "hauler",
    name: "Hauler",
    specialty: "Trader",
    blurb:
      "Bulk freighter. One gun, three utility bays, and a deep built-in hold.",
    price: 420,
    slots: [
      { kind: "weapon", label: "Weapon" },
      { kind: "drive", label: "Drive" },
      { kind: "utility", label: "Utility A" },
      { kind: "utility", label: "Utility B" },
      { kind: "utility", label: "Utility C" },
    ],
    baseHull: 16,
    baseCargo: 22,
    fuelCapacityBonus: 6,
    size: 18,
    fill: "#d4c4a8",
    stroke: "#8a7a58",
    defaultLoadout: ["gun_mk1", "basic_drive", "cargo_rack", null, null],
  } satisfies HullDef,

  raider: {
    id: "raider",
    name: "Raider",
    specialty: "Skirmisher",
    blurb:
      "Two guns and two utilities. Enough hold for a raid, not a trade route.",
    price: 480,
    slots: [
      { kind: "weapon", label: "Weapon A" },
      { kind: "weapon", label: "Weapon B" },
      { kind: "drive", label: "Drive" },
      { kind: "utility", label: "Utility A" },
      { kind: "utility", label: "Utility B" },
    ],
    baseHull: 11,
    baseCargo: 6,
    fuelCapacityBonus: 2,
    size: 14,
    fill: "#e0a090",
    stroke: "#904838",
    defaultLoadout: [
      "gun_mk1",
      "missile_mk1",
      "racing_drive",
      "light_shield",
      null,
    ],
  } satisfies HullDef,

  liner: {
    id: "liner",
    name: "Liner",
    specialty: "Passenger",
    blurb:
      "Fare hull. Four utility bays for berths, a modest hold, and a long tank. One gun.",
    price: 620,
    slots: [
      { kind: "weapon", label: "Weapon" },
      { kind: "drive", label: "Drive" },
      { kind: "utility", label: "Utility A" },
      { kind: "utility", label: "Utility B" },
      { kind: "utility", label: "Utility C" },
      { kind: "utility", label: "Utility D" },
    ],
    baseHull: 14,
    baseCargo: 8,
    fuelCapacityBonus: 12,
    size: 17,
    fill: "#c8d0e8",
    stroke: "#6070a0",
    defaultLoadout: [
      "gun_mk1",
      "long_range_drive",
      "passenger_berth_4",
      "passenger_berth_2",
      null,
      null,
    ],
  } satisfies HullDef,

  bulwark: {
    id: "bulwark",
    name: "Bulwark",
    specialty: "Gunship",
    blurb:
      "Real triple hardpoint. Space, left click, and right click. Thick core, shield bay, and plating bay.",
    price: 860,
    slots: [
      { kind: "weapon", label: "Weapon A" },
      { kind: "weapon", label: "Weapon B" },
      { kind: "weapon", label: "Weapon C" },
      { kind: "drive", label: "Drive" },
      { kind: "utility", label: "Utility A" },
      { kind: "utility", label: "Utility B" },
    ],
    baseHull: 22,
    baseCargo: 0,
    fuelCapacityBonus: 0,
    size: 16,
    fill: "#b0b8c8",
    stroke: "#586878",
    defaultLoadout: [
      "cannon_mk1",
      "gun_mk1",
      "missile_mk1",
      "basic_drive",
      "light_shield",
      "hull_plating",
    ],
  } satisfies HullDef,
} as const;

export const HULL_CATALOG: HullDef[] = [
  HULLS.sparrow,
  HULLS.pathfinder,
  HULLS.prospector,
  HULLS.courier,
  HULLS.interceptor,
  HULLS.hauler,
  HULLS.raider,
  HULLS.liner,
  HULLS.bulwark,
];

export const STARTER_HULL_ID = HULLS.sparrow.id;

const MODULE_BY_ID: Record<string, EquipModule> = Object.fromEntries(
  Object.values(MODULES).map((m) => [m.id, m]),
);

export function hullById(id: string): HullDef | undefined {
  return HULL_CATALOG.find((h) => h.id === id);
}

export function createSlotsForHull(hull: HullDef): ShipSlot[] {
  const slots = hull.slots.map((spec, i) => {
    const modId = hull.defaultLoadout[i] ?? null;
    const mod = modId ? MODULE_BY_ID[modId] : undefined;
    return {
      id: `slot_${hull.id}_${spec.kind}_${i}`,
      kind: spec.kind,
      label: spec.label,
      equipped: mod ? cloneModule(mod) : null,
    };
  });
  // TEMP(bay-weapon-swap): strip before merge.
  // Starter Sparrow only — NPC Sparrows still read hull.slots (one weapon).
  // Sparrow goes back to one weapon slot when this block is removed.
  if (hull.id === HULLS.sparrow.id) {
    const firstWeapon = slots.findIndex((s) => s.kind === "weapon");
    const at = firstWeapon >= 0 ? firstWeapon + 1 : 0;
    slots.splice(at, 0, {
      id: `slot_${hull.id}_weapon_temp`,
      kind: "weapon",
      label: "Weapon B",
      equipped: cloneModule(MODULES.cannonMk1),
    });
  }
  return slots;
}

/** Slot layout summary e.g. "1W / 1D / 2U". */
export function formatSlotLayout(hull: HullDef): string {
  let w = 0;
  let d = 0;
  let u = 0;
  for (const s of hull.slots) {
    if (s.kind === "weapon") w += 1;
    else if (s.kind === "drive") d += 1;
    else u += 1;
  }
  return `${w}W / ${d}D / ${u}U`;
}

/** Berths on a newly bought hull (factory utilities only). */
export function factoryPassengerCapacity(hull: HullDef): number {
  let n = 0;
  for (let i = 0; i < hull.slots.length; i += 1) {
    if (hull.slots[i]!.kind !== "utility") continue;
    const id = hull.defaultLoadout[i];
    if (!id) continue;
    const mod = MODULE_BY_ID[id];
    if (mod?.kind === "utility") n += mod.passengerCapacity;
  }
  return n;
}

/** Hulls offered for purchase at every station (starter excluded). */
export function hangarSaleStock(): HullDef[] {
  return HULL_CATALOG.filter((h) => h.price > 0);
}
