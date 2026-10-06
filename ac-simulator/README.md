# AC Simulator

A single-file browser simulator that shows how a room cools with one or more air conditioners. Open `index.html` in any browser. There is nothing to install and no build step.

- Page weight: about 75 KB of app code, plus uPlot (about 51 KB) loaded from jsDelivr.
- Tests: `node --test ac-simulator/test/*.test.js` (Node 18+). They load the engine straight out of `index.html` and check the PRD success criteria.

## What v1 covers

| PRD section | Status |
|---|---|
| 5 Inputs (room, outdoor, heat sources, AC units, setpoint, tariff) | Done. m/ft toggle included. |
| 6 Two-node model, ACH mapping, AC model, presets | Done. See the notes below. |
| 7 Run/Pause/Reset, 1×/60×/600×/1800×, stop-at time, live setpoint/outdoor/AC on-off with graph markers | Done. |
| 8 Readouts, live graph (°C left, kW right), cumulative kWh chart, sizing warnings | Done. |
| 9 2D plan: to scale, tap a wall to place, red→blue tint, airflow particles, status badges | Done. |
| 11 Engine/controller/view split, rAF loop, localStorage save/load, CSV export, responsive | Done. |
| 10 Comparison mode | Not built (v2). `Controller.create()` returns independent sims, so two can share one clock. |

## Code layout (inside `index.html`)

- `<script id="engine">` holds `Engine`, which is pure physics with no DOM access (`buildRoom`, `step`, `steadyLoad`, `equilibriumTemp`, `unitOutput`), and `Controller`, which runs the fixed 1-second step, the thermostat and PI inverter logic, and the sizing verdict.
- The second `<script>` holds the views: canvas floor plan, uPlot charts, readouts and inputs. They only read engine state. `window.ACSim` exposes the live sim for a future three.js view.

## Model notes and choices

- **Wall heat goes into the mass node.** Conduction through opaque outside walls, the roof (top floor) and the ground slab (ground floor) enters the mass node (`Q_wall_from_outside`). Windows, infiltration, people, appliances and sun go straight into the air. This is the physically sound split, and it is what produces the slow pull-down.
- **Sol-air:** outside walls are treated as 4 K hotter than outdoor air and a sunlit roof as 14 K hotter.
- **Extra input: "Outside walls" (1–4, default 2).** The PRD had no way to tell how much wall faces outdoors, and that dominates the heat gain. The window sits in the first outside wall.
- **Effective mass:** only the inner layer of walls and slabs takes part over a few hours, so the storage per m² is an effective value per construction. It was tuned so that the PRD reference case (1.5 ton inverter, 4 × 3.5 × 3 m, 35 °C) reaches 24 °C in about 24 minutes.
- **Air node** includes fast-coupled contents (3× the air's own capacity). Without them, non-inverter cycling is unrealistically fast.
- **Inverter:** PI loop (Kp = 1/°C, Ti = 600 s) with anti-windup, 30–110% modulation, part-load COP up to 1.2× at 45–60% load. It cycles off below 30% demand (off at setpoint −0.5 °C, back on at +0.5 °C after the 3-minute protection).
- **Non-inverter:** ±1 °C deadband, 3-minute minimum off time. The indoor fan keeps running between cycles, shown as "FAN".
- **Outdoor effects:** capacity derates 1.5%/°C above 35 °C, as specified. COP also drops 2%/°C above 35 °C and rises up to 15% below 35 °C (an addition).
- **"Reached setpoint"** means indoor air within 0.2 °C of the setpoint.

### Sizing verdict

- **Undersized:** the steady heat gain at the setpoint (air and walls both at the setpoint) is more than the installed capacity. This is computed analytically, so it shows before the run, together with the lowest temperature the unit can hold.
- **Oversized:** more than 8 compressor starts in the last hour, measured at least 30 minutes after reaching the setpoint.
- **Well sized:** reached the setpoint and none of the above.

### Reference results (35 °C outdoor, 4 × 3.5 × 3 m, brick, middle floor, 2 outside walls, 1.5 m² west window)

| Unit | Time to 24 °C | 8 h energy | Verdict |
|---|---|---|---|
| 1.5 ton inverter split | ~24 min | ~4.4 kWh | Well sized |
| 1.5 ton non-inverter split | ~24 min | ~5.7 kWh | Oversized (≈10 starts/h) |
| 1 ton non-inverter split | ~61 min | ~5.6 kWh | Well sized |
| 0.75 ton window, top floor, leaky, 40 °C | never (levels off near 32 °C) | — | Undersized |

## Defaults chosen for the PRD's open questions

- Metric first, with a ft toggle.
- A single flat tariff (default 8 Tk/kWh, editable). Slab pricing can come later.
- Generic AC types only.
- Load-shedding is not simulated, but turning an AC off and on mid-run already shows the effect.

## Known limits

- Sensible heat only, with no humidity or latent load (planned for v2). Real-world tonnage rules of thumb include latent load, so this model's heat-gain figure is lower than "1 ton per 150 sq ft".
- CSV download uses the viewer's download prompt when hosted on claude.ai, and a normal browser download when the file is opened directly.
