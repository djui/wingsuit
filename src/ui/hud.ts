import type { CanopyPhase } from '../sim/canopy';
import type { FlyerBody } from '../sim/wingsuit';

export interface HudData {
  body: FlyerBody;
  groundHeight: number | null;
  distance: number;
  time: number;
  wind: { fromDeg: number; speed: number };
  terrainPending: number;
  canopy: CanopyPhase;
  /** Landing zone distance (m) and bearing relative to the flyer's heading (rad, + = right). */
  lzDistance: number;
  lzRelativeBearing: number;
}

function el(id: string): HTMLElement {
  const e = document.getElementById(id);
  if (!e) throw new Error(`missing #${id}`);
  return e;
}

export class Hud {
  private root = el('hud');
  private alt = el('hud-alt');
  private agl = el('hud-agl');
  private speed = el('hud-speed');
  private vs = el('hud-vs');
  private glide = el('hud-glide');
  private dist = el('hud-dist');
  private time = el('hud-time');
  private wind = el('hud-wind');
  private status = el('hud-status');
  private g = el('hud-g');
  private chute = el('hud-chute');
  private lz = el('hud-lz');
  private lzArrow = el('hud-lz-arrow');
  private help = el('hud-help');

  show(visible: boolean): void {
    this.root.classList.toggle('hidden', !visible);
  }

  update(d: HudData): void {
    const v = d.body.velocity;
    const hSpeed = Math.hypot(v.x, v.z);
    const sink = -v.y;
    this.alt.textContent = `${d.body.position.y.toFixed(0)} m`;
    this.agl.textContent = d.groundHeight === null ? '—' : `${Math.max(0, d.body.position.y - d.groundHeight).toFixed(0)} m`;
    this.speed.textContent = `${(d.body.aero.airspeed * 3.6).toFixed(0)} km/h`;
    this.vs.textContent = `${(-sink).toFixed(1)} m/s`;
    this.glide.textContent = sink > 0.5 ? `${(hSpeed / sink).toFixed(2)} : 1` : '—';
    this.dist.textContent = d.distance >= 1000 ? `${(d.distance / 1000).toFixed(2)} km` : `${d.distance.toFixed(0)} m`;
    const m = Math.floor(d.time / 60);
    const s = Math.floor(d.time % 60);
    this.time.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    this.wind.textContent = `${d.wind.speed.toFixed(0)} m/s from ${d.wind.fromDeg.toFixed(0)}°`;
    this.g.textContent = `${d.body.aero.gForce.toFixed(1)} g`;
    this.chute.textContent = d.canopy === 'stowed' ? 'STOWED' : d.canopy === 'deploying' ? 'OPENING' : 'OPEN';
    this.chute.classList.toggle('accent', d.canopy !== 'stowed');
    this.lz.textContent = d.lzDistance >= 1000 ? `${(d.lzDistance / 1000).toFixed(2)} km` : `${d.lzDistance.toFixed(0)} m`;
    this.lzArrow.style.transform = `rotate(${(d.lzRelativeBearing * 180) / Math.PI}deg)`;
    const a = d.body.aero;
    const stalled = a.stalled && d.canopy === 'stowed';
    this.status.textContent = stalled ? 'STALL' : d.terrainPending > 0 ? `loading terrain (${d.terrainPending})` : '';
    this.status.classList.toggle('warn', stalled);
    this.help.textContent =
      d.canopy === 'stowed'
        ? 'W/S pitch · A/D roll · Q/E yaw · Shift dive · Space parachute · C camera · R restart'
        : 'A/D toggles · S flare (both toggles) · C camera · R restart';
  }
}
