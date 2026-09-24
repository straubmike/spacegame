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
  /** Base hull HP before utility bonuses. */
  baseHull: number;
  /** Built-in cargo CU before utility racks. */
  baseCargo: number;
  /** Added to equipped drive jump range (ly). */
  jumpRangeBonus: number;
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
    jumpRangeBonus: 0,
    size: 14,
    fill: "#c8d6e8",
    stroke: "#6a8bb0",
    defaultLoadout: ["energy_pulse", "basic_drive", null, null],
  } satisfies HullDef,

  hauler: {
    id: "hauler",
    name: "Hauler",
    specialty: "Trader",
    blurb: "Fat freighter frame. Twin utility bays for racks and shields; built-in hold.",
    price: 200,
    slots: [
      { kind: "weapon", label: "Weapon" },
      { kind: "drive", label: "Drive" },
      { kind: "utility", label: "Utility A" },
      { kind: "utility", label: "Utility B" },
    ],
    baseHull: 12,
    baseCargo: 8,
    jumpRangeBonus: 0,
    size: 18,
    fill: "#d4c4a8",
    stroke: "#8a7a58",
    defaultLoadout: ["energy_pulse", "basic_drive", "cargo_rack", null],
  } satisfies HullDef,

  interceptor: {
    id: "interceptor",
    name: "Interceptor",
    specialty: "Fighter",
    blurb: "Twin hardpoints, thin skin. Both weapons fire together when Space is held.",
    price: 250,
    slots: [
      { kind: "weapon", label: "Weapon A" },
      { kind: "weapon", label: "Weapon B" },
      { kind: "drive", label: "Drive" },
      { kind: "utility", label: "Utility" },
    ],
    baseHull: 8,
    baseCargo: 0,
    jumpRangeBonus: 0,
    size: 12,
    fill: "#e8b0a0",
    stroke: "#a06050",
    defaultLoadout: ["energy_pulse", "rapid_pulse", "racing_drive", "light_shield"],
  } satisfies HullDef,

  pathfinder: {
    id: "pathfinder",
    name: "Pathfinder",
    specialty: "Explorer",
    blurb: "Survey frame with a hypertuned coil mount. Extra jump reach baked into the hull.",
    price: 180,
    slots: [
      { kind: "weapon", label: "Weapon" },
      { kind: "drive", label: "Drive" },
      { kind: "utility", label: "Utility" },
    ],
    baseHull: 10,
    baseCargo: 2,
    jumpRangeBonus: 12,
    size: 14,
    fill: "#a8d4c8",
    stroke: "#4a8878",
    defaultLoadout: ["energy_pulse", "long_range_drive", null],
  } satisfies HullDef,

  bulwark: {
    id: "bulwark",
    name: "Bulwark",
    specialty: "Combat",
    blurb: "Armored patrol hull. Thick base plating and room for shield plus plating utilities.",
    price: 320,
    slots: [
      { kind: "weapon", label: "Weapon" },
      { kind: "drive", label: "Drive" },
      { kind: "utility", label: "Utility A" },
      { kind: "utility", label: "Utility B" },
    ],
    baseHull: 16,
    baseCargo: 0,
    jumpRangeBonus: 0,
    size: 16,
    fill: "#b0b8c8",
    stroke: "#586878",
    defaultLoadout: ["heavy_pulse", "basic_drive", "hull_plating", "light_shield"],
  } satisfies HullDef,
} as const;

export const HULL_CATALOG: HullDef[] = [
  HULLS.sparrow,
  HULLS.pathfinder,
  HULLS.hauler,
  HULLS.interceptor,
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
  return hull.slots.map((spec, i) => {
    const modId = hull.defaultLoadout[i] ?? null;
    const mod = modId ? MODULE_BY_ID[modId] : undefined;
    return {
      id: `slot_${hull.id}_${spec.kind}_${i}`,
      kind: spec.kind,
      label: spec.label,
      equipped: mod ? cloneModule(mod) : null,
    };
  });
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

/** Hulls offered for purchase at every station (starter excluded). */
export function hangarSaleStock(): HullDef[] {
  return HULL_CATALOG.filter((h) => h.price > 0);
}
