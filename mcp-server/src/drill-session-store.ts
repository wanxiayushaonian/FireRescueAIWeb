import { dirname } from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

export interface DrillSessionRecord {
  readonly drillId: string;
  readonly snapshot: unknown;
  readonly source: 'browser' | 'command-ack';
  readonly revision: number;
  readonly updatedAt: number;
}

interface PersistedShape {
  version: 1;
  sessions: DrillSessionRecord[];
}

const MAX_SESSIONS = 500;

/** 单进程文件持久化 store;生产通过 Docker volume 保留文件。 */
export class DrillSessionStore {
  private readonly records = new Map<string, DrillSessionRecord>();

  constructor(private readonly filePath = '') {
    this.load();
  }

  get(drillId: string): DrillSessionRecord | null {
    const record = this.records.get(drillId);
    return record ? structuredClone(record) : null;
  }

  upsert(
    drillId: string,
    snapshot: unknown,
    source: DrillSessionRecord['source'] = 'browser',
  ): DrillSessionRecord {
    const previous = this.records.get(drillId);
    const record: DrillSessionRecord = {
      drillId,
      snapshot: structuredClone(snapshot),
      source,
      revision: (previous?.revision ?? 0) + 1,
      updatedAt: Date.now(),
    };
    this.records.set(drillId, record);
    if (this.records.size > MAX_SESSIONS) {
      const oldest = [...this.records.values()].sort((a, b) => a.updatedAt - b.updatedAt)[0];
      if (oldest) this.records.delete(oldest.drillId);
    }
    this.persist();
    return structuredClone(record);
  }

  private load(): void {
    if (!this.filePath || !existsSync(this.filePath)) return;
    try {
      const parsed = JSON.parse(readFileSync(this.filePath, 'utf8')) as PersistedShape;
      if (parsed?.version !== 1 || !Array.isArray(parsed.sessions)) return;
      for (const record of parsed.sessions.slice(-MAX_SESSIONS)) {
        if (record?.drillId) this.records.set(record.drillId, record);
      }
    } catch (error) {
      console.warn('[mcp] drill session file load failed, starting empty:', error);
    }
  }

  private persist(): void {
    if (!this.filePath) return;
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.tmp`;
      const payload: PersistedShape = { version: 1, sessions: [...this.records.values()] };
      writeFileSync(tmp, JSON.stringify(payload), 'utf8');
      renameSync(tmp, this.filePath);
    } catch (error) {
      console.error('[mcp] drill session file persist failed:', error);
    }
  }
}

export const drillSessionStore = new DrillSessionStore(
  (process.env.DRILL_SESSION_FILE || '').trim(),
);
