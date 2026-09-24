# Spacegame

A lightweight, browser-based **Elite-like** prototype: fly a ship in 2D space, jump between systems, dock at stations, trade and outfit, and tangle with low-stakes pirates — all in a tab.

Stack: **TypeScript + Vite + HTML5 Canvas** (no game engine).

## Run

```bash
npm install
npm run dev
```

Then open the URL Vite prints (usually `http://localhost:5173`).

| Script | What it does |
| --- | --- |
| `npm run dev` | Local dev server with HMR |
| `npm run build` | Typecheck (`tsc`) + production bundle |
| `npm run preview` | Serve the production build |

## Controls

| Input | Action |
| --- | --- |
| **W / A / S / D** or arrows | Thrust, turn, reverse |
| **Space** | Fire (hold to autofire on cooldown) |
| **G** | Galaxy chart (jump within drive range) |
| **M** | System panel (in-system travel) |
| **L** | Ship loadout summary |
| **Esc** | Close menus / cancel approach |
| Click station | Context menu → hail / dock |

While **docked**: repair, **bay** (equip modules), **market** (buy/sell commodities), pirate clearance quests, launch.

## Current prototype loop

1. Fly locally; fight or pay pirates when they demand a fee.
2. Hail a station for clearance, then dock (autopilot approach).
3. Outfit in the bay, trade in the market, repair hull, claim clearance bounties.
4. Launch, open **G** to jump, or **M** to travel within the system — repeat.

Session state is **in memory only** (refresh loses progress). Design direction, must-haves, and backlog live in the **Cursor Project** for this game (design doc + dream list) — not duplicated here.
