import { describe, it, expect } from 'vitest';
import { buildScript, type ScriptContext } from '../command-flow/script';

const base: ScriptContext = {
  incidentId: 'JZ-20250612-008',
  address: '九江市浔阳区浔阳路88号九江苏宁广场',
  lng: 115.9895,
  lat: 29.7068,
  routes: [
    { stationName: '城东救援站', polyline: [[29.71, 115.98], [29.7068, 115.9895]], duration: 480, distance: 6200 },
    { stationName: '浔阳大队', polyline: [[29.72, 116.0], [29.7068, 115.9895]], duration: 600, distance: 8100 },
  ],
  statusRecs: {
    到场: { type: 'tactic', content: '到场侦察回传·烟气上升,建议内攻组梯次掩护', basis: '到场侦察回传' },
    控制: { type: 'keypoint', content: '明火基本控制,组织逐层搜救复验', basis: '控制阶段规程' },
  },
};

describe('buildScript', () => {
  it('起始为接警阶段,结尾为熄灭阶段+复位视角', () => {
    const s = buildScript(base);
    expect(s[0].kind).toBe('stage');
    expect(s[0]).toMatchObject({ stage: '接警' });
    expect(s[s.length - 1].kind).toBe('view');
    expect(s[s.length - 1]).toMatchObject({ spec: { kind: 'reset' } });
  });

  it('车辆出发(convoy start)早于全部到场(convoy arriveAll),到场状态翻转在 arriveAll 之后', () => {
    const s = buildScript(base);
    const startIdx = s.findIndex((a) => a.kind === 'convoy' && a.action === 'start');
    const arriveIdx = s.findIndex((a) => a.kind === 'convoy' && a.action === 'arriveAll');
    const statusIdx = s.findIndex((a) => a.kind === 'status' && a.to === '到场');
    expect(startIdx).toBeGreaterThan(-1);
    expect(arriveIdx).toBeGreaterThan(startIdx);
    expect(statusIdx).toBeGreaterThan(arriveIdx);
  });

  it('到场/控制两阶段均推送对应决策推荐', () => {
    const s = buildScript(base);
    expect(s.some((a) => a.kind === 'pushRec' && a.content.includes('到场侦察'))).toBe(true);
    expect(s.some((a) => a.kind === 'pushRec' && a.content.includes('明火基本控制'))).toBe(true);
  });

  it('派遣失败(routes 为空)降级:跳过车辆动画,仍推到场/控制/熄灭', () => {
    const s = buildScript({ ...base, routes: [] });
    expect(s.some((a) => a.kind === 'convoy')).toBe(false);
    expect(s.some((a) => a.kind === 'status' && a.to === '到场')).toBe(true);
    expect(s.some((a) => a.kind === 'status' && a.to === '熄灭')).toBe(true);
    expect(s[s.length - 1]).toMatchObject({ spec: { kind: 'reset' } });
  });

  it('时间轴 at 单调非递减', () => {
    const s = buildScript(base);
    for (let i = 1; i < s.length; i += 1) {
      expect(s[i].at).toBeGreaterThanOrEqual(s[i - 1].at);
    }
  });
});
