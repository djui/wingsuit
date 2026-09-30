import * as THREE from 'three';
import { GameAudio } from './core/audio';
import { InputManager } from './core/input/manager';
import { loadScores, submitScore } from './core/scores';
import { newRunState, proximityRate, targetScore, type GameMode } from './core/state';
import { CameraRig } from './player/cameras';
import { createFlyerModel } from './player/model';
import { buildSuitTexture, fileToDataUrl, loadSuitChoice, saveSuitChoice, type SuitChoice } from './player/textures';
import { CanopySystem } from './sim/canopy';
import { FlyerBody } from './sim/wingsuit';
import { Hud } from './ui/hud';
import { Menu, type GameSettings } from './ui/menu';
import { loadEnvironmentSettings, saveEnvironmentSettings, type EnvironmentSettings, type EnvironmentState } from './world/environment';
import { GeoOrigin, horizontalDistance } from './world/geo';
import { createLandingZone } from './world/landingZone';
import { getLocation, LOCATIONS } from './world/locations';
import { CloudLayer } from './world/sky/clouds';
import { Precipitation3D } from './world/sky/particles';
import { SkyDome } from './world/sky/sky';
import { TerrainManager } from './world/terrain/chunks';
import { GoogleTiles } from './world/terrain/google3d';
import { ATTRIBUTION } from './world/terrain/tiles';
import { fetchLiveWeather, resolveEnvironment, settingsFromLive } from './world/weather';
import { WindField } from './world/wind';
import { TreeField } from './world/trees';
import { drawMinimap } from './ui/minimap';

const PHYSICS_DT = 1 / 120;
const BODY_CLEARANCE = 0.6;
/** Landing limits under canopy (m/s). */
const LANDING = { safeSink: 3.0, safeGround: 7.0, perfectSink: 1.5, perfectGround: 4.0, maxSlopeDeg: 30 };

const canvas = document.getElementById('view') as HTMLCanvasElement;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.55;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const fog = new THREE.FogExp2(0xc8d6e6, 0.000045);
scene.fog = fog;
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.3, 120000);
scene.add(camera);

const sky = new SkyDome(scene);
const lowEnd = window.matchMedia('(pointer: coarse)').matches;
sky.enableShadows(renderer, lowEnd ? 1024 : 2048);
const glare = document.getElementById('glare')!;
const clouds = new CloudLayer();
scene.add(clouds.mesh);
const precipitation = new Precipitation3D();
scene.add(precipitation.group);
const requestedLoc = new URLSearchParams(window.location.search).get('loc') ?? localStorage.getItem('wingsuit.location') ?? 'eiger';
const location = LOCATIONS.some((l) => l.id === requestedLoc) ? getLocation(requestedLoc) : getLocation('eiger');
localStorage.setItem('wingsuit.location', location.id);
const origin = new GeoOrigin(location.exit);
const terrain = new TerrainManager(origin, location.loadRadius);
terrain.shadows = !lowEnd;
scene.add(terrain.group);
const google = new GoogleTiles(origin, camera, renderer);
scene.add(google.group);
const trees = new TreeField(terrain, !lowEnd);
scene.add(trees.mesh);

const flyer = createFlyerModel();
scene.add(flyer.group);
flyer.group.traverse((o) => {
  if (o instanceof THREE.Mesh) o.castShadow = true;
});
const body = new FlyerBody();
const canopy = new CanopySystem();
const rig = new CameraRig(camera, canvas);
const input = new InputManager(canvas);
const audio = new GameAudio();
let suitChoice: SuitChoice = loadSuitChoice();
let suitTexture: THREE.CanvasTexture | undefined;
const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
let gameSettings: GameSettings = { mouseSteering: false, touchControls: coarsePointer, audio: audio.enabled, googleTiles: false, googleKey: '' };
try {
  const raw = localStorage.getItem('wingsuit.settings');
  if (raw) gameSettings = { ...gameSettings, ...(JSON.parse(raw) as Partial<GameSettings>) };
} catch {
  /* ignore */
}
const hud = new Hud();
const run = newRunState();
const wind = new THREE.Vector3();
const windField = new WindField();
let envSettings: EnvironmentSettings = loadEnvironmentSettings();
let envState: EnvironmentState;
const menu = new Menu({
  onStart: () => startRun(),
  onMode: (mode) => setMode(mode),
  onEnvironment: (settings) => applyEnvironment(settings),
  onLive: () => useLiveWeather(),
  onLocation: (id) => {
    localStorage.setItem('wingsuit.location', id);
    window.location.search = `?loc=${id}`;
  },
  onSuit: (choice) => void applySuit(choice),
  onSuitUpload: async (file) => {
    try {
      const dataUrl = await fileToDataUrl(file);
      await applySuit({ presetId: 'custom', customImage: dataUrl });
    } catch (err) {
      console.warn('suit upload failed', err);
    }
  },
  onSettings: (settings) => applySettings(settings),
});

