import { describe, it, expect, beforeEach } from 'vitest';
import {
  recordCaseEvent,
  getCaseTimeline,
  subscribeCaseTimeline,
  __resetCaseTimelineForTest,
} from '../case-timeline';

describe('case-timeline', () => {
  beforeEach(() => __resetCaseTimelineForTest());

  it('按警情累积条目,时序追加', () => {
    expect(getCaseTimeline('inc-1')).toEqual([]);
    recordCaseEvent('inc-1', 'manual', '选定案件 inc-1', '某地址');
    recordCaseEvent('inc-1', 'status', '状态推进:接警 → 出动');
    const list = getCaseTimeline('inc-1');
    expect(list).toHaveLength(2);
    expect(list[0].label).toContain('选定案件');
    expect(list[1].kind).toBe('status');
    expect(list[0].ts).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  });

  it('多案互不串档', () => {
    recordCaseEvent('a', 'manual', 'A 案');
    recordCaseEvent('b', 'dispatch', 'B 案派遣');
    expect(getCaseTimeline('a')).toHaveLength(1);
    expect(getCaseTimeline('b')).toHaveLength(1);
    expect(getCaseTimeline('b')[0].kind).toBe('dispatch');
  });

  it('订阅:记录时通知,退订后不再通知', () => {
    let n = 0;
    const unsub = subscribeCaseTimeline(() => { n += 1; });
    recordCaseEvent('a', 'manual', 'x');
    unsub();
    recordCaseEvent('a', 'manual', 'y');
    expect(n).toBe(1);
  });
});
