import type { ViewSpec } from './types';

/** 视角占用者。优先级:user > follow > auto-flow > none。 */
export type ViewOwner = 'none' | 'auto-flow' | 'follow' | 'user';

export interface FocusSpec {
  lng: number; lat: number;
  ringM?: number; maxZoom?: number;
  paddingTL?: [number, number]; paddingBR?: [number, number];
}

export interface FitRoutesSpec {
  points: [number, number][];
}

/** 地图适配器:ViewDirector 与 Leaflet 的唯一接口(纯逻辑层不碰 Leaflet)。 */
export interface MapAdapter {
  focusIncident(spec: FocusSpec): void;
  fitRoutes(spec: FitRoutesSpec): void;
  panTo(latlng: [number, number]): void;
  resetView(): void;
}

/** 跟随目标:每次 updateFollow 取当前车辆位置(null = 暂不可用)。 */
export interface FollowTarget {
  latLng(): [number, number] | null;
}

export interface ViewDirectorOptions {
  adapter: MapAdapter;
  onFollowChange?: (following: boolean) => void;
}

/**
 * 视角仲裁器:所有视角请求(剧本聚焦 / 车辆跟随 / 用户交互)统一走优先级仲裁。
 * - 用户操作(user)优先级最高:跟随中拖图立即退出;剧本聚焦在 user/follow 占用时丢弃(不排队不打架)
 * - 剧本聚焦(auto-flow)仅空闲执行
 * - 「到车 / 空白点击 / Esc」→ stopFollow 释放
 */
export class ViewDirector {
  private readonly adapter: MapAdapter;
  private readonly onFollowChange?: (f: boolean) => void;
  private owner: ViewOwner = 'none';
  private followTarget: FollowTarget | null = null;

  constructor(options: ViewDirectorOptions) {
    this.adapter = options.adapter;
    this.onFollowChange = options.onFollowChange;
  }

  getOwner(): ViewOwner {
    return this.owner;
  }

  /** 剧本聚焦:user/follow 占用时丢弃,不积压。 */
  requestFocus(spec: ViewSpec): void {
    if (this.owner === 'user' || this.owner === 'follow') return;
    this.apply(spec);
  }

  /** 点击车辆进入跟随:拥有视角,每帧经 updateFollow panTo 车辆。 */
  startFollow(target: FollowTarget): void {
    if (this.owner === 'follow' && this.followTarget === target) return;
    this.stopFollow();
    this.owner = 'follow';
    this.followTarget = target;
    this.onFollowChange?.(true);
    this.updateFollow();
  }

  /** 到车/空白点击/Esc:释放跟随,回 none。 */
  stopFollow(): void {
    if (this.owner !== 'follow') return;
    this.owner = 'none';
    this.followTarget = null;
    this.onFollowChange?.(false);
  }

  /** 每帧调用(由调用方 rAF/convoy onProgress 驱动):跟随态下 panTo 车辆。 */
  updateFollow(): void {
    if (this.owner !== 'follow') return;
    const p = this.followTarget?.latLng();
    if (p) this.adapter.panTo(p);
  }

  /** 用户拖图/缩放:退出跟随并标记 user 占用(丢弃后续 auto-focus)。 */
  notifyUserInteract(): void {
    if (this.owner === 'follow') this.stopFollow();
    this.owner = 'user';
  }

  private apply(spec: ViewSpec): void {
    switch (spec.kind) {
      case 'focusIncident':
        this.adapter.focusIncident(spec);
        break;
      case 'fitRoutes':
        this.adapter.fitRoutes({ points: spec.points });
        break;
      case 'settle':
        break; // 视角不动(到场/控制阶段)
      case 'reset':
        this.adapter.resetView();
        break;
    }
  }
}
