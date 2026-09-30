# Wingsuit — Implementation Plan

3D browser game: jump from real-world mountains and city landmarks in a wingsuit,
glide with realistic physics, deploy a parachute at any time, and land safely.
Goal per run: maximum distance, or hit a marked landing zone.

## Decisions (confirmed)

| Topic | Decision |
|---|---|
| Stack | Vite + TypeScript + Three.js, vanilla HTML/CSS UI, no backend |
| Terrain | Open data by default (AWS Terrarium elevation + free satellite imagery). Optional Google Photorealistic 3D Tiles when the user pastes a Google Maps API key in settings |
| Locations | 8 mountains + 4 city sites (see below) |
| Input | Keyboard, mouse steering, gamepad, touch/mobile |
| Realism | Real-world physics; terrain contact or hard landing ends the run |
| Weather | Manual presets + "Live" toggle fetching current conditions from Open-Meteo (free, no key) |
| Hosting | GitHub Pages via GitHub Actions; git repo initialised at project start |
| Flyer model | Procedural low-poly model built from primitives, UV-mapped for textures |
| Audio | Procedural Web Audio (wind roar, canopy flap, rain) |

## Architecture

```
src/
  main.ts                 bootstrap, game loop (fixed 120 Hz physics, variable render)
  core/
    state.ts              run state machine: menu → exit → flying → canopy → landed/crashed
    input/                keyboard, mouse, gamepad, touch → unified control axes
    audio.ts              Web Audio graph driven by airspeed / canopy / weather
  world/
    locations.ts          launch site catalog (lat/lon/alt of exit, landing zone, heading)
    terrain/
      tiles.ts            fetch + decode Terrarium PNG elevation tiles, LRU cache
      imagery.ts          satellite tile provider (ESRI World Imagery / EOX S2 cloudless)
      quadtree.ts         LOD heightmap mesh around the player, geographic → local ENU
      collision.ts        bilinear height lookup + surface normal for physics
      google3d.ts         optional 3DTilesRenderer path for Photorealistic 3D Tiles
    sky/
      sun.ts              suncalc: sun/moon position from lat/lon/date/time
      sky.ts              physically based sky shader, stars, moon, fog
      weather.ts          presets, Open-Meteo live fetch, wind field (base + gusts + slope lift)
      particles.ts        rain / snow GPU particles, clouds
  sim/
    wingsuit.ts           aero model: lift/drag vs AoA and airspeed, stall, flare, inertia
    canopy.ts             deployment sequence, canopy aero, toggles, landing flare
    body.ts               rigid body integration, air density vs altitude, wind relative airflow
    outcome.ts            landing / crash rules
  player/
    model.ts              procedural flyer mesh (wingsuit pose + canopy pose)
    textures.ts           texture presets + custom image upload, canvas-generated patterns
    cameras.ts            first person (helmet cam), third person chase, cinematic
  ui/
    menu.ts               location picker, mode, suit texture, weather/time, settings
    hud.ts                altitude, airspeed, vertical speed, glide ratio, distance, wind, minimap
    results.ts            run summary, local leaderboard (localStorage)
    touch.ts              on-screen controls for mobile
```

## Physics model

- Units: metres, seconds, kg. Pilot + suit mass ~90 kg.
- Wingsuit: reference area ~1.6 m², CL(α) with linear region and stall past ~15°,
  CD = CD0 + k·CL². Tuned to glide ratio ~2.5–3:1 at 150–250 km/h airspeed.
  Roll and pitch driven by control inputs through rate limits and damping.
- Air density: ISA model vs altitude (affects lift and drag).
- Wind: location base vector + Perlin gusts + slope updraft near ridges. Rain/snow
  add a small drag factor and reduce visibility (fog density).
- Parachute: deploy any time. ~3 s opening with decel ramp; snivel → full canopy.
  Canopy: glide ~2.5:1, ~35 km/h forward, ~5 m/s sink, toggle steering, flare
  reduces sink for ~2 s. Deploying below ~150 m AGL or above ~200 km/h airspeed
  risks a crash (malfunction / hard opening).
- Outcome: terrain contact in wingsuit = crash. Under canopy: safe if vertical
  speed < 3 m/s and horizontal < 8 m/s, else crash. Water = crash.

## Locations

Mountains: Eiger Mushroom (CH), Lauterbrunnen High Nose (CH), Brévent / Chamonix (FR),
Monte Brento (IT), Kjerag (NO), Half Dome / Yosemite (US), Table Mountain (ZA), Mount Fuji (JP).
Cities: Burj Khalifa (AE), Sugarloaf / Rio (BR), Victoria Peak / Hong Kong (HK), Petronas Towers (MY).

Each entry: exit lat/lon/altitude, initial heading, landing zone lat/lon/radius,
default wind, recommended terrain radius to load.

## Environment

- Time: morning / afternoon / evening / night, plus free time slider.
  Real sun/moon position for the location's coordinates and date.
- Weather presets: clear, cloudy, wind (light/strong), rain, snow. Combinable.
- Live: Open-Meteo current weather (wind speed/direction, precipitation, cloud cover,
  temperature) mapped onto the presets.
- Night: stars, moon, emissive city lights on imagery.

## Cameras

- First person: helmet cam with head-look, wind shake, FOV widens with airspeed.
- Third person: chase cam with lag, mouse/stick orbit, auto-return.
- Cinematic: fixed ground cams that track the flyer (for replays/screenshots).

## Controls

| Action | Keyboard | Mouse | Gamepad | Touch |
|---|---|---|---|---|
| Pitch / roll | W S / A D or arrows | cursor offset | left stick | virtual stick |
| Yaw | Q / E | — | triggers | buttons |
| Dive / speed | Shift | — | right trigger | button |
| Deploy chute | Space | — | A | button |
| Canopy toggles | A / D | cursor X | left stick | virtual stick |
| Flare | S | — | B | button |
| Camera | C | — | Y | button |
| Reset | R | — | Start | button |

## Game modes & scoring

- Distance: horizontal distance from exit to touchdown. Crash = 0.
- Target: score from distance to landing-zone centre (1000 at bullseye, 0 outside).
- Leaderboard per location × mode in localStorage. Results screen shows
  flight path on the minimap, max speed, best glide ratio, flight time.

## Phases

1. **Core flight** — scaffold, git init, one location (Eiger) with streamed terrain,
   wingsuit physics, chase cam, HUD, crash detection.
2. **Landing** — parachute deploy/canopy physics, landing rules, both game modes,
   results screen, leaderboard.
3. **World** — all 12 locations, location menu, time of day, sky, weather presets,
   wind field, rain/snow, live weather.
4. **Player & polish** — procedural flyer model, texture presets + upload, first person
   and cinematic cams, procedural audio, mouse/gamepad/touch input, mobile layout.
5. **Deploy & optional** — GitHub Pages workflow, settings panel with Google API key,
   Google Photorealistic 3D Tiles path for city buildings.

## Risks

- Tile providers: rate limits / attribution requirements; cache aggressively and
  show attribution in the HUD corner.
- Google 3D Tiles: physics still uses the heightmap, so buildings are visual only
  unless raycasting against loaded tile meshes is added later.
- Mobile performance: cap terrain LOD and particle counts on low-end devices.