async function applySuit(choice: SuitChoice): Promise<void> {
  suitChoice = choice;
  saveSuitChoice(choice);
  suitTexture = await buildSuitTexture(choice, suitTexture);
  flyer.setTexture(suitTexture);
  menu.setSuits(choice);
}

function applySettings(settings: GameSettings): void {
  gameSettings = settings;
  try {
    localStorage.setItem('wingsuit.settings', JSON.stringify(settings));
  } catch {
    /* ignore */
  }
  input.mouse.enabled = settings.mouseSteering;
  rig.mouseSteering = settings.mouseSteering;
  input.touch.setEnabled(settings.touchControls);
  audio.setEnabled(settings.audio);
  menu.setSettings(settings);
  const wantGoogle = settings.googleTiles && settings.googleKey.length > 20;
  if (wantGoogle && !google.active) {
    google.enable(settings.googleKey);
    google.setTint(sky.output.sunColor.clone().lerp(new THREE.Color(1, 1, 1), 0.5));
    menu.setGoogleStatus('Loading Google 3D Tiles… the elevation terrain stays as physics fallback.');
  } else if (!wantGoogle && google.active) {
    google.disable();
    menu.setGoogleStatus('Google 3D Tiles off.');
  } else if (settings.googleTiles && !wantGoogle) {
    menu.setGoogleStatus('Enter a Google Maps API key (Map Tiles API enabled) to turn on 3D tiles.');
  }
  terrain.group.visible = !google.active;
}

// Audio needs a user gesture to start.
const unlockAudio = () => audio.unlock();
window.addEventListener('keydown', unlockAudio);
window.addEventListener('pointerdown', unlockAudio);
document.getElementById('attribution')!.textContent = ATTRIBUTION;

const exitLocal = origin.toLocal(location.exit.lat, location.exit.lon);
const exitPos = new THREE.Vector3(exitLocal.x, 0, exitLocal.z);
const lzLocal = origin.toLocal(location.landing.lat, location.landing.lon);
const lzPos = new THREE.Vector3(lzLocal.x, 0, lzLocal.z);
const landingZone = createLandingZone(location.landing.radius);
scene.add(landingZone.group);

function applyEnvironment(settings: EnvironmentSettings): void {
  envSettings = settings;
  saveEnvironmentSettings(settings);
  envState = resolveEnvironment(settings, location.exit.lat, location.exit.lon);
  sky.apply(envState);
  sky.updateEnvironment(renderer, scene);
  renderer.toneMappingExposure = sky.output.exposure;
  fog.color.copy(sky.output.fogColor);
  fog.density = 2 / envState.visibility;
  clouds.setCover(envState.cloudCover);
  clouds.setLight(sky.output.sunColor, 0.35 + 0.65 * sky.output.daylight);
  clouds.setAltitude(exitPos.y + (envState.cloudCover > 0.6 ? 350 : 700));
  precipitation.set(envState.precip, envState.precipIntensity);
  google.setTint(sky.output.sunColor.clone().lerp(new THREE.Color(1, 1, 1), 0.5));
  windField.set(envState.windSpeed, envState.windFrom, envState.gustiness, envState.precipIntensity);
}

async function useLiveWeather(): Promise<void> {
  menu.setLiveStatus('Fetching live weather…', true);
  try {
    const live = await fetchLiveWeather(location.exit.lat, location.exit.lon);
    const settings = settingsFromLive(live, envSettings);
    menu.setEnvironment(settings);
    applyEnvironment(settings);
    menu.setLiveStatus(
      `Now at ${location.name}: ${live.description}, ${live.temperature.toFixed(0)} °C, wind ${live.windSpeed.toFixed(0)} m/s from ${live.windFrom.toFixed(0)}°`,
    );
  } catch (err) {
    menu.setLiveStatus(`Live weather unavailable (${err instanceof Error ? err.message : err})`);
  }
}

function setMode(mode: GameMode): void {
  run.mode = mode;
  menu.setScores(loadScores(location.id, mode));
}

