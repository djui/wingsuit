# Wingsuit

Browser wingsuit BASE-jumping game on real-world terrain. Jump from famous
mountains and city landmarks, glide with realistic aerodynamics, deploy a
parachute and land on target.

Terrain elevation streams from AWS Terrain Tiles (Terrarium encoding) and
satellite imagery from Esri World Imagery. No API keys required.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5173. `?loc=<id>` selects a launch site (see
`src/world/locations.ts`).

## Controls

| Action | Keys |
|---|---|
| Pitch (nose down / up) | W / S or arrow keys |
| Roll | A / D |
| Yaw | Q / E |
| Dive (collapse wing) | Shift |
| Deploy parachute | Space |
| Canopy toggles (left / right) | A / D |
| Flare (both toggles) | S |
| Camera (chase / first person) | C |
| Restart | R |
| Orbit chase camera | drag with mouse |

## Game modes

- **Distance**: score is the horizontal distance from exit to touchdown in metres.
- **Target**: score is 1000 at the landing-zone centre, falling to 0 at 500 m.

A crash, a hard landing (sink over 3 m/s or ground speed over 7 m/s), a landing
on a slope steeper than 30°, or a hard opening above 7 g scores 0. Top ten runs
per site and mode are kept in the browser's local storage.

## Scripts

- `npm run probe -- <lat> <lon> [heading] [km]` prints a terrain profile.
- `node scripts/scan-exit.mjs <lat> <lon> [heading] [span]` finds the
  steepest exit near a point (useful when adding launch sites).

See [PLAN.md](PLAN.md) for the roadmap.
