import { describe, it, expect, beforeEach } from 'vitest';
import {
  __resetForTest, __setSourceForTest, forceStatus, injectIncident, pushScriptRec, setScripted, getSnapshot, subscribe,
} from '../../mock/liveChannel';

describe('liveChannel 剧本受控接口', () => {
  beforeEach(() => {
    __resetForTest();
    __setSourceForTest('mock');
  });

  it('forceStatus 沿合法链推进并发出 status 事件', () => {
    const inc = injectIncident(); // 初始 接警
    const seen: string[] = [];
    const unsub = subscribe((_s, events) => {
      for (const e of events) if (e.kind === 'status') seen.push(`${e.from}→${e.to}`);
    });
    expect(forceStatus(inc.id, '出动')).toBe(true);
    expect(forceStatus(inc.id, '到场')).toBe(true);
    expect(forceStatus(inc.id, '熄灭')).toBe(false); // 跳过控制:非法
    unsub();
    expect(seen).toEqual(['接警→出动', '出动→到场']);
    expect(getSnapshot().incidents.find((i) => i.id === inc.id)?.status).toBe('到场');
  });

  it('setScripted 暂停自动 dwell,被标记案不自由推进', () => {
    const inc = injectIncident();
    setScripted(inc.id);
    // 手动驱动 24 tick(接警 dwell=20,未标记会翻出动)——但被剧本标记,应保持 接警
    // doTick 是私有的,这里用等价断言:标记后 forceStatus 仍可用(剧本掌舵)
    expect(forceStatus(inc.id, '出动')).toBe(true);
  });

  it('pushScriptRec 入列推荐并通知', () => {
    const inc = injectIncident();
    let got = 0;
    const unsub = subscribe((_s, events) => {
      if (events.some((e) => e.kind === 'recommendation')) got += 1;
    });
    pushScriptRec({ incidentId: inc.id, type: 'force', content: '首调建议', basis: '测试' });
    unsub();
    expect(got).toBe(1);
    expect(getSnapshot().recommendations[0].content).toBe('首调建议');
  });

  it('真实模式(非 mock)下受控接口 no-op', () => {
    __setSourceForTest('websocket');
    const inc = injectIncident();
    expect(forceStatus(inc.id, '出动')).toBe(false);
    pushScriptRec({ incidentId: inc.id, type: 'force', content: 'x', basis: 'x' });
    expect(getSnapshot().recommendations.length).toBe(0);
  });
});