async function prepare(): Promise<void> {
  run.phase = 'loading';
  menu.setLocations(LOCATIONS, location.id);
  menu.showLocation(location);
  setMode(menu.mode);
  // Site default wind unless the player has chosen otherwise.
  if (envSettings.windSpeed === 3 && envSettings.windFrom === 270) {
    envSettings = { ...envSettings, windSpeed: location.wind.speed, windFrom: location.wind.fromDeg };
  }
  menu.setEnvironment(envSettings);
  applyEnvironment(envSettings);
  applySettings(gameSettings);
  void applySuit(suitChoice);
  menu.setLoading('Loading terrain…', false);
  if (location.exit.altitude === undefined) {
    // Stand on an elevation grid node so the carved edge starts right at the feet.
    const snapped = terrain.snapToGrid(exitPos.x, exitPos.z);
    exitPos.x = snapped.x;
    exitPos.z = snapped.z;
    terrain.setCliff({
      x: exitPos.x,
      z: exitPos.z,
      headingRad: THREE.MathUtils.degToRad(location.heading),
      overhang: location.exitOffset * 2,
      radius: 400,
    });
  }
  terrain.update(exitPos.x, exitPos.z, performance.now());
  await terrain.waitForArea(exitPos.x, exitPos.z, 1);
  await terrain.waitForArea(lzPos.x, lzPos.z, 0);
  const ridge = terrain.getHeight(exitPos.x, exitPos.z);
  exitPos.y = (location.exit.altitude ?? (ridge ?? 0)) + 0.7;
  lzPos.y = terrain.getHeight(lzPos.x, lzPos.z) ?? 0;
  landingZone.group.position.copy(lzPos);
  landingZone.conform(lzPos.x, lzPos.z, (x, z) => terrain.getHeight(x, z));
  applyEnvironment(envSettings); // cloud base depends on the exit altitude
  placeAtExit();
  // The flyer's own feet are the reference for ground contact while standing.
  standAtExit();
  const lzDist = horizontalDistance(exitPos.x, exitPos.z, lzPos.x, lzPos.z);
  menu.setLoading(`Exit ${exitPos.y.toFixed(0)} m · landing zone ${lzPos.y.toFixed(0)} m, ${(lzDist / 1000).toFixed(1)} km away`, true);
  run.phase = 'menu';
}

function placeAtExit(): void {
  body.reset(exitPos, location.heading, 0, 0);
  canopy.reset();
  flyer.setCanopy(0);
  flyer.setStanding(1);
  input.touch.setCanopyMode(false);
  rig.reset();
  syncModel();
  rig.update(body, 1);
}

/** Stand on the edge, waiting for the jump. */
function standAtExit(): void {
  placeAtExit();
  run.phase = 'ready';
  run.time = 0;
  run.maxSpeed = 0;
  run.peakG = 0;
  run.score = 0;
  run.proximity = 0;
  run.path.length = 0;
  run.deployIndex = -1;
}

function startRun(): void {
  if (run.phase === 'loading') return;
  standAtExit();
  menu.hide();
  hud.show(true);
}

/** Push off the edge: a real exit is a hop forward, then the suit does the rest. */
function jump(): void {
  if (run.phase !== 'ready') return;
  run.phase = 'flying';
  flyer.setStanding(0);
  body.reset(exitPos, location.heading, -12, 3.5);
  body.velocity.y += 1.2;
  audio.unlock();
}

/** Small safety margin right at the edge line where the carved cliff meets the ridge. */
function inExitOverhang(): boolean {
  if (body.position.y > exitPos.y + 2 || body.position.y < exitPos.y - 40) return false;
  return horizontalDistance(body.position.x, body.position.z, exitPos.x, exitPos.z) < 6;
}

