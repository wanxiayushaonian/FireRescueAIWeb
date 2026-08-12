import { describe, it, expect } from 'vitest';
import { agentToolToSceneAction, toolCallLabel } from '@/lib/agent-scene-tools';

describe('agentToolToSceneAction', () => {
  it('flyto → flyTo 场景动作', () => {
    const ev = {
      type: 'tool-call' as const, toolCallId: 't1', toolName: 'batchInvokeTwinsFunction',
      args: { function_identifier: 'flyto', input_params: [], twins_instance_ids: ['465718888976764928'] },
    };
    const a = agentToolToSceneAction(ev);
    expect(a).not.toBeNull();
    expect(a!.action).toBe('flyTo');
    expect(a!.target).toBe('465718888976764928');
  });

  it('highlight → highlight 场景动作', () => {
    const ev = {
      type: 'tool-call' as const, toolCallId: 't2', toolName: 'batchInvokeTwinsFunction',
      args: { function_identifier: 'highlight', input_params: [{key:'color',value:'#ffcc00'}], twins_instance_ids: ['x1'] },
    };
    expect(agentToolToSceneAction(ev)!.action).toBe('highlight');
  });

  it('未知本体功能(setOpacity)→ null 不猜', () => {
    const ev = {
      type: 'tool-call' as const, toolCallId: 't3', toolName: 'batchInvokeTwinsFunction',
      args: { function_identifier: 'setOpacity', input_params: [], twins_instance_ids: ['x1'] },
    };
    expect(agentToolToSceneAction(ev)).toBeNull();
  });

  it('查询类工具不执行', () => {
    const ev = {
      type: 'tool-call' as const, toolCallId: 't4', toolName: 'query_building_profile',
      args: { keyword: '金茂' },
    };
    expect(agentToolToSceneAction(ev)).toBeNull();
  });
});

describe('toolCallLabel', () => {
  it('查询类 → 查询了 X', () => {
    const ev = { type: 'tool-call' as const, toolCallId: 't', toolName: 'query_scene_state', args: {} };
    expect(toolCallLabel(ev)).toBe('查询了 query_scene_state');
  });
  it('task → 子 agent 处理中', () => {
    const ev = { type: 'tool-call' as const, toolCallId: 't', toolName: 'task', args: { subagent_type: '空间查询' } };
    expect(toolCallLabel(ev)).toBe('子 agent 处理中(空间查询)');
  });
  it('有映射的 batchInvoke → null(走动作卡)', () => {
    const ev = { type: 'tool-call' as const, toolCallId: 't', toolName: 'batchInvokeTwinsFunction', args: { function_identifier: 'flyto' } };
    expect(toolCallLabel(ev)).toBeNull();
  });
});
