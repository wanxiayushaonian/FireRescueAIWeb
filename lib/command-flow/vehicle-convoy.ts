import { interpolateOnPolyline, type LatLng } from '@/lib/gis/vehicle-anim';

export interface ConvoyVehicle {
  stationName: string;
  polyline: LatLng[];
  durationMs: number;
  /** 0..1 沿线长度等比进度。 */
  progress: number;
  /** 当前插值位置(未起步 = 起点)。 */
  latLng: LatLng | null;
  done: boolean;
}

export interface ConvoyClock {
  now(): number;
  raf(cb: (now: number) => void): number;
  cancel(id: number): void;
}

export interface ConvoyCallbacks {
  onProgress?: (vehicles: readonly ConvoyVehicle[]) => void;
  onArrive?: (vehicle: ConvoyVehicle, index: number) => void;
  onDone?: () => void;
}

/**
 * 多车行进动画:每辆车沿 polyline 按 durationMs 等比推进。
 * 时钟注入(rAF 由调用方给),位置插值复用 lib/gis/vehicle-anim。
 * 到车后逐一 onArrive;全部到齐 onDone 并停。
 */
export class VehicleConvoy {
  private readonly vehicles: ConvoyVehicle[];
  private readonly clock: ConvoyClock;
  private readonly cb: ConvoyCallbacks;
  private rafId: number | null = null;
  private t0 = 0;
  private running = false;

  constructor(
    vehicles: Array<{ stationName: string; polyline: LatLng[]; durationMs: number }>,
    clock: ConvoyClock,
    callbacks: ConvoyCallbacks = {},
  ) {
    this.vehicles = vehicles.map((v) => ({
      ...v,
      progress: 0,
      latLng: (v.polyline[0] as LatLng | undefined) ?? null,
      done: false,
    }));
    this.clock = clock;
    this.cb = callbacks;
  }

  start(): void {
    if (this.running || this.vehicles.length === 0) return;
    this.running = true;
    this.t0 = this.clock.now();
    this.rafId = this.clock.raf((now) => this.tick(now));
  }

  cancel(): void {
    if (this.rafId !== null) this.clock.cancel(this.rafId);
    this.rafId = null;
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  getVehicles(): readonly ConvoyVehicle[] {
    return this.vehicles;
  }

  private tick(now: number): void {
    if (!this.running) return;
    let allDone = true;
    for (let i = 0; i < this.vehicles.length; i += 1) {
      const v = this.vehicles[i];
      if (v.done) continue;
      const p = Math.min(1, (now - this.t0) / v.durationMs);
      v.progress = p;
      v.latLng = interpolateOnPolyline(v.polyline, p);
      if (p >= 1) {
        v.done = true;
        this.cb.onArrive?.(v, i);
      } else {
        allDone = false;
      }
    }
    this.cb.onProgress?.(this.vehicles);
    if (allDone) {
      this.cancel();
      this.cb.onDone?.();
    } else {
      this.rafId = this.clock.raf((n) => this.tick(n));
    }
  }
}