function finishRun(success: boolean, outcome: string): void {
  run.phase = success ? 'landed' : 'crashed';
  audio.impact(!success);
  run.outcome = outcome;
  const dist = horizontalDistance(body.position.x, body.position.z, exitPos.x, exitPos.z);
  const lzDist = horizontalDistance(body.position.x, body.position.z, lzPos.x, lzPos.z);
  const lines = [outcome];
  let rank = 0;
  if (success) {
    run.score = run.mode === 'distance' ? Math.round(dist) : run.mode === 'target' ? targetScore(lzDist) : Math.round(run.proximity);
    const detail =
      run.mode === 'distance'
        ? `${(dist / 1000).toFixed(2)} km in ${run.time.toFixed(0)} s`
        : run.mode === 'target'
          ? `${lzDist.toFixed(0)} m from centre`
          : `${Math.round(run.proximity).toLocaleString()} prox in ${run.time.toFixed(0)} s`;
    rank = submitScore(location.id, run.mode, { score: run.score, detail, date: new Date().toISOString().slice(0, 10) });
    lines.push(
      run.mode === 'distance'
        ? `Score ${run.score.toLocaleString()} (metres)`
        : run.mode === 'target'
          ? `Score ${run.score.toLocaleString()} / 1000`
          : `Score ${run.score.toLocaleString()} proximity points`,
    );
    if (rank === 1) lines.push('New best!');
    else if (rank > 0) lines.push(`Rank #${rank}`);
  } else {
    lines.push('Score 0');
  }
  lines.push(
    `Distance ${(dist / 1000).toFixed(2)} km · to target ${lzDist >= 1000 ? `${(lzDist / 1000).toFixed(2)} km` : `${lzDist.toFixed(0)} m`} · proximity ${Math.round(run.proximity).toLocaleString()}`,
    `Flight ${run.time.toFixed(0)} s · max ${(run.maxSpeed * 3.6).toFixed(0)} km/h · peak ${run.peakG.toFixed(1)} g` +
      (canopy.phase !== 'stowed' ? ` · opened at ${canopy.deployAltitude.toFixed(0)} m, ${(canopy.deploySpeed * 3.6).toFixed(0)} km/h` : ''),
  );
  menu.showResult(lines.join('\n'), success);
  menu.setScores(loadScores(location.id, run.mode), rank);
  drawMinimap(menu.map, {
    terrain,
    path: run.path,
    deployIndex: run.deployIndex,
    exit: { x: exitPos.x, z: exitPos.z },
    landing: { x: lzPos.x, z: lzPos.z, radius: location.landing.radius },
  });
  menu.showMap(true);
}

function syncModel(): void {
  flyer.group.position.copy(body.position);
  flyer.group.quaternion.copy(body.quaternion);
  flyer.setCanopy(canopy.openness);
}

const _normal = new THREE.Vector3();
/** Tile surface height under the flyer, refreshed once per frame (raycasts are not free). */
let tileGround: number | null = null;

/** Highest known surface under scene x/z: elevation data or 3D tiles (buildings). */
function surfaceHeight(x: number, z: number): number | null {
  const dem = terrain.getHeight(x, z);
  if (tileGround === null) return dem;
  return dem === null ? tileGround : Math.max(dem, tileGround);
}

/** Called when the body touches terrain. Decides landing vs crash. */
function groundContact(ground: number): void {
  body.position.y = ground + BODY_CLEARANCE;
  const v = body.velocity;
  const sink = -v.y;
  const groundSpeed = Math.hypot(v.x, v.z);
  const speedKmh = (v.length() * 3.6).toFixed(0);
  if (canopy.phase !== 'open') {
    finishRun(false, canopy.phase === 'deploying' ? `Canopy still opening — impact at ${speedKmh} km/h` : `Terrain impact at ${speedKmh} km/h`);
    return;
  }
  terrain.getNormal(body.position.x, body.position.z, _normal);
  const slopeDeg = THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(_normal.y, -1, 1)));
  const desc = `sink ${sink.toFixed(1)} m/s, ground speed ${groundSpeed.toFixed(1)} m/s`;
  if (slopeDeg > LANDING.maxSlopeDeg) {
    finishRun(false, `Landed on a ${slopeDeg.toFixed(0)}° slope and tumbled (${desc})`);
  } else if (sink <= LANDING.perfectSink && groundSpeed <= LANDING.perfectGround) {
    finishRun(true, `Perfect stand-up landing (${desc})`);
  } else if (sink <= LANDING.safeSink && groundSpeed <= LANDING.safeGround) {
    finishRun(true, `Landed (${desc})`);
  } else {
    finishRun(false, `Hard landing (${desc})`);
  }
  v.set(0, 0, 0);
}

