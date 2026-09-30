import * as THREE from 'three';
import { KeyboardInput } from './core/input/keyboard';
import { newRunState } from './core/state';
import { CameraRig } from './player/cameras';
import { createFlyerModel } from './player/model';
import { FlyerBody } from './sim/wingsuit';
import { Hud } from './ui/hud';
import { Menu } from './ui/menu';
import { GeoOrigin, horizontalDistance } from './world/geo';
import { getLocation } from './world/locations';
import { SkyDome } from './world/sky/sky';
import { TerrainManager } from './world/terrain/chunks';
import { ATTRIBUTION } from './world/terrain/tiles';

const PHYSICS_DT = 1 / 120;
const BODY_CLEARANCE = 0.6;

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
scene.add(flyer);
const body = new FlyerBody();
const rig = new CameraRig(camera, canvas);
const input = new KeyboardInput();
const hud = new Hud();
const run = newRunState();
const wind = new THREE.Vector3();
const menu = new Menu(() => startRun());
document.getElementById('attribution')!.textContent = ATTRIBUTION;

const exitLocal = origin.toLocal(location.exit.lat, location.exit.lon);
const exitPos = new THREE.Vector3(exitLocal.x, 0, exitLocal.z);

function setWind(fromDeg: number, speed: number): void {
  // Wind *from* fromDeg blows toward fromDeg + 180. Scene: +x east, -z north.
  const to = THREE.MathUtils.degToRad(fromDeg + 180);
  wind.set(Math.sin(to) * speed, 0, -Math.cos(to) * speed);
}
setWind(location.wind.fromDeg, location.wind.speed);

async function prepare(): Promise<void> {
  run.phase = 'loading';
  menu.showLocation(location);
  menu.setLoading('Loading terrain…', false);
  terrain.update(exitPos.x, exitPos.z, performance.now());
  await terrain.waitForArea(exitPos.x, exitPos.z, 1);
  const ridge = terrain.getHeight(exitPos.x, exitPos.z);
  exitPos.y = (location.exit.altitude ?? (ridge ?? 0)) + 1.8;
  // Step out over the face: DEMs smooth vertical cliffs into steep slopes, so
  // the exit sits a few metres past the edge at ridge altitude (an overhang).
  const hdg = THREE.MathUtils.degToRad(location.heading);
  exitPos.x += Math.sin(hdg) * location.exitOffset;
  exitPos.z -= Math.cos(hdg) * location.exitOffset;
  placeAtExit();
  menu.setLoading(`Exit altitude ${exitPos.y.toFixed(0)} m`, true);
  run.phase = 'menu';
}

function placeAtExit(): void {
  body.reset(exitPos, location.heading, -25, 5);
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
  run.maxDistance = 0;
  menu.hide();
  hud.show(true);
}

function endRun(reason: string): void {
  run.phase = 'crashed';
  const dist = horizontalDistance(body.position.x, body.position.z, exitPos.x, exitPos.z);
  menu.showResult(
    `${reason}\nDistance ${(dist / 1000).toFixed(2)} km · flight time ${run.time.toFixed(0)} s · max speed ${(run.maxSpeed * 3.6).toFixed(0)} km/h`,
  );
}

function syncModel(): void {
  flyer.position.copy(body.position);
  flyer.quaternion.copy(body.quaternion);
}

let accumulator = 0;
let last = performance.now();

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  if (input.consume('KeyC')) rig.toggle();
  if (input.consume('KeyR') && run.phase !== 'loading') startRun();
  if (input.consume('Enter') && (run.phase === 'menu' || run.phase === 'crashed')) startRun();

  if (run.phase === 'flying') {
    const controls = input.read(dt);
    accumulator += dt;
    while (accumulator >= PHYSICS_DT) {
      body.step(PHYSICS_DT, controls, wind);
      run.time += PHYSICS_DT;
      accumulator -= PHYSICS_DT;
      const ground = terrain.getHeight(body.position.x, body.position.z);
      if (ground !== null && body.position.y < ground + BODY_CLEARANCE) {
        body.position.y = ground + BODY_CLEARANCE;
        const speed = body.velocity.length();
        endRun(`Terrain impact at ${(speed * 3.6).toFixed(0)} km/h`);
        break;
      }
    }
    run.maxSpeed = Math.max(run.maxSpeed, body.velocity.length());
  }

  syncModel();
  terrain.update(body.position.x, body.position.z, now);
  sky.follow(body.position);
  rig.update(body, dt);
  flyer.visible = rig.mode !== 'first';

  if (run.phase === 'flying' || run.phase === 'crashed') {
    hud.update({
      body,
      groundHeight: terrain.getHeight(body.position.x, body.position.z),
      distance: horizontalDistance(body.position.x, body.position.z, exitPos.x, exitPos.z),
      time: run.time,
      wind: location.wind,
      terrainPending: terrain.stats().pending,
    });
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

prepare().catch((err) => {
  console.error(err);
  menu.setLoading(`Failed to load terrain: ${err}`, false);
});
requestAnimationFrame(frame);
