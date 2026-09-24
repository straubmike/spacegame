import { ECONOMY } from "../game/config";
import { FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "./menu";

export type DockedMenuAction =
  | "repair"
  | "bay"
  | "hangar"
  | "market"
  | "missions"
  | "launch"
  | null;

/**
 * Shown while the player is docked at a station.
 * Contracts live under Missions (including pirate clearance).
 */
export class DockedMenu {
  open = false;
  stationName = "";
  private panel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private repairBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private bayBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hangarBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private marketBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private missionsBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private launchBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private missionBoardHint = "";

  show(
    stationName: string,
    viewW: number,
    viewH: number,
    missionBoardHint = "",
  ): void {
    this.open = true;
    this.stationName = stationName;
    this.missionBoardHint = missionBoardHint;

    const w = 280;
    const rows = 6; // repair, bay, hangar, market, missions, launch
    const h = 56 + rows * 38 + 16;
    this.panel = {
      x: Math.floor((viewW - w) / 2),
      y: Math.floor((viewH - h) / 2),
      w,
      h,
    };

    let y = this.panel.y + 56;
    this.repairBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
    y += 38;

    this.bayBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
    y += 38;

    this.hangarBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
    y += 38;

    this.marketBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
    y += 38;

    this.missionsBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
    y += 38;

    this.launchBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
  }

  /** Refresh label hint without closing. */
  refreshHint(viewW: number, viewH: number, missionBoardHint: string): void {
    if (!this.open) return;
    this.show(this.stationName, viewW, viewH, missionBoardHint);
  }

  hide(): void {
    this.open = false;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    pointerX: number,
    pointerY: number,
    missingHp: number,
    credits: number,
  ): void {
    if (!this.open) return;
    drawPanel(ctx, this.panel);
    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText("Docked", this.panel.x + 24, this.panel.y + 16);
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = "rgba(160, 180, 210, 0.85)";
    ctx.fillText(this.stationName, this.panel.x + 24, this.panel.y + 38);

    const cost = missingHp * ECONOMY.repairCostPerHp;
    const canRepair = missingHp > 0 && credits >= ECONOMY.repairCostPerHp;
    const repairLabel =
      missingHp <= 0 ? "Repair (full)" : `Repair (${cost} cr)`;
    drawButton(ctx, this.repairBtn, repairLabel, {
      enabled: canRepair,
      hover: canRepair && hit(this.repairBtn, pointerX, pointerY),
    });

    drawButton(ctx, this.bayBtn, "Bay", {
      hover: hit(this.bayBtn, pointerX, pointerY),
    });

    drawButton(ctx, this.hangarBtn, "Hangar", {
      hover: hit(this.hangarBtn, pointerX, pointerY),
    });

    drawButton(ctx, this.marketBtn, "Market", {
      hover: hit(this.marketBtn, pointerX, pointerY),
    });

    const missionsLabel = this.missionBoardHint
      ? `Missions (${this.missionBoardHint})`
      : "Missions";
    drawButton(ctx, this.missionsBtn, missionsLabel, {
      hover: hit(this.missionsBtn, pointerX, pointerY),
    });

    drawButton(ctx, this.launchBtn, "Launch", {
      primary: true,
      hover: hit(this.launchBtn, pointerX, pointerY),
    });
  }

  handleClick(px: number, py: number): DockedMenuAction {
    if (!this.open) return null;
    if (hit(this.repairBtn, px, py)) return "repair";
    if (hit(this.bayBtn, px, py)) return "bay";
    if (hit(this.hangarBtn, px, py)) return "hangar";
    if (hit(this.marketBtn, px, py)) return "market";
    if (hit(this.missionsBtn, px, py)) return "missions";
    if (hit(this.launchBtn, px, py)) return "launch";
    return null;
  }
}