let accumulator = 0;
let last = performance.now();
const _fwd = new THREE.Vector3();
let gamepadWasConnected: boolean | null = null;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  const frameInput = input.read(dt);
  const { controls, actions } = frameInput;
  if (actions.camera) rig.toggle();
  if (actions.mute) applySettings({ ...gameSettings, audio: !gameSettings.audio });
  if (actions.restart && run.phase !== 'loading') startRun();
  if (actions.start && (run.phase === 'menu' || run.phase === 'crashed' || run.phase === 'landed')) startRun();
  else if ((actions.start || actions.deploy) && run.phase === 'ready') {
    jump();
    actions.deploy = false; // the same press must not also pull the chute
  }
  if (frameInput.zoom !== 0) rig.zoomBy(frameInput.zoom * dt * 1.5);
  if (input.gamepad.connected !== gamepadWasConnected) {
    gamepadWasConnected = input.gamepad.connected;
    menu.setGamepad(input.gamepad.connected);
  }

  if (run.phase === 'flying') {
    if (actions.deploy && canopy.deploy(body)) {
      audio.opening();
      run.deployIndex = run.path.length / 4;
    }
    if (canopy.phase === 'stowed') {
      if (actions.rollLeft) body.startManeuver('rollLeft');
      if (actions.rollRight) body.startManeuver('rollRight');
      if (actions.loop) body.startManeuver('loop');
      if (actions.frontFlip) body.startManeuver('frontFlip');
    }
    // Under canopy the same axes drive the toggles: roll = left/right, pitch-up or flare = both.
    const brake = Math.max(0, controls.pitch, frameInput.flare);
    const toggles = { left: Math.min(1, Math.max(0, -controls.roll) + brake), right: Math.min(1, Math.max(0, controls.roll) + brake) };
    flyer.setControls(controls.pitch, controls.roll, controls.dive);
    flyer.setCanopyControls(toggles.left, toggles.right);
    input.touch.setCanopyMode(canopy.phase !== 'stowed');
    accumulator += dt;
    while (accumulator >= PHYSICS_DT) {
      windField.sample(body.position, run.time, terrain, wind);
      const hardOpening = canopy.step(PHYSICS_DT, body, toggles, wind);
      body.step(PHYSICS_DT, controls, wind, {
        aeroScale: 1 - canopy.openness,
        extraForce: canopy.force,
        orientation: canopy.phase === 'stowed' ? undefined : canopy.quaternion,
        orientationWeight: canopy.openness,
      });
      run.time += PHYSICS_DT;
      accumulator -= PHYSICS_DT;
      run.peakG = Math.max(run.peakG, body.aero.gForce);
      if (hardOpening) {
        finishRun(false, `Hard opening at ${(canopy.deploySpeed * 3.6).toFixed(0)} km/h — ${canopy.peakOpeningG.toFixed(1)} g tore the canopy`);
        break;
      }
      const ground = surfaceHeight(body.position.x, body.position.z);
      if (ground !== null) {
        if (canopy.phase === 'stowed') {
          run.proximity += proximityRate(body.position.y - ground, body.aero.airspeed) * PHYSICS_DT;
        }
        if (body.position.y < ground + BODY_CLEARANCE && !inExitOverhang()) {
          groundContact(ground);
          break;
        }
      }
      const tree = trees.hit(body.position.x, body.position.y, body.position.z, 0.5);
      if (tree) {
        audio.impact(true);
        finishRun(false, `Hit a tree at ${(body.velocity.length() * 3.6).toFixed(0)} km/h`);
        break;
      }
    }
    run.maxSpeed = Math.max(run.maxSpeed, body.velocity.length());
    // Path sample every ~0.25 s for the results minimap.
    if (run.path.length === 0 || run.time - run.path[run.path.length - 4] > 0.25) {
      run.path.push(run.time, body.position.x, body.position.y, body.position.z);
    }
  }

  syncModel();
  terrain.update(body.position.x, body.position.z, now);
  trees.enabled = !google.active;
  trees.update(body.position.x, body.position.z);
  if (google.active) {
    google.update();
    if (!google.calibrated) {
      const dem = terrain.getHeight(exitPos.x, exitPos.z);
      if (dem !== null && google.calibrate(exitPos.x, exitPos.z, dem)) {
        menu.setGoogleStatus(`Google 3D Tiles on (vertical offset ${google.calibration.toFixed(0)} m vs elevation data).`);
      }
    }
    tileGround = google.calibrated ? google.groundHeight(body.position.x, body.position.z) : null;
    if (google.error) menu.setGoogleStatus(`Google 3D Tiles error: ${google.error}`);
    // Fall back to the elevation terrain if the tiles cannot load.
    terrain.group.visible = google.error !== '';
    document.getElementById('attribution')!.textContent = `${google.attribution} · Elevation: Mapzen/AWS Terrain Tiles`;
  } else {
    tileGround = null;
  }
  sky.follow(body.position);
  clouds.update(body.position, wind, dt);
  if (!(window as unknown as { __freezeCamera?: boolean }).__freezeCamera) rig.update(body, dt, canopy.openness, terrain);
  precipitation.update(camera.position, wind, dt, now / 1000);
  updateGlare();
  flyer.update(dt, run.phase === 'flying' ? body.aero.airspeed : 0);
  audio.update(dt, body.aero.airspeed, canopy.openness, canopy.brake, envState?.precip === 'rain' ? envState.precipIntensity : 0, run.phase === 'flying');
  // Keep the camera above the terrain.
  const camGround = terrain.getHeight(camera.position.x, camera.position.z);
  if (camGround !== null && camera.position.y < camGround + 1.5) {
    camera.position.y = camGround + 1.5;
    if (rig.mode === 'chase') camera.lookAt(body.position);
  }
  flyer.group.visible = rig.mode !== 'first' || canopy.openness > 0.02;
  if (rig.mode === 'first') {
    // Hide the body but keep the canopy visible from the helmet cam.
    flyer.group.children[0].visible = false;
  } else {
    flyer.group.children[0].visible = true;
  }

  if (run.phase !== 'menu' && run.phase !== 'loading') {
    body.forward(_fwd);
    const heading = Math.atan2(_fwd.x, -_fwd.z);
    const lzBearing = Math.atan2(lzPos.x - body.position.x, -(lzPos.z - body.position.z));
    hud.update({
      body,
      groundHeight: surfaceHeight(body.position.x, body.position.z),
      distance: horizontalDistance(body.position.x, body.position.z, exitPos.x, exitPos.z),
      time: run.time,
      wind: { fromDeg: windField.fromDeg, speed: Math.hypot(wind.x, wind.z) },
      terrainPending: terrain.stats().pending,
      canopy: canopy.phase,
      proximity: run.proximity,
      ready: run.phase === 'ready',
      lzDistance: horizontalDistance(body.position.x, body.position.z, lzPos.x, lzPos.z),
      lzRelativeBearing: Math.atan2(Math.sin(lzBearing - heading), Math.cos(lzBearing - heading)),
    });
  }
  renderer.render(scene, camera);
}

