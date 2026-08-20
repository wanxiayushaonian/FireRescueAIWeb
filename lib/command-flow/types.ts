/** 处置流程阶段(与 liveChannel 状态机同名同步)。 */
export type IncidentStatus = '接警' | '出动' | '到场' | '控制' | '熄灭';
export type FlowStage = IncidentStatus;

/** 推荐类型(与 src/mock/incidents.ts 同构)。 */
export type RecommendType = 'force' | 'tactic' | 'keypoint';

/** 案卷时间线事件类型(与 src/lib/case-timeline.ts 同构)。 */
export type TimelineKind = 'status' | 'dispatch' | 'arrival' | 'rescue' | 'manual';

/** 视角请求规格(交给 ViewDirector 仲裁执行)。 */
export type ViewSpec =
  | { kind: 'focusIncident'; lng: number; lat: number; ringM?: number; maxZoom?: number; paddingTL?: [number, number]; paddingBR?: [number, number] }
  | { kind: 'fitRoutes'; points: [number, number][] }
  | { kind: 'settle' }
  | { kind: 'reset' };

/** 剧本动作:at = 相对剧本起点的毫秒偏移。 */
export type ScriptAction =
  | { at: number; kind: 'stage'; stage: FlowStage }
  | { at: number; kind: 'toast'; msg: string }
  | { at: number; kind: 'timeline'; entryKind: TimelineKind; label: string; detail?: string }
  | { at: number; kind: 'view'; spec: ViewSpec }
  | { at: number; kind: 'status'; to: IncidentStatus }
  | { at: number; kind: 'pushRec'; type: RecommendType; content: string; basis: string }
  | { at: number; kind: 'panel'; id: 'vars' | 'recommend'; open: boolean }
  | { at: number; kind: 'convoy'; action: 'start' | 'arriveAll' };
