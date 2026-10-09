export type ClickKind = 'accent' | 'beat' | 'sub';

export interface MetronomeSettings {
  bpm: number;
  beatsPerBar: number;
  /** 한 박을 몇 개로 쪼갤지: 1=4분, 2=8분, 3=셋잇단, 4=16분 */
  subdivision: number;
  accent: boolean;
  /** 0~1 */
  volume: number;
}

export const MIN_BPM = 30;
export const MAX_BPM = 300;

export function clampBpm(bpm: number): number {
  return Math.min(MAX_BPM, Math.max(MIN_BPM, Math.round(bpm)));
}

export function clickKind(tick: number, beatsPerBar: number, subdivision: number, accent: boolean): ClickKind {
  const inBar = tick % (beatsPerBar * subdivision);
  if (inBar === 0 && accent) return 'accent';
  return inBar % subdivision === 0 ? 'beat' : 'sub';
}

/** 탭 시각(ms) 목록 → BPM. 2.5초 넘게 쉬면 새로 센다. 최근 6번까지만 평균. */
export function tapTempo(taps: number[]): number | null {
  let start = taps.length - 1;
  while (start > 0 && taps[start] - taps[start - 1] < 2500) start--;
  const recent = taps.slice(Math.max(start, taps.length - 6));
  if (recent.length < 2) return null;
  const avg = (recent[recent.length - 1] - recent[0]) / (recent.length - 1);
  return clampBpm(60000 / avg);
}

const FREQ: Record<ClickKind, number> = { accent: 1760, beat: 1320, sub: 880 };
const GAIN: Record<ClickKind, number> = { accent: 1, beat: 0.75, sub: 0.4 };

/**
 * Web Audio 시계에 소리를 미리 예약하는 메트로놈.
 * setTimeout은 박 '예약'만 하고 실제 발음 시각은 오디오 시계가 정하므로 탭이 밀리지 않는다.
 */
export class MetronomeEngine {
  private ctx: AudioContext | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private tick = 0;
  private visualTimers: number[] = [];

  constructor(
    private settings: MetronomeSettings,
    private onTick?: (beatInBar: number, kind: ClickKind) => void,
  ) {}

  get running(): boolean {
    return this.timer !== null;
  }

  update(settings: MetronomeSettings): void {
    this.settings = settings;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.ctx ??= new AudioContext();
    await this.ctx.resume();
    this.tick = 0;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.timer = window.setInterval(() => this.schedule(), 25);
    this.schedule();
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.visualTimers.forEach((t) => window.clearTimeout(t));
    this.visualTimers = [];
  }

  dispose(): void {
    this.stop();
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  private schedule(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const { bpm, beatsPerBar, subdivision, accent } = this.settings;
    while (this.nextTime < ctx.currentTime + 0.12) {
      const kind = clickKind(this.tick, beatsPerBar, subdivision, accent);
      this.click(this.nextTime, kind);
      if (this.onTick && this.tick % subdivision === 0) {
        const beat = Math.floor(this.tick / subdivision) % beatsPerBar;
        const delay = Math.max(0, (this.nextTime - ctx.currentTime) * 1000);
        const id = window.setTimeout(() => {
          this.visualTimers = this.visualTimers.filter((t) => t !== id);
          this.onTick?.(beat, kind);
        }, delay);
        this.visualTimers.push(id);
      }
      this.nextTime += 60 / bpm / subdivision;
      this.tick++;
    }
  }

  private click(time: number, kind: ClickKind): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = FREQ[kind];
    const peak = Math.max(0.0002, GAIN[kind] * this.settings.volume);
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(peak, time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.05);
    osc.connect(gain).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + 0.06);
  }
}