const _camDir = new THREE.Vector3();
const _sunProbe = new THREE.Vector3();
let glareLevel = 0;

/** Whiteout when looking straight at the sun, faded if terrain blocks it. */
function updateGlare(): void {
  camera.getWorldDirection(_camDir);
  const cos = _camDir.dot(sky.sunDir);
  const angle = Math.acos(THREE.MathUtils.clamp(cos, -1, 1));
  let target = 0;
  if (cos > 0 && sky.output.sunIntensity > 0.05) {
    const inner = THREE.MathUtils.degToRad(3);
    const outer = THREE.MathUtils.degToRad(16);
    let f = 1 - THREE.MathUtils.smoothstep(angle, inner, outer);
    // Occlusion: march toward the sun and stop if the terrain rises above the ray.
    if (f > 0.001) {
      let blocked = false;
      for (let d = 60; d < 12000 && !blocked; d += d < 600 ? 40 : 150) {
        _sunProbe.copy(camera.position).addScaledVector(sky.sunDir, d);
        const h = terrain.getHeight(_sunProbe.x, _sunProbe.z);
        if (h !== null && _sunProbe.y < h) blocked = true;
      }
      if (blocked) f = 0;
    }
    target = f * f * 0.92 * sky.output.sunIntensity;
    // Screen position of the sun for the gradient centre.
    _sunProbe.copy(camera.position).addScaledVector(sky.sunDir, 1000).project(camera);
    glare.style.setProperty('--gx', `${((_sunProbe.x + 1) / 2) * 100}%`);
    glare.style.setProperty('--gy', `${((1 - _sunProbe.y) / 2) * 100}%`);
  }
  glareLevel += (target - glareLevel) * 0.15;
  glare.style.opacity = glareLevel.toFixed(3);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (import.meta.env.DEV) {
  // Debug handle for scripted tests: window.__wingsuit
  Object.assign(window, {
    __wingsuit: { body, canopy, run, terrain, exitPos, lzPos, wind, startRun, sky, rig, camera, flyer, renderer, scene, env: () => envState },
  });
}

prepare().catch((err) => {
  console.error(err);
  menu.setLoading(`Failed to load terrain: ${err}`, false);
});
requestAnimationFrame(frame);
