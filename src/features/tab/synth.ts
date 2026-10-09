/**
 * 기타 소리 합성 (Karplus-Strong 현 진동 모델) + 타브 재생기.
 * 음마다 버퍼를 한 번 만들어 두고(캐시) 재생 시에는 음 길이만큼 볼륨을 줄여 끊는다.
 */

import { toEvents, type PlayEvent, type TabData } from './model';

export interface PlayOptions {
  /** 타브 시간(초)에서 시작 */
  from: number;
  /** 반복할 때 돌아갈 지점(초) — 없으면 from */
  loopFrom?: number;
  loop: boolean;
  /** 연습 속도 (1 = 타브의 BPM) */
  rate: number;
  click: boolean;
  drive: boolean;
  /** 화면 커서용: 타브 시간(초) */
  onPosition?: (t: number) => void;
  onEnd?: () => void;
}

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);
const MAX_LEN = 2.5;

/** 한 음의 현 진동. pm(팜뮤트)은 빨리 감쇠, mute(데드)는 짧은 '칙' 소리 */
export function renderPluck(sampleRate: number, midi: number, kind: 'open' | 'pm' | 'dead' | 'harmonic'): Float32Array {
  const freq = midiHz(kind === 'harmonic' ? midi + 12 : midi);
  const len = Math.floor((kind === 'dead' ? 0.06 : kind === 'pm' ? 0.6 : MAX_LEN) * sampleRate);
  const out = new Float32Array(len);
  const n = Math.max(2, Math.round(sampleRate / freq));
  const ring = new Float32Array(n);
  // 들뜬 잡음 → 살짝 저역 통과해 픽 어택을 부드럽게
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const r = Math.random() * 2 - 1;
    prev = kind === 'harmonic' ? r * 0.3 + prev * 0.7 : r * 0.6 + prev * 0.4;
    ring[i] = prev;
  }
  const decay = kind === 'pm' ? 0.93 : kind === 'dead' ? 0.8 : kind === 'harmonic' ? 0.999 : 0.996;
  let idx = 0;
  for (let i = 0; i < len; i++) {
    const a = ring[idx];
    const b = ring[(idx + 1) % n];
    out[i] = a;
    ring[idx] = decay * 0.5 * (a + b);
    idx = (idx + 1) % n;
  }
  return out;
}

function driveCurve(amount = 18): Float32Array {
  const c = new Float32Array(1024);
  for (let i = 0; i < c.length; i++) {
    const x = (i / (c.length - 1)) * 2 - 1;
    c[i] = Math.tanh(amount * x) / Math.tanh(amount);
  }
  return c;
}

export class TabPlayer {
  private ctx: AudioContext | null = null;
  private clean!: GainNode;
  private dist!: GainNode;
  private cache = new Map<string, AudioBuffer>();
  private timer: number | null = null;
  private raf = 0;
  private sources: AudioScheduledSourceNode[] = [];
  private state: {
    events: PlayEvent[];
    i: number;
    passStart: number; // 이번 바퀴가 시작된 오디오 시각
    passFrom: number; // 이번 바퀴의 타브 시작 시각
    end: number;
    opts: PlayOptions;
    tab: TabData;
    nextClick: number; // 다음 클릭의 타브 시각
  } | null = null;

  get playing(): boolean {
    return this.state !== null;
  }

  private ensure(): AudioContext {
    if (this.ctx) return this.ctx;
    const ctx = new AudioContext();
    const master = ctx.createGain();
    master.gain.value = 0.8;
    master.connect(ctx.destination);
    this.clean = ctx.createGain();
    this.clean.connect(master);
    // 드라이브: 저역 정리 → 찌그러뜨림 → 고역 정리 (앰프 비슷한 소리)
    this.dist = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    const shaper = ctx.createWaveShaper();
    shaper.curve = driveCurve() as Float32Array<ArrayBuffer>;
    shaper.oversample = '4x';
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 4800;
    const post = ctx.createGain();
    post.gain.value = 0.35;
    this.dist.connect(hp).connect(shaper).connect(lp).connect(post).connect(master);
    this.ctx = ctx;
    return ctx;
  }

  private buffer(midi: number, kind: 'open' | 'pm' | 'dead' | 'harmonic'): AudioBuffer {
    const ctx = this.ctx!;
    const key = `${midi}|${kind}`;
    let b = this.cache.get(key);
    if (!b) {
      const data = renderPluck(ctx.sampleRate, midi, kind);
      b = ctx.createBuffer(1, data.length, ctx.sampleRate);
      b.copyToChannel(data as Float32Array<ArrayBuffer>, 0);
      this.cache.set(key, b);
    }
    return b;
  }

  /** 음 하나 바로 들려주기 (편집 중 미리듣기) */
  async preview(midi: number, drive: boolean): Promise<void> {
    const ctx = this.ensure();
    await ctx.resume();
    this.note({ midi, techs: [], bend: 0, pm: false, dur: 0.6 } as unknown as PlayEvent, ctx.currentTime + 0.01, drive, 1);
  }

