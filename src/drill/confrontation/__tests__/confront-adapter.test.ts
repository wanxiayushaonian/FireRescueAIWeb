import { describe, it, expect } from 'vitest';
import { ConfrontAdapter } from '../confront-adapter';
import type { PostAgentChatParams } from '@/lib/agent-chat-client';

/** fake SSE:按顺序 yield 若干 data 行。 */
function fakeStream(lines: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const payload = lines.map((l) => `data: ${l}\n`).join('');
  return new ReadableStream({
    start(controller) {
      controller.enqueue(enc.encode(payload));
      controller.close();
    },
  });
}

function fakePost(events: unknown[]) {
  return async (_p: PostAgentChatParams) =>
    fakeStream(events.map((e) => JSON.stringify(e)));
}

const SEED = { building: '21号楼', floor: '5F', material: '电气', trapped: 5, seed: '#ABCD' };
const CTX = { appId: 'app-1', buildingId: 'b-1', sceneId: 's-1', drillId: 'd-1', seed: SEED };

describe('confront-adapter', () => {
  it('generateInitialPlan 从 text/report_decision 提取部署行', async () => {
    const adapter = new ConfrontAdapter({
      postChat: fakePost([{ type: 'text', content: '到场后首层设指挥部,出2支水枪堵截' }]),
    });
    const out = await adapter.generateInitialPlan(CTX);
    expect(out?.deployLines.length).toBeGreaterThan(0);
  });

  it('injectSpecial 解析 inject_event args → 特情卡', async () => {
    const adapter = new ConfrontAdapter({
      postChat: fakePost([
        {
          type: 'tool-call',
          toolCallId: 'tc1',
          toolName: 'inject_event',
          args: { event: { type: 'wind_shift', description: '风向突变浓烟倒灌', payload: { location: '5F', fireLevelDelta: 1 } } },
        },
      ]),
    });
    const out = await adapter.injectSpecial(CTX, '5F 被困 5 人,火势初起');
    expect(out?.emergency).toBe('风向突变浓烟倒灌');
    expect(out?.location).toBe('5F');
    expect(out?.delta?.fireLevelDelta).toBe(1);
  });

  it('injectSpecial 契约解析失败 → 返回 null 不抛', async () => {
    const adapter = new ConfrontAdapter({
      postChat: fakePost([{ type: 'text', content: '未知' }]),
    });
    const out = await adapter.injectSpecial(CTX, '5F 被困 5 人,火势初起');
    expect(out).toBeNull();
  });

  it('injectSpecial 兼容顶层平铺结构(event 嵌套不存在时)', async () => {
    const adapter = new ConfrontAdapter({
      postChat: fakePost([
        {
          type: 'tool-call',
          toolCallId: 'tc1b',
          toolName: 'inject_event',
          args: { type: 'collapse', description: '结构异响建议撤离', payload: { location: '6F', trappedDelta: 2 } },
        },
      ]),
    });
    const out = await adapter.injectSpecial(CTX, '5F 被困 5 人,火势初起');
    expect(out?.emergency).toBe('结构异响建议撤离');
    expect(out?.location).toBe('6F');
    expect(out?.delta?.trappedDelta).toBe(2);
  });

  it('generateAdjustment 兼容顶层平铺 action/rationale', async () => {
    const adapter = new ConfrontAdapter({
      postChat: fakePost([
        {
          type: 'tool-call',
          toolCallId: 'tc2b',
          toolName: 'report_decision',
          args: { action: '启用备用频道', rationale: '通信受扰,内攻组失联', tactic: 'ventilation' },
        },
      ]),
    });
    const out = await adapter.generateAdjustment(CTX, '风向突变浓烟倒灌');
    expect(out?.adjustments.join()).toContain('启用备用频道');
  });

  it('generateAdjustment 解析 report_decision action/rationale → 调整行', async () => {
    const adapter = new ConfrontAdapter({
      postChat: fakePost([
        {
          type: 'tool-call',
          toolCallId: 'tc2',
          toolName: 'report_decision',
          args: { decision: { action: '内攻改道', rationale: '进攻通道调整至背风面', tactic: 'ventilation' } },
        },
      ]),
    });
    const out = await adapter.generateAdjustment(CTX, '风向突变浓烟倒灌');
    expect(out?.adjustments.join()).toContain('内攻改道');
  });

  it('postChat 抛错 → 返回 null', async () => {
    const adapter = new ConfrontAdapter({
      postChat: async () => {
        throw new Error('network');
      },
    });
    const out = await adapter.injectSpecial(CTX, '5F 被困 5 人,火势初起');
    expect(out).toBeNull();
  });
});
