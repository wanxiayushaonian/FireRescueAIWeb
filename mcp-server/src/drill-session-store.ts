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

  /** 全部局的轻量索引(新→旧;供预案库"云端演练记录"列表,不含快照体)。 */
  list(): Array<{
    drillId: string;
    revision: number;
    updatedAt: number;
    summary: { score: number | null; archived: boolean | null; events: number; hasReview: boolean };
  }> {
    const rows = [...this.records.values()].sort((a, b) => b.updatedAt - a.updatedAt);
    return rows.map((r) => {
      const snap = (r.snapshot ?? {}) as {
        review?: { score?: unknown; archived?: unknown } | null;
        events?: unknown[];
      };
      const review = snap.review ?? null;
      return {
        drillId: r.drillId,
        revision: r.revision,
        updatedAt: r.updatedAt,
        summary: {
          score: review && typeof review.score === 'number' ? review.score : null,
          archived: review && typeof review.archived === 'boolean' ? review.archived : null,
          events: Array.isArray(snap.events) ? snap.events.length : 0,
          hasReview: !!review,
        },
      };
    });
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