  private note(e: PlayEvent, at: number, drive: boolean, rate: number): void {
    const ctx = this.ctx!;
    const dead = e.techs.includes('mute');
    const kind = dead ? 'dead' : e.techs.includes('harmonic') ? 'harmonic' : e.pm ? 'pm' : 'open';
    const src = ctx.createBufferSource();
    src.buffer = this.buffer(e.midi, kind);
    const g = ctx.createGain();
    const legato = e.techs.includes('h') || e.techs.includes('p') || e.techs.includes('tap');
    const level = (legato ? 0.55 : 0.9) * (drive ? 0.9 : 0.6);
    const dur = Math.max(0.04, Math.min(MAX_LEN, e.dur / rate));
    g.gain.setValueAtTime(level, at);
    g.gain.setValueAtTime(level, at + Math.max(0.01, dur - 0.03));
    g.gain.linearRampToValueAtTime(0, at + dur);
    // 음높이 변화: 벤딩·슬라이드는 재생 속도로 근사, 비브라토는 저주파로 흔듦
    const pr = src.playbackRate;
    if (e.techs.includes('slideUp') || e.techs.includes('slideDown')) {
      pr.setValueAtTime(2 ** ((e.techs.includes('slideUp') ? -2 : 2) / 12), at);
      pr.exponentialRampToValueAtTime(1, at + Math.min(0.09, dur * 0.5));
    }
    if (e.techs.includes('bend') && e.bend) {
      pr.setValueAtTime(1, at);
      pr.linearRampToValueAtTime(2 ** (e.bend / 12), at + Math.min(0.18, dur * 0.5));
    }
    if (e.techs.includes('vibrato')) {
      const lfo = ctx.createOscillator();
      const depth = ctx.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.value = 0.012;
      lfo.connect(depth).connect(pr);
      lfo.start(at + 0.08);
      lfo.stop(at + dur);
      this.sources.push(lfo);
    }
    src.connect(g).connect(drive ? this.dist : this.clean);
    src.start(at);
    src.stop(at + dur + 0.02);
    this.sources.push(src);
    src.onended = () => {
      this.sources = this.sources.filter((s) => s !== src);
    };
  }

  private click(at: number, accent: boolean): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = accent ? 1760 : 1320;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(accent ? 0.35 : 0.22, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.04);
    osc.connect(g).connect(this.clean);
    osc.start(at);
    osc.stop(at + 0.05);
    this.sources.push(osc);
  }

  async play(tab: TabData, opts: PlayOptions): Promise<void> {
    this.stop();
    const ctx = this.ensure();
    await ctx.resume();
    const events = toEvents(tab);
    const end = tab.measures.length * (60 / tab.bpm) * tab.beatsPerBar;
    const from = Math.min(Math.max(0, opts.from), end);
    const beat = 60 / tab.bpm;
    this.state = {
      events,
      i: events.findIndex((e) => e.time >= from - 1e-6),
      passStart: ctx.currentTime + 0.06,
      passFrom: from,
      end,
      opts,
      tab,
      nextClick: Math.ceil((from - 1e-6) / beat) * beat,
    };
    if (this.state.i < 0) this.state.i = events.length;
    this.timer = window.setInterval(() => this.tick(), 25);
    this.tick();
    const frame = () => {
      const s = this.state;
      if (!s || !this.ctx) return;
      const t = s.passFrom + Math.max(0, this.ctx.currentTime - s.passStart) * s.opts.rate;
      s.opts.onPosition?.(Math.min(t, s.end));
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  private tick(): void {
    const s = this.state;
    const ctx = this.ctx;
    if (!s || !ctx) return;
    const ahead = ctx.currentTime + 0.15;
    const toAudio = (tabT: number) => s.passStart + (tabT - s.passFrom) / s.opts.rate;
    const beat = 60 / s.tab.bpm;
    for (;;) {
      // 클릭과 음을 시간 순서대로 예약
      const e = s.events[s.i];
      const nextNote = e ? e.time : Infinity;
      const nextClick = s.opts.click && s.nextClick < s.end - 1e-6 ? s.nextClick : Infinity;
      const next = Math.min(nextNote, nextClick);
      if (next === Infinity || next >= s.end - 1e-6) {
        // 이번 바퀴 끝
        const endAt = toAudio(s.end);
        if (endAt > ahead) break;
        if (s.opts.loop) {
          const lf = s.opts.loopFrom ?? s.passFrom;
          s.passStart = endAt;
          s.passFrom = lf;
          s.i = s.events.findIndex((x) => x.time >= lf - 1e-6);
          if (s.i < 0) s.i = s.events.length;
          s.nextClick = Math.ceil((lf - 1e-6) / beat) * beat;
          continue;
        }
        if (ctx.currentTime >= endAt) {
          const done = s.opts.onEnd;
          this.stop();
          done?.();
        }
        break;
      }
      const at = toAudio(next);
      if (at > ahead) break;
      if (next === nextClick) {
        const beatIdx = Math.round(nextClick / beat);
        this.click(Math.max(at, ctx.currentTime), beatIdx % s.tab.beatsPerBar === 0);
        s.nextClick += beat;
      } else {
        this.note(e!, Math.max(at, ctx.currentTime), s.opts.drive, s.opts.rate);
        s.i += 1;
      }
    }
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    cancelAnimationFrame(this.raf);
    for (const src of this.sources) {
      try {
        src.stop();
      } catch {
        /* 이미 끝남 */
      }
    }
    this.sources = [];
    this.state = null;
  }

  dispose(): void {
    this.stop();
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.cache.clear();
  }
}
