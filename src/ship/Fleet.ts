import { ShipLoadout } from "./Loadout";
import { CargoHold } from "./CargoHold";
import {
  STARTER_HULL_ID,
  createSlotsForHull,
  hullById,
  type HullDef,
} from "./hulls";

export interface OwnedShipSnapshot {
  instanceId: string;
  hullId: string;
  loadout: ShipLoadout;
  cargo: CargoHold;
  health: number;
  shield: number;
}

let nextInstanceSeq = 1;

function newInstanceId(hullId: string): string {
  const id = `${hullId}_${nextInstanceSeq}`;
  nextInstanceSeq += 1;
  return id;
}

function freshOwned(hull: HullDef): OwnedShipSnapshot {
  const loadout = new ShipLoadout(createSlotsForHull(hull));
  const cargo = new CargoHold();
  const utilCargo = loadout
    .utilities()
    .reduce((sum, u) => sum + u.cargoCapacity, 0);
  cargo.setCapacity(hull.baseCargo + utilCargo);
  const hullBonus = loadout.utilities().reduce((sum, u) => sum + u.hullBonus, 0);
  const maxHull = hull.baseHull + hullBonus;
  const shieldMax = loadout
    .utilities()
    .reduce((sum, u) => sum + u.shieldMax, 0);
  return {
    instanceId: newInstanceId(hull.id),
    hullId: hull.id,
    loadout,
    cargo,
    health: maxHull,
    shield: shieldMax,
  };
}

/**
 * Owned hulls (session). Credits stay on the flight Ship; each owned hull
 * keeps its own loadout, cargo, and damage state. One instance is active.
 */
export class Fleet {
  readonly owned: OwnedShipSnapshot[] = [];
  activeInstanceId = "";

  constructor() {
    const starter = hullById(STARTER_HULL_ID);
    if (!starter) throw new Error("Missing starter hull");
    const ship = freshOwned(starter);
    this.owned.push(ship);
    this.activeInstanceId = ship.instanceId;
  }

  get active(): OwnedShipSnapshot {
    const ship = this.owned.find((o) => o.instanceId === this.activeInstanceId);
    if (!ship) throw new Error("No active ship in fleet");
    return ship;
  }

  ownsHullType(hullId: string): boolean {
    return this.owned.some((o) => o.hullId === hullId);
  }

  get(instanceId: string): OwnedShipSnapshot | undefined {
    return this.owned.find((o) => o.instanceId === instanceId);
  }

  /** Purchase a hull type; returns the new instance or null if already owned / unknown. */
  buy(hull: HullDef): OwnedShipSnapshot | null {
    if (hull.price <= 0) return null;
    if (this.ownsHullType(hull.id)) return null;
    const ship = freshOwned(hull);
    this.owned.push(ship);
    return ship;
  }

  /** Mark an owned instance as the flight ship. */
  setActive(instanceId: string): boolean {
    if (!this.get(instanceId)) return false;
    this.activeInstanceId = instanceId;
    return true;
  }
}
