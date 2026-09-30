import type { Actions, InputSource, RawInput } from './types';

/**
 * On-screen controls: a virtual stick on the left half of the screen and
 * hold/tap buttons on the right. Enabled on coarse-pointer devices or from
 * the menu.
 */
export class TouchInput implements InputSource {
  enabled = false;
  private root: HTMLElement;
  private stick: HTMLElement;
  private knob: HTMLElement;
  private stickId: number | null = null;
  private origin = { x: 0, y: 0 };
  private axis = { x: 0, y: 0 };
  private held = new Set<string>();
  private tapped = new Set<string>();

  constructor() {
    this.root = document.getElementById('touch')!;
    this.stick = document.getElementById('touch-stick')!;
    this.knob = document.getElementById('touch-knob')!;
    const zone = document.getElementById('touch-zone')!;
    zone.addEventListener('pointerdown', (e) => {
      if (this.stickId !== null) return;
      this.stickId = e.pointerId;
      this.origin = { x: e.clientX, y: e.clientY };
      this.stick.style.left = `${e.clientX}px`;
      this.stick.style.top = `${e.clientY}px`;
      this.stick.classList.add('active');
      zone.setPointerCapture(e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.stickId) return;
      const r = 60;
      const dx = Math.max(-r, Math.min(r, e.clientX - this.origin.x));
      const dy = Math.max(-r, Math.min(r, e.clientY - this.origin.y));
      this.axis = { x: dx / r, y: dy / r };
      this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    });
    const end = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.axis = { x: 0, y: 0 };
      this.knob.style.transform = '';
      this.stick.classList.remove('active');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);

    for (const btn of Array.from(this.root.querySelectorAll<HTMLElement>('[data-action]'))) {
      const action = btn.dataset.action!;
      const hold = btn.dataset.hold === 'true';
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        if (hold) this.held.add(action);
        else this.tapped.add(action);
        btn.classList.add('down');
      });
      const up = () => {
        this.held.delete(action);
        btn.classList.remove('down');
      };
      btn.addEventListener('pointerup', up);
      btn.addEventListener('pointercancel', up);
    }
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    this.root.classList.toggle('hidden', !on);
  }

  /** Under canopy the buttons relabel; the stick drives the toggles. */
  setCanopyMode(on: boolean): void {
    this.root.classList.toggle('canopy', on);
  }

  /** On the edge the big button reads JUMP instead of CHUTE. */
  setReady(ready: boolean): void {
    const big = this.root.querySelector<HTMLElement>('[data-action="deploy"]');
    if (big) big.textContent = ready ? 'JUMP' : 'CHUTE';
  }

  read(): RawInput {
    if (!this.enabled) return { pitch: 0, roll: 0, yaw: 0, dive: 0, flare: 0, zoom: 0 };
    return {
      roll: this.axis.x,
      pitch: this.axis.y,
      yaw: (this.held.has('yawR') ? 1 : 0) - (this.held.has('yawL') ? 1 : 0),
      dive: this.held.has('dive') ? 1 : 0,
      flare: this.held.has('flare') ? 1 : 0,
      zoom: (this.held.has('zoomOut') ? 1 : 0) - (this.held.has('zoomIn') ? 1 : 0),
    };
  }

  actions(): Partial<Actions> {
    const a: Partial<Actions> = {
      deploy: this.tapped.has('deploy'),
      camera: this.tapped.has('camera'),
      restart: this.tapped.has('restart'),
      rollLeft: this.tapped.has('rollLeft'),
      rollRight: this.tapped.has('rollRight'),
      loop: this.tapped.has('loop'),
      start: this.tapped.has('deploy'),
    };
    this.tapped.clear();
    return a;
  }
}
