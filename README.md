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

Open http://localhost:5173. Pick a launch site in the menu, or use `?loc=<id>`
(ids in `src/world/locations.ts`).

## Launch sites

Mountains: Eiger Mushroom, Lauterbrunnen High Nose, Brévent, Monte Brento,
Kjerag, Half Dome, Table Mountain, Mount Fuji (helicopter drop).
Cities: Burj Khalifa, Corcovado (Rio), Victoria Peak (helicopter drop),
Petronas Towers.

Exits are placed on the steepest face the elevation data shows, and the
jumper starts a few metres out over the face because 13 m elevation pixels
smooth vertical walls into steep slopes. Tower exits use the real roof
altitude since the elevation data has no buildings.

## Conditions

Time of day (dawn to night, custom hour, or live) drives the real sun and
moon position for the site's coordinates and today's date. Sky (clear, partly,
overcast), precipitation (rain, snow), and wind speed/direction are selectable;
"Use live weather" pulls current conditions from Open-Meteo. Wind gusts,
wobbles, and rises where it blows up a slope.

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
| Camera (chase / first person / cinematic) | C |
| Restart | R |
| Mute | M |
| Orbit chase camera / look around in first person | drag with mouse (right button when mouse steering is on) |

Mouse steering (settings): cursor offset from centre is the stick, left button
dives (or flares under canopy), middle button deploys. Gamepad: left stick
pitch/roll, bumpers yaw, right trigger dive, A chute, B flare, Y camera, Start
restart. Touch: virtual stick on the left half of the screen, buttons on the
right; enabled automatically on touch devices.

## Wingsuit

Pick a suit texture in the menu (colours, patterns, flags) or upload your own
image. The whole texture is mapped across the wings and body of the
procedural flyer. Sound is procedural (wind, canopy flutter, rain, impacts).

## Game modes

- **Distance**: score is the horizontal distance from exit to touchdown in metres.
- **Target**: score is 1000 at the landing-zone centre, falling to 0 at 500 m.

A crash, a hard landing (sink over 3 m/s or ground speed over 7 m/s), a landing
on a slope steeper than 30°, or a hard opening above 7 g scores 0. Top ten runs
per site and mode are kept in the browser's local storage.

## Google Photorealistic 3D Tiles (optional)

In Settings, paste a Google Maps Platform API key with the **Map Tiles API**
enabled and tick "Google Photorealistic 3D Tiles". The game then streams
Google's textured 3D mesh (real buildings, true imagery) instead of the
elevation terrain, re-oriented into the game's local frame and vertically
calibrated against the elevation data at the exit. Buildings become solid:
the physics uses whichever surface is higher, elevation data or tiles. The
key is stored only in your browser's local storage, and usage is billed to
your Google account.

## Deploying

Pushing to `main` runs `.github/workflows/deploy.yml`, which builds the site
and publishes `dist/` to GitHub Pages (enable Pages with the "GitHub Actions"
source in the repository settings). `npm run build` then `npm run preview`
serves the production build locally.

## Scripts

- `npm run probe -- <lat> <lon> [heading] [km]` prints a terrain profile.
- `node scripts/scan-exit.mjs <lat> <lon> [heading] [span]` finds the
  steepest exit near a point (useful when adding launch sites).

See [PLAN.md](PLAN.md) for the roadmap.
