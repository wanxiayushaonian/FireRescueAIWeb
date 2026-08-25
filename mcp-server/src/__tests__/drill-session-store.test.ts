import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DrillSessionStore } from '../drill-session-store.js';

describe('DrillSessionStore', () => {
  it('按 drill_id 保存修订号并返回防御性副本', () => {
    const store = new DrillSessionStore();
    const first = store.upsert('d1', { status: 'running', events: [] });
    const second = store.upsert('d1', { status: 'finished', score: 88 });
    expect(first.revision).toBe(1);
    expect(second.revision).toBe(2);
    const got = store.get('d1')!;
    expect(got.snapshot).toEqual({ status: 'finished', score: 88 });
    (got.snapshot as { score: number }).score = 0;
    expect(store.get('d1')!.snapshot).toEqual({ status: 'finished', score: 88 });
  });

  it('原子写入文件并可在新 store 实例恢复', () => {
    const dir = mkdtempSync(join(tmpdir(), 'drill-session-'));
    const path = join(dir, 'sessions.json');
    const first = new DrillSessionStore(path);
    first.upsert('d-persist', { active: true, situation: { fireLevel: 2 } });
    expect(JSON.parse(readFileSync(path, 'utf8')).version).toBe(1);
    const restored = new DrillSessionStore(path);
    expect(restored.get('d-persist')).toMatchObject({
      revision: 1,
      snapshot: { active: true, situation: { fireLevel: 2 } },
    });
  });
});
