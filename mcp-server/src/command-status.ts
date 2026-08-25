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

export function recordCommandStatus(
  cmdId: string,
  tool: string,
  status: 'ok' | 'error',
  message?: string,
  result?: unknown,
): void {
  statuses.set(cmdId, { cmdId, tool, status, message, result, ts: Date.now() });
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

/** 仅供测试复位。 */
export function __resetStatusesForTest(): void {
  statuses.clear();
}
