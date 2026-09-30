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
| Camera (chase / first person) | C |
| Restart | R |
| Orbit chase camera | drag with mouse |

## Scripts

- `npm run probe -- <lat> <lon> [heading] [km]` prints a terrain profile.
- `node scripts/scan-exit.mjs <lat> <lon> [heading] [span]` finds the
  steepest exit near a point (useful when adding launch sites).

See [PLAN.md](PLAN.md) for the roadmap.
