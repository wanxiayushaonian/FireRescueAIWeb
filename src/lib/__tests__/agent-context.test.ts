import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildAgentContext } from '../agent-context';
import { getExamResult, getWeakPoints, FAMILIAR_NODES, type ExamResult } from '../../mock/training';

// training.ts 是模块级内存 store,直接 mock 数据入口;FAMILIAR_NODES 是静态数组引用,浅 mock 不可变字段
vi.mock('../../mock/training', async () => {
  const actual = await vi.importActual<typeof import('../../mock/training')>('../../mock/training');
  return {
    ...actual,
    getExamResult: vi.fn(),
    getWeakPoints: vi.fn(),
  };
});

const mockExam = getExamResult as unknown as ReturnType<typeof vi.fn>;
const mockWeak = getWeakPoints as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('buildAgentContext', () => {
  it('无任何可注入内容(无场景/无模块状态) → 返回 null,发送体保持原样', () => {
    vi.stubGlobal('window', {});
    mockExam.mockReturnValue(null);
    expect(buildAgentContext('overview', {})).toBeNull();
  });

  it('通用段:window.__sceneId 存在时注入 3D场景', () => {
    vi.stubGlobal('window', { __sceneId: 's-1' });
    mockExam.mockReturnValue(null);
    const out = buildAgentContext('command', {});
    expect(out).toContain('3D场景=s-1');
    expect(out).toContain('[系统上下文');
  });

  it('objects:传 buildingId 时注入(不传则跳过该段)', () => {
    vi.stubGlobal('window', {});
    mockExam.mockReturnValue(null);
    expect(buildAgentContext('objects', { objectsBuildingId: 'uuid-21' })).toContain('当前建筑id=uuid-21');
    expect(buildAgentContext('objects', {})).toBeNull();
  });

  it('training:有考核 → 成绩摘要 + 薄弱点位 top5(含楼层与错次)', () => {
    vi.stubGlobal('window', {});
    mockExam.mockReturnValue({
      postName: '战斗员', score: 72, total: 20, wrongQuestions: [{}, {}, {}],
    } as unknown as ExamResult);
    mockWeak.mockReturnValue([
      { pointId: 'p1', pointName: '避难层', category: 'floor', categoryPath: 'x', floor: '13F', errors: 3 },
      { pointId: 'p2', pointName: '消火栓', category: 'facility', categoryPath: 'y', floor: 'B1', errors: 1 },
    ]);
    const out = buildAgentContext('training', {});
    expect(out).toContain('最近考核=战斗员/72分/总20题/错3题');
    expect(out).toContain('薄弱点位=避难层[13F]错3、消火栓[B1]错1');
  });

  it('training:无考核 → 引导语;低熟悉度点位按熟悉度升序取 3 个', () => {
    vi.stubGlobal('window', {});
    mockExam.mockReturnValue(null);
    const out = buildAgentContext('training', {});
    expect(out).toContain('考核记录=无');
    expect(out).toContain('低熟悉度=');
    // 默认 mock 数据里 <60% 的点位存在(演示初始画像),至少 1 项
    const seg = out!.match(/低熟悉度=([^;]+)/)![1];
    expect(seg.length).toBeGreaterThan(0);
    // FAMILIAR_NODES 引用真实静态数据,只验证个数上限
    expect(seg.split('、').length).toBeLessThanOrEqual(3);
  });

  it('全局助手不经过本函数路径(AgentSidebar 侧拦截),函数本身对 drill 仅注入通用段', () => {
    vi.stubGlobal('window', { __sceneId: 's-drill' });
    mockExam.mockReturnValue(null);
    const out = buildAgentContext('drill', {});
    expect(out).toContain('3D场景=s-drill');
    expect(out).not.toContain('考核');
  });
});
