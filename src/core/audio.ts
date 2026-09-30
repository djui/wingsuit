/**
 * Procedural sound with the Web Audio API: wind roar that follows airspeed,
 * canopy opening and flapping, rain, and impact thuds. No audio files.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private whistleGain!: GainNode;
  private whistleFilter!: BiquadFilterNode;
  private rainGain!: GainNode;
  private canopyGain!: GainNode;
  private noise!: AudioBuffer;
  private flapTimer = 0;
  enabled = true;

  constructor() {
    try {
      this.enabled = localStorage.getItem('wingsuit.audio') !== 'off';
    } catch {
      /* ignore */
    }
  }

  /** Must be called from a user gesture. Safe to call repeatedly. */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(ctx.destination);

    // White noise buffer, 2 s, looped by several sources.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    // Wind: noise -> lowpass -> gain
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 300;
    this.windFilter.Q.value = 0.7;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    this.loopNoise().connect(this.windFilter).connect(this.windGain).connect(this.master);

    // Whistle: narrow bandpass that rises with speed
    this.whistleFilter = ctx.createBiquadFilter();
    this.whistleFilter.type = 'bandpass';
    this.whistleFilter.frequency.value = 900;
    this.whistleFilter.Q.value = 6;
    this.whistleGain = ctx.createGain();
    this.whistleGain.gain.value = 0;
    this.loopNoise().connect(this.whistleFilter).connect(this.whistleGain).connect(this.master);

    // Rain: highpass hiss
    const rainFilter = ctx.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 2500;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = 0;
    this.loopNoise().connect(rainFilter).connect(this.rainGain).connect(this.master);

    // Canopy flutter: bandpass noise gated by an LFO-ish envelope
    const canopyFilter = ctx.createBiquadFilter();
    canopyFilter.type = 'bandpass';
    canopyFilter.frequency.value = 180;
    canopyFilter.Q.value = 1.5;
    this.canopyGain = ctx.createGain();
    this.canopyGain.gain.value = 0;
    this.loopNoise().connect(canopyFilter).connect(this.canopyGain).connect(this.master);
  }

  private loopNoise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start();
    return src;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem('wingsuit.audio', on ? 'on' : 'off');
    } catch {
      /* ignore */
    }
    if (this.ctx) this.master.gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.05);
  }

  /**
   * @param airspeed m/s
   * @param canopy 0..1 openness
   * @param brake 0..1 toggle input
   * @param rain 0..1 precipitation intensity (rain only)
   */
  update(dt: number, airspeed: number, canopy: number, brake: number, rain: number, flying: boolean): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = flying ? airspeed : 0;
    const norm = Math.min(1, v / 70);
    const wind = 0.9 * norm * norm * (1 - 0.6 * canopy) + (flying ? 0.05 * (1 - canopy) : 0);
    this.windGain.gain.setTargetAtTime(wind, t, 0.08);
    this.windFilter.frequency.setTargetAtTime(200 + 1600 * norm, t, 0.1);
    this.whistleGain.gain.setTargetAtTime(0.12 * Math.max(0, norm - 0.55) * (1 - canopy), t, 0.1);
    this.whistleFilter.frequency.setTargetAtTime(700 + 1500 * norm, t, 0.1);
    this.rainGain.gain.setTargetAtTime(0.12 * rain, t, 0.3);

    // Canopy flutter: random flaps, more with brakes and speed.
    if (canopy > 0.05 && flying) {
      this.flapTimer -= dt;
      const base = 0.06 * canopy * Math.min(1, v / 12);
      if (this.flapTimer <= 0) {
        this.flapTimer = 0.15 + Math.random() * 0.5;
        this.canopyGain.gain.setTargetAtTime(base + 0.12 * (0.3 + brake), t, 0.02);
        this.canopyGain.gain.setTargetAtTime(base, t + 0.08, 0.05);
      }
    } else {
      this.canopyGain.gain.setTargetAtTime(0, t, 0.1);
    }
  }

  /** Whoosh + thump when the canopy inflates. */
  opening(): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.burst(0.5, 400, 1.2, 0.6);
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(90, t + 0.9);
    osc.frequency.exponentialRampToValueAtTime(40, t + 1.5);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t + 0.9);
    g.gain.linearRampToValueAtTime(0.5, t + 1.0);
    g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
    osc.connect(g).connect(this.master);
    osc.start(t + 0.9);
    osc.stop(t + 1.7);
  }

  impact(hard: boolean): void {
    if (!this.ctx) return;
    this.burst(hard ? 1.0 : 0.35, hard ? 150 : 300, 0, hard ? 0.8 : 0.3);
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(hard ? 70 : 55, t);
    osc.frequency.exponentialRampToValueAtTime(25, t + 0.4);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(hard ? 0.9 : 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.6);
  }

  private burst(gain: number, cutoff: number, delay: number, duration: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(f).connect(g).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.1);
  }
}
