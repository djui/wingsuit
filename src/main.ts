import * as THREE from 'three';
import { KeyboardInput } from './core/input/keyboard';
import { loadScores, submitScore } from './core/scores';
import { newRunState, targetScore, type GameMode } from './core/state';
import { CameraRig } from './player/cameras';
import { createFlyerModel } from './player/model';
import { CanopySystem } from './sim/canopy';
import { FlyerBody } from './sim/wingsuit';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { GeoOrigin, horizontalDistance } from './world/geo';
import { createLandingZone } from './world/landingZone';
import { getLocation } from './world/locations';
import { SkyDome } from './world/sky/sky';
import { TerrainManager } from './world/terrain/chunks';
import { ATTRIBUTION } from './world/terrain/tiles';

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
scene.fog = new THREE.FogExp2(0xc8d6e6, 0.000045);
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.3, 120000);
scene.add(camera);

const sky = new SkyDome(scene);
const location = getLocation(new URLSearchParams(window.location.search).get('loc') ?? 'eiger');
const origin = new GeoOrigin(location.exit);
const terrain = new TerrainManager(origin, location.loadRadius);
scene.add(terrain.group);

const flyer = createFlyerModel();
scene.add(flyer.group);
const body = new FlyerBody();
const canopy = new CanopySystem();
const rig = new CameraRig(camera, canvas);
const input = new KeyboardInput();
const hud = new Hud();
const run = newRunState();
const wind = new THREE.Vector3();
const menu = new Menu(
  () => startRun(),
  (mode) => setMode(mode),
);
document.getElementById('attribution')!.textContent = ATTRIBUTION;

const exitLocal = origin.toLocal(location.exit.lat, location.exit.lon);
const exitPos = new THREE.Vector3(exitLocal.x, 0, exitLocal.z);
const lzLocal = origin.toLocal(location.landing.lat, location.landing.lon);
const lzPos = new THREE.Vector3(lzLocal.x, 0, lzLocal.z);
const landingZone = createLandingZone(location.landing.radius);
scene.add(landingZone);

function setWind(fromDeg: number, speed: number): void {
  // Wind *from* fromDeg blows toward fromDeg + 180. Scene: +x east, -z north.
  const to = THREE.MathUtils.degToRad(fromDeg + 180);
  wind.set(Math.sin(to) * speed, 0, -Math.cos(to) * speed);
}
setWind(location.wind.fromDeg, location.wind.speed);

function setMode(mode: GameMode): void {
  run.mode = mode;
  menu.setScores(loadScores(location.id, mode));
}

async function prepare(): Promise<void> {
  run.phase = 'loading';
  menu.showLocation(location);
  setMode(menu.mode);
  menu.setLoading('Loading terrain…', false);
  terrain.update(exitPos.x, exitPos.z, performance.now());
  await terrain.waitForArea(exitPos.x, exitPos.z, 1);
  await terrain.waitForArea(lzPos.x, lzPos.z, 0);
  const ridge = terrain.getHeight(exitPos.x, exitPos.z);
  exitPos.y = (location.exit.altitude ?? (ridge ?? 0)) + 1.8;
  // Step out over the face: DEMs smooth vertical cliffs into steep slopes, so
  // the exit sits a few metres past the edge at ridge altitude (an overhang).
  const hdg = THREE.MathUtils.degToRad(location.heading);
  exitPos.x += Math.sin(hdg) * location.exitOffset;
  exitPos.z -= Math.cos(hdg) * location.exitOffset;
  lzPos.y = terrain.getHeight(lzPos.x, lzPos.z) ?? 0;
  landingZone.position.copy(lzPos);
  placeAtExit();
  const lzDist = horizontalDistance(exitPos.x, exitPos.z, lzPos.x, lzPos.z);
  menu.setLoading(`Exit ${exitPos.y.toFixed(0)} m · landing zone ${lzPos.y.toFixed(0)} m, ${(lzDist / 1000).toFixed(1)} km away`, true);
  run.phase = 'menu';
}

function placeAtExit(): void {
  body.reset(exitPos, location.heading, -25, 5);
  canopy.reset();
  flyer.setCanopy(0);
  rig.reset();
  syncModel();
  rig.update(body, 1);
}

function startRun(): void {
  if (run.phase === 'loading') return;
  placeAtExit();
  run.phase = 'flying';
  run.time = 0;
  run.maxSpeed = 0;
  run.peakG = 0;
  run.score = 0;
  menu.hide();
  hud.show(true);
}

