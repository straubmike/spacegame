/**
 * Freight is measured only in cargo units (CU).
 * Commodity identity affects value, not volume — 1 CU of anything takes 1 CU of hold.
 */

export interface CargoLot {
  /** Commodity id (market catalog later). */
  id: string;
  name: string;
  /** Volume in CU. */
  cu: number;
}

export class CargoHold {
  /** Installed capacity from utility (and future hull base). */
  capacityCu = 0;
  private readonly lots: CargoLot[] = [];

  get usedCu(): number {
    let n = 0;
    for (const lot of this.lots) n += lot.cu;
    return n;
  }

  get freeCu(): number {
    return Math.max(0, this.capacityCu - this.usedCu);
  }

  list(): readonly CargoLot[] {
    return this.lots;
  }

  /**
   * Resize hold. Excess cargo is jettisoned (FIFO) so usedCu never exceeds capacity.
   * Returns CU dumped.
   */
  setCapacity(capacityCu: number): number {
    this.capacityCu = Math.max(0, capacityCu);
    let dumped = 0;
    while (this.usedCu > this.capacityCu && this.lots.length > 0) {
      const lot = this.lots[0]!;
      const overflow = this.usedCu - this.capacityCu;
      if (lot.cu <= overflow) {
        dumped += lot.cu;
        this.lots.shift();
      } else {
        lot.cu -= overflow;
        dumped += overflow;
      }
    }
    return dumped;
  }

  canStow(cu: number): boolean {
    return cu > 0 && cu <= this.freeCu;
  }

  amountOf(id: string): number {
    const lot = this.lots.find((l) => l.id === id);
    return lot?.cu ?? 0;
  }

  /** Add a lot; fails if it will not fit. */
  stow(lot: CargoLot): boolean {
    if (!this.canStow(lot.cu)) return false;
    const existing = this.lots.find((l) => l.id === lot.id);
    if (existing) {
      existing.cu += lot.cu;
    } else {
      this.lots.push({ ...lot });
    }
    return true;
  }

  /** Remove up to `cu` of a commodity. Returns amount actually removed. */
  remove(id: string, cu: number): number {
    if (cu <= 0) return 0;
    const lot = this.lots.find((l) => l.id === id);
    if (!lot) return 0;
    const taken = Math.min(lot.cu, cu);
    lot.cu -= taken;
    if (lot.cu <= 0) {
      const i = this.lots.indexOf(lot);
      if (i >= 0) this.lots.splice(i, 1);
    }
    return taken;
  }
}
