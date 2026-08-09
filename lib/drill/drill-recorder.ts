/**
 * DrillRecorder — 演练事件树记录器(纯逻辑,无 React/DOM 依赖)。
 *
 * 6.3 AgentRunner 的执行记录落地:每个 agent 决策/特情注入/3D 执行调用都追加为
 * TreeNode,保留因果链(parentId)供 6.4 EventTree 渲染。
 *
 * 与 EventBus 的关系:
 * - EventBus:演练事件池(按 ts 有序,驱动 DisasterState)
 * - DrillRecorder:事件树节点(追加式,含 execution/generic 等非 EventBus 类型)
 *
 * 节点类型映射(见 6.3 spec tool_call 派发表):
 * - disaster/decision/special/arrival/status:对应 DrillEvent 类型,可由 AgentRunner
 *   在 inject EventBus 后同步 record(同 ts)
 * - execution:本体功能调用(batchInvokeTwinsFunction),仅记事件树(3D 由平台 WS 自动)
 * - generic:其他工具调用/编排(MVP 默认不记避免噪声)
 */

// ============================================================
// 类型定义
// ============================================================

/** 事件树节点类型(扩展 DrillEventType,加 execution/generic) */
export type TreeNodeType =
  | 'disaster'
  | 'decision'
  | 'special'
  | 'arrival'
  | 'status'
  | 'execution'
  | 'generic';

/**
 * 事件树节点(追加式,字段在 record 后只读)。
 * 因果链:parentId 指向父节点 id(AgentRunner 派发时挂 causeEventId)。
 */
export interface TreeNode {
  readonly id: string;
  /** 演练时钟 tick(决策/执行发生的逻辑时刻)。 */
  readonly ts: number;
  readonly type: TreeNodeType;
  /** 节点标题(展示用,如决策动作/特情类型/功能标识)。 */
  readonly label: string;
  /** 详情文本(agent rationale / 特情描述;可选)。 */
  readonly detail?: string;
  /**
   * 父节点 id(因果链)。AgentRunner 传入的上游逻辑 id(causeEventId),
   * 与 EventBus event.cause 同源但 id 空间独立(TreeNode id 与 DrillEvent id 不同前缀),
   * 6.4 EventTree 设计时统一检索逻辑。
   */
  readonly parentId?: string;
  /** 发起 agent 名(从 SSE event.agent 取;可选)。 */
  readonly agentName?: string;
  /** 关联 toolCallId(从 SSE tool-call 事件取;可选)。 */
  readonly toolCallId?: string;
  /** 本体功能标识(仅 execution 节点,如 flyto/highlight)。 */
  readonly functionIdentifier?: string;
  /** 任意元数据(只读;input_params/resultStatus 等)。 */
  readonly meta?: Readonly<Record<string, unknown>>;
}

/** record 入参:id 可选(缺省由 genNodeId 生成)。 */
export type RecordInput = Omit<TreeNode, 'id'> & { readonly id?: string };

type NodeCallback = (node: TreeNode) => void;

// ============================================================
// id 生成
// ============================================================

/**
 * 生成节点 id(非确定性,组成:prefix-timestamp(base36)-random6)。
 * 与 EventBus.genEventId 同模式,默认 prefix='node'(测试可注入固定 prefix 以稳定断言)。
 */
export function genNodeId(prefix = 'node'): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${ts}-${rand}`;
}

// ============================================================
// DrillRecorder
// ============================================================

/**
 * DrillRecorder —— 事件树节点追加存储 + 因果链 + 订阅通知。
 *
 * 使用模式:
 * 1. AgentRunner.dispatchToolCall 内同步调用 record(在 bus.inject 后,保持时序一致)
 * 2. 6.4 EventTree 组件 subscribe(cb) → 新节点实时生长
 * 3. getNode(parentId)/getChildren(parentId) → 因果链回溯
 *
 * 纯逻辑:不依赖 React/DOM,可被 vitest 直接单测。
 */
export class DrillRecorder {
  private readonly nodes: TreeNode[] = [];
  private readonly subscribers: Set<NodeCallback> = new Set();

  /**
   * 追加一个节点。id 缺省时由 genNodeId 生成。
   * 节点以浅拷贝存储(隔离内外 mutation);meta 单层拷贝。
   * 通知订阅者(注入顺序 = 时间线生长顺序)。
   */
  record(input: RecordInput): TreeNode {
    const node: TreeNode = this.clone({
      ...input,
      id: input.id ?? genNodeId(),
    });
    this.nodes.push(node);
    this.notify(node);
    return node;
  }

  /** 全量节点(按追加顺序),返回拷贝。 */
  getAll(): TreeNode[] {
    return this.nodes.map((n) => this.clone(n));
  }

  /** 按 id 查节点(不存在返回 undefined)。返回拷贝。 */
  getNode(id: string): TreeNode | undefined {
    const found = this.nodes.find((n) => n.id === id);
    return found ? this.clone(found) : undefined;
  }

  /** 查 parentId 的直接子节点(按追加顺序)。返回拷贝。 */
  getChildren(parentId: string): TreeNode[] {
    return this.nodes
      .filter((n) => n.parentId === parentId)
      .map((n) => this.clone(n));
  }

  /** 订阅新节点通知(仅 record 触发)。返回取消订阅函数(幂等,多次调用安全)。 */
  subscribe(cb: NodeCallback): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  /** 清空所有节点(重置/测试用)。不清订阅者。 */
  clear(): void {
    this.nodes.length = 0;
  }

  /** 当前节点总数。 */
  size(): number {
    return this.nodes.length;
  }

  // ---- 内部方法 ----

  private notify(node: TreeNode): void {
    for (const cb of this.subscribers) {
      cb(node);
    }
  }

  /** 浅拷贝节点(含 meta 一层),隔离内外 mutation。 */
  private clone(n: TreeNode): TreeNode {
    return n.meta ? { ...n, meta: { ...n.meta } } : { ...n };
  }
}
