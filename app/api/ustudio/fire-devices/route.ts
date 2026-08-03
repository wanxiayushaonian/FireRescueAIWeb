import { NextResponse } from 'next/server';
import { getTwinsInstanceDetail } from '@/lib/ustudio';

export const dynamic = 'force-dynamic';

const MAX_IDS = 300;
const CONCURRENCY = 6;

export type DeviceStatus = 'normal' | 'warning' | 'offline' | 'unknown';

export type StatusProbe = {
  id: string;
  status: DeviceStatus;
  /** 命中的属性字段名，便于排查；未命中为空串 */
  field: string;
  /** 命中的属性原始值 */
  value: string;
};

const FIELD_ALARM = /alarm|warn|fault|error|faulty/i;
const FIELD_ONLINE = /online|is_online|connected|is_connected/i;
const FIELD_GENERIC = /status|state|run_state|work_state|run_status|work_status|status_name/i;

/** 递归收集详情里与状态相关的字段叶子值（detail 返回结构未知，做防御性解析）。 */
function collectStatusFields(
  value: unknown,
  depth: number,
  out: Array<{ field: string; raw: string }>,
): void {
  if (depth > 4 || value === null || value === undefined) return;
  if (Array.isArray(value)) {
    for (const item of value) collectStatusFields(item, depth + 1, out);
    return;
  }
  if (typeof value !== 'object') return;
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    const raw = leafText(val);
    if (raw !== '' && (FIELD_ALARM.test(key) || FIELD_ONLINE.test(key) || FIELD_GENERIC.test(key))) {
      out.push({ field: key, raw });
    }
    if (val && typeof val === 'object') collectStatusFields(val, depth + 1, out);
  }
}

function leafText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return '';
}

function mapStatus(field: string, raw: string): DeviceStatus | null {
  const low = raw.toLowerCase();
  if (FIELD_ALARM.test(field)) {
    if (['true', '1', 'yes', 'y', 'on', '告警', '报警', '故障', '异常', 'warning', 'warn', 'alarm', 'error', 'fault'].includes(low)) {
      return 'warning';
    }
    if (['false', '0', 'no', 'n', 'off', '无', '正常', 'none', 'normal', 'ok'].includes(low)) return 'normal';
    return null;
  }
  if (FIELD_ONLINE.test(field)) {
    if (['true', '1', 'yes', 'y', 'on', 'online', '在线', '正常', 'normal', 'ok'].includes(low)) return 'normal';
    if (['false', '0', 'no', 'n', 'off', 'offline', '离线', '停用', 'inactive', 'down'].includes(low)) return 'offline';
    return null;
  }
  if (['normal', 'ok', 'healthy', '正常', '在线', '运行', 'true', '1', 'yes', 'on'].includes(low)) return 'normal';
  if (['warning', 'warn', 'alarm', '告警', '报警', '故障', '异常', 'error', 'fault'].includes(low)) return 'warning';
  if (['offline', '离线', 'off', 'down', '停用', 'inactive', 'disabled', 'false', '0', 'no'].includes(low)) return 'offline';
  return null;
}

async function probeOne(id: string): Promise<StatusProbe> {
  try {
    const detail = await getTwinsInstanceDetail({ twinsInstanceId: id });
    const fields: Array<{ field: string; raw: string }> = [];
    collectStatusFields(detail, 0, fields);
    for (const { field, raw } of fields) {
      const status = mapStatus(field, raw);
      if (status) return { id, status, field, value: raw };
    }
    return { id, status: 'unknown', field: '', value: '' };
  } catch {
    return { id, status: 'unknown', field: '', value: '' };
  }
}

/** 并发受限地批量探测；结果顺序与入参一致。 */
async function probeAll(ids: string[]): Promise<StatusProbe[]> {
  const results: StatusProbe[] = new Array(ids.length);
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < ids.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await probeOne(ids[index]);
    }
  }
  const workers = Array.from({ length: Math.min(CONCURRENCY, ids.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const ids = (url.searchParams.get('ids') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_IDS);

  if (ids.length === 0) {
    return NextResponse.json({ results: [] as StatusProbe[] });
  }

  try {
    const results = await probeAll(ids);
    return NextResponse.json({ results });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to probe device status';
    return NextResponse.json({ message }, { status: 500 });
  }
}
