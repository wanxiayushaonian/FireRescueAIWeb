// 场景命令执行状态表(ack):前端执行 /scene-events 命令后回传状态,
// agent 经 get_scene_command_status 查询——补齐单向命令通道"无回执"短板(蓝图 #273 建议项)。

export interface CommandStatus {
  cmdId: string;
  tool: string;
  status: 'ok' | 'error';
  message?: string;
  /** handler 返回值(查询类工具如 query_scene_facilities 的统计结果) */
  result?: unknown;
  ts: number; // 状态落库时间
}

const TTL_MS = 10 * 60 * 1000; // 10 分钟过期(演示期足够;防表无限增长)

const statuses = new Map<string, CommandStatus>();
const waiters = new Map<string, Set<(status: CommandStatus) => void>>();

export function recordCommandStatus(
  cmdId: string,
  tool: string,
  status: 'ok' | 'error',
  message?: string,
  result?: unknown,
): void {
  const next = { cmdId, tool, status, message, result, ts: Date.now() } satisfies CommandStatus;
  statuses.set(cmdId, next);
  const listeners = waiters.get(cmdId);
  if (listeners) {
    waiters.delete(cmdId);
    for (const resolve of listeners) resolve(next);
  }
}

/** 查询命令执行状态;不存在/过期返回 null(调用方按"未执行或已过期"处理)。 */
export function getCommandStatus(cmdId: string): CommandStatus | null {
  const s = statuses.get(cmdId);
  if (!s) return null;
  if (Date.now() - s.ts > TTL_MS) {
    statuses.delete(cmdId);
    return null;
  }
  return s;
}

/** 惰性清理过期项(可选;查询路径已按 TTL 判断,此函数供测试/维护)。 */
export function pruneExpired(): number {
  const now = Date.now();
  let n = 0;
  for (const [id, s] of statuses) {
    if (now - s.ts > TTL_MS) {
      statuses.delete(id);
      n += 1;
    }
  }
  return n;
}

/**
 * 等待某条场景命令的浏览器回执。已有结果立即返回;超时返回 null。
 * 查询类工具借此在一次 MCP tool call 中拿到 handler result,无需 Agent 二次轮询。
 */
export function waitForCommandStatus(cmdId: string, timeoutMs = 2000): Promise<CommandStatus | null> {
  const existing = getCommandStatus(cmdId);
  if (existing) return Promise.resolve(existing);

  return new Promise((resolve) => {
    let settled = false;
    const listeners = waiters.get(cmdId) ?? new Set<(status: CommandStatus) => void>();
    const finish = (status: CommandStatus): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(status);
    };
    listeners.add(finish);
    waiters.set(cmdId, listeners);

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      const current = waiters.get(cmdId);
      current?.delete(finish);
      if (current?.size === 0) waiters.delete(cmdId);
      resolve(null);
    }, Math.max(0, timeoutMs));
  });
}

/** 仅供测试复位。 */
export function __resetStatusesForTest(): void {
  statuses.clear();
  waiters.clear();
}
