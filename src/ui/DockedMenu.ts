import { FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "./menu";

export type DockedMenuAction =
  | "bay"
  | "hangar"
  | "market"
  | "blackMarket"
  | "missions"
  | "launch"
  | null;

type ServiceMenu = Exclude<DockedMenuAction, "launch" | null>;

const MENU_LABEL: Record<ServiceMenu, string> = {
  bay: "Bay",
  hangar: "Hangar",
  market: "Market",
  blackMarket: "Black Market",
  missions: "Missions",
};

/** Display order for optional service buttons. */
const MENU_ORDER: readonly ServiceMenu[] = [
  "bay",
  "hangar",
  "market",
  "blackMarket",
  "missions",
];

/**
 * Shown while the player is docked at a station.
 * Missions are always available; Bay / Hangar / Market / Black Market come
 * from the station's rolled optional set. Repair & refuel are complimentary
 * on dock (no button) — see Game.applyComplimentaryDockService.
 */
export class DockedMenu {
  open = false;
  stationName = "";
  private panel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private launchBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private serviceBtns = new Map<ServiceMenu, Rect>();
  private availableMenus: ReadonlySet<string> = new Set();
  private missionBoardHint = "";
  /** e.g. "Rep Friendly (+24)" — empty when unknown. */
  private standingLine = "";

  show(
    stationName: string,
    viewW: number,
    viewH: number,
    availableMenus: ReadonlySet<string> | Iterable<string>,
    missionBoardHint = "",
    standingLine = "",
  ): void {
    this.open = true;
    this.stationName = stationName;
    const set = new Set<string>();
    for (const m of availableMenus) set.add(m);
    this.availableMenus = set;
    this.missionBoardHint = missionBoardHint;
    this.standingLine = standingLine;

    const visibleServices = MENU_ORDER.filter((m) =>
      this.availableMenus.has(m),
    );
    const w = 280;
    const rows = visibleServices.length + 1; // services + launch
    const headerExtra = standingLine ? 16 : 0;
    const h = 56 + headerExtra + rows * 38 + 16;
    this.panel = {
      x: Math.floor((viewW - w) / 2),
      y: Math.floor((viewH - h) / 2),
      w,
      h,
    };

    let y = this.panel.y + 56 + headerExtra;
    this.serviceBtns.clear();
    for (const menu of visibleServices) {
      this.serviceBtns.set(menu, {
        x: this.panel.x + 24,
        y,
        w: w - 48,
        h: 28,
      });
      y += 38;
    }

    this.launchBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
  }

  /** Refresh label hint without closing. */
  refreshHint(
    viewW: number,
    viewH: number,
    missionBoardHint: string,
    standingLine = this.standingLine,
  ): void {
    if (!this.open) return;
    this.show(
      this.stationName,
      viewW,
      viewH,
      this.availableMenus,
      missionBoardHint,
      standingLine,
    );
  }

  hide(): void {
    this.open = false;
  }

  draw(ctx: CanvasRenderingContext2D, pointerX: number, pointerY: number): void {
    if (!this.open) return;
    drawPanel(ctx, this.panel);
    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText("Docked", this.panel.x + 24, this.panel.y + 16);
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = "rgba(160, 180, 210, 0.85)";
    ctx.fillText(this.stationName, this.panel.x + 24, this.panel.y + 38);
    if (this.standingLine) {
      ctx.fillStyle = "rgba(190, 170, 140, 0.9)";
      ctx.fillText(this.standingLine, this.panel.x + 24, this.panel.y + 52);
    }

    for (const menu of MENU_ORDER) {
      const btn = this.serviceBtns.get(menu);
      if (!btn) continue;
      let label = MENU_LABEL[menu];
      if (menu === "missions" && this.missionBoardHint) {
        label = `Missions (${this.missionBoardHint})`;
      }
      drawButton(ctx, btn, label, {
        hover: hit(btn, pointerX, pointerY),
      });
    }

    drawButton(ctx, this.launchBtn, "Launch", {
      primary: true,
      hover: hit(this.launchBtn, pointerX, pointerY),
    });
  }

  handleClick(px: number, py: number): DockedMenuAction {
    if (!this.open) return null;
    for (const menu of MENU_ORDER) {
      const btn = this.serviceBtns.get(menu);
      if (btn && hit(btn, px, py)) return menu;
    }
    if (hit(this.launchBtn, px, py)) return "launch";
    return null;
  }
}