function finishRun(success: boolean, outcome: string): void {
  run.phase = success ? 'landed' : 'crashed';
  run.outcome = outcome;
  const dist = horizontalDistance(body.position.x, body.position.z, exitPos.x, exitPos.z);
  const lzDist = horizontalDistance(body.position.x, body.position.z, lzPos.x, lzPos.z);
  const lines = [outcome];
  let rank = 0;
  if (success) {
    run.score = run.mode === 'distance' ? Math.round(dist) : targetScore(lzDist);
    const detail =
      run.mode === 'distance'
        ? `${(dist / 1000).toFixed(2)} km in ${run.time.toFixed(0)} s`
        : `${lzDist.toFixed(0)} m from centre`;
    rank = submitScore(location.id, run.mode, { score: run.score, detail, date: new Date().toISOString().slice(0, 10) });
    lines.push(run.mode === 'distance' ? `Score ${run.score.toLocaleString()} (metres)` : `Score ${run.score.toLocaleString()} / 1000`);
    if (rank === 1) lines.push('New best!');
    else if (rank > 0) lines.push(`Rank #${rank}`);
  } else {
    lines.push('Score 0');
  }
  lines.push(
    `Distance ${(dist / 1000).toFixed(2)} km · to target ${lzDist >= 1000 ? `${(lzDist / 1000).toFixed(2)} km` : `${lzDist.toFixed(0)} m`}`,
    `Flight ${run.time.toFixed(0)} s · max ${(run.maxSpeed * 3.6).toFixed(0)} km/h · peak ${run.peakG.toFixed(1)} g` +
      (canopy.phase !== 'stowed' ? ` · opened at ${canopy.deployAltitude.toFixed(0)} m, ${(canopy.deploySpeed * 3.6).toFixed(0)} km/h` : ''),
  );
  menu.showResult(lines.join('\n'), success);
  menu.setScores(loadScores(location.id, run.mode), rank);
}

function syncModel(): void {
  flyer.group.position.copy(body.position);
  flyer.group.quaternion.copy(body.quaternion);
  flyer.setCanopy(canopy.openness);
}

const _normal = new THREE.Vector3();

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

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (input.consume('KeyC')) rig.toggle();
  if (input.consume('KeyR') && run.phase !== 'loading') startRun();
  if (input.consume('Enter') && (run.phase === 'menu' || run.phase === 'crashed' || run.phase === 'landed')) startRun();
  const deployRequested = input.consume('Space');

  if (run.phase === 'flying') {
    if (deployRequested) canopy.deploy(body);
    const controls = input.read(dt);
    // Under canopy the same keys drive the toggles: A/D = left/right, S = both.
    const brake = Math.max(0, controls.pitch);
    const toggles = { left: Math.min(1, Math.max(0, -controls.roll) + brake), right: Math.min(1, Math.max(0, controls.roll) + brake) };
    accumulator += dt;
    while (accumulator >= PHYSICS_DT) {
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
      const ground = terrain.getHeight(body.position.x, body.position.z);
      if (ground !== null && body.position.y < ground + BODY_CLEARANCE) {
        groundContact(ground);
        break;
      }
    }
    run.maxSpeed = Math.max(run.maxSpeed, body.velocity.length());
  }

  syncModel();
  terrain.update(body.position.x, body.position.z, now);
  sky.follow(body.position);
  rig.update(body, dt, canopy.openness);
  // Keep the camera above the terrain.
  const camGround = terrain.getHeight(camera.position.x, camera.position.z);
  if (camGround !== null && camera.position.y < camGround + 1.5) {
    camera.position.y = camGround + 1.5;
    if (rig.mode === 'chase') camera.lookAt(body.position);
  }
  flyer.group.visible = rig.mode !== 'first' || canopy.openness > 0.02;

  if (run.phase !== 'menu' && run.phase !== 'loading') {
    body.forward(_fwd);
    const heading = Math.atan2(_fwd.x, -_fwd.z);
    const lzBearing = Math.atan2(lzPos.x - body.position.x, -(lzPos.z - body.position.z));
    hud.update({
      body,
      groundHeight: terrain.getHeight(body.position.x, body.position.z),
      distance: horizontalDistance(body.position.x, body.position.z, exitPos.x, exitPos.z),
      time: run.time,
      wind: location.wind,
      terrainPending: terrain.stats().pending,
      canopy: canopy.phase,
      lzDistance: horizontalDistance(body.position.x, body.position.z, lzPos.x, lzPos.z),
      lzRelativeBearing: Math.atan2(Math.sin(lzBearing - heading), Math.cos(lzBearing - heading)),
    });
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

if (import.meta.env.DEV) {
  // Debug handle for scripted tests: window.__wingsuit
  Object.assign(window, { __wingsuit: { body, canopy, run, terrain, exitPos, lzPos, wind, startRun } });
}

prepare().catch((err) => {
  console.error(err);
  menu.setLoading(`Failed to load terrain: ${err}`, false);
});
requestAnimationFrame(frame);
