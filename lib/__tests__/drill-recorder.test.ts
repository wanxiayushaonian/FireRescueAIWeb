// lib/__tests__/drill-recorder.test.ts
// 验证 DrillRecorder:record/getAll/getNode/getChildren/subscribe/clear/genNodeId。
// 纯逻辑,不需要 fake timers(无定时器/异步)。
import { describe, it, expect, vi } from 'vitest';
import {
  DrillRecorder,
  genNodeId,
  type TreeNode,
  type RecordInput,
} from '../drill/drill-recorder';

/** 构造测试节点(减少样板;必填 ts/type/label,其余可选,含 id)。 */
function makeNode(
  overrides: Partial<Omit<TreeNode, 'id' | 'ts' | 'type' | 'label'>> & {
    id?: string;
  } & Pick<TreeNode, 'ts' | 'type' | 'label'>,
): RecordInput {
  return { ...overrides };
}

describe('DrillRecorder', () => {
  it('初始状态:size=0,getAll 返回空数组', () => {
    const rec = new DrillRecorder();
    expect(rec.size()).toBe(0);
    expect(rec.getAll()).toEqual([]);
  });

  it('record 返回完整节点(含生成的 id),并追加到内部存储', () => {
    const rec = new DrillRecorder();
    const node = rec.record(makeNode({ ts: 5, type: 'decision', label: '出水压制' }));
    expect(node.id).toBeTruthy();
    expect(node.id.startsWith('node-')).toBe(true);
    expect(node.ts).toBe(5);
    expect(node.type).toBe('decision');
    expect(node.label).toBe('出水压制');
    expect(rec.size()).toBe(1);
  });

  it('record 接受显式 id(不覆盖)', () => {
    const rec = new DrillRecorder();
    const node = rec.record(makeNode({ id: 'fixed-id', ts: 1, type: 'disaster', label: '起火' }));
    expect(node.id).toBe('fixed-id');
  });

  it('record 保留所有可选字段(detail/parentId/agentName/toolCallId/functionIdentifier/meta)', () => {
    const rec = new DrillRecorder();
    const node = rec.record({
      ts: 3,
      type: 'execution',
      label: 'flyto',
      detail: '飞向21号楼',
      parentId: 'parent-1',
      agentName: '空间查询',
      toolCallId: 'call_x',
      functionIdentifier: 'flyto',
      meta: { input_params: [], twins_instance_ids: ['465718888976764928'] },
    });
    expect(node.detail).toBe('飞向21号楼');
    expect(node.parentId).toBe('parent-1');
    expect(node.agentName).toBe('空间查询');
    expect(node.toolCallId).toBe('call_x');
    expect(node.functionIdentifier).toBe('flyto');
    expect(node.meta).toEqual({
      input_params: [],
      twins_instance_ids: ['465718888976764928'],
    });
  });

  it('getAll 返回追加顺序(非 ts 排序,按 record 顺序)', () => {
    const rec = new DrillRecorder();
    rec.record(makeNode({ ts: 30, type: 'status', label: 'c' }));
    rec.record(makeNode({ ts: 10, type: 'disaster', label: 'a' }));
    rec.record(makeNode({ ts: 20, type: 'arrival', label: 'b' }));
    const all = rec.getAll();
    expect(all.map((n: TreeNode) => n.label)).toEqual(['c', 'a', 'b']);
  });

  it('getAll 返回拷贝(mutation 不影响内部状态)', () => {
    const rec = new DrillRecorder();
    rec.record(makeNode({ ts: 1, type: 'disaster', label: 'x', meta: { k: 1 } }));
    const first = rec.getAll();
    (first[0] as { label: string }).label = 'mutated';
    (first[0].meta as Record<string, unknown>).k = 999;
    const again = rec.getAll();
    expect(again[0].label).toBe('x');
    expect(again[0].meta).toEqual({ k: 1 });
  });

  it('getNode 按 id 查找(存在返回拷贝,不存在返回 undefined)', () => {
    const rec = new DrillRecorder();
    rec.record(makeNode({ id: 'n1', ts: 1, type: 'disaster', label: 'a' }));
    rec.record(makeNode({ id: 'n2', ts: 2, type: 'decision', label: 'b' }));

    const found = rec.getNode('n1');
    expect(found).toBeDefined();
    expect(found?.id).toBe('n1');
    expect(found?.label).toBe('a');

    expect(rec.getNode('nonexistent')).toBeUndefined();
  });

  it('getChildren 返回指定 parentId 的直接子节点(按追加顺序)', () => {
    const rec = new DrillRecorder();
    rec.record(makeNode({ id: 'root', ts: 1, type: 'disaster', label: 'root' }));
    rec.record(makeNode({ id: 'c1', ts: 2, type: 'decision', label: 'child1', parentId: 'root' }));
    rec.record(makeNode({ id: 'c2', ts: 3, type: 'special', label: 'child2', parentId: 'root' }));
    rec.record(makeNode({ id: 'other', ts: 4, type: 'status', label: 'orphan' }));
    rec.record(makeNode({ id: 'c3', ts: 5, type: 'execution', label: 'child3', parentId: 'root' }));

    const children = rec.getChildren('root');
    expect(children.map((c: TreeNode) => c.id)).toEqual(['c1', 'c2', 'c3']);
  });

  it('getChildren 不存在 parentId 时返回空数组', () => {
    const rec = new DrillRecorder();
    rec.record(makeNode({ ts: 1, type: 'disaster', label: 'x' }));
    expect(rec.getChildren('nonexistent')).toEqual([]);
  });

  it('subscribe 在 record 时收到新节点通知', () => {
    const rec = new DrillRecorder();
    const cb = vi.fn();
    rec.subscribe(cb);

    const node = rec.record(makeNode({ ts: 1, type: 'decision', label: '决策' }));
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(node);
  });

  it('subscribe 多次 record 触发多次通知(广播)', () => {
    const rec = new DrillRecorder();
    const cb = vi.fn();
    rec.subscribe(cb);

    rec.record(makeNode({ ts: 1, type: 'decision', label: 'a' }));
    rec.record(makeNode({ ts: 2, type: 'special', label: 'b' }));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('subscribe 返回取消订阅函数,调用后不再收到通知', () => {
    const rec = new DrillRecorder();
    const cb = vi.fn();
    const unsub = rec.subscribe(cb);

    rec.record(makeNode({ ts: 1, type: 'decision', label: 'a' }));
    expect(cb).toHaveBeenCalledTimes(1);

    unsub();
    rec.record(makeNode({ ts: 2, type: 'special', label: 'b' }));
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('subscribe 支持多个订阅者(广播)', () => {
    const rec = new DrillRecorder();
    const cb1 = vi.fn();
    const cb2 = vi.fn();
    rec.subscribe(cb1);
    rec.subscribe(cb2);

    rec.record(makeNode({ ts: 1, type: 'decision', label: 'a' }));
    expect(cb1).toHaveBeenCalledTimes(1);
    expect(cb2).toHaveBeenCalledTimes(1);
  });

  it('取消订阅幂等(多次调用安全)', () => {
    const rec = new DrillRecorder();
    const unsub = rec.subscribe(() => {});
    expect(() => {
      unsub();
      unsub();
    }).not.toThrow();
  });

  it('clear 清空所有节点但不清订阅者', () => {
    const rec = new DrillRecorder();
    const cb = vi.fn();
    rec.subscribe(cb);
    rec.record(makeNode({ ts: 1, type: 'decision', label: 'a' }));

    rec.clear();
    expect(rec.size()).toBe(0);
    expect(rec.getAll()).toEqual([]);

    // 订阅者仍在
    rec.record(makeNode({ ts: 2, type: 'special', label: 'b' }));
    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('支持全部节点类型(disaster/decision/special/arrival/status/execution/generic)', () => {
    const rec = new DrillRecorder();
    const types: TreeNode['type'][] = [
      'disaster',
      'decision',
      'special',
      'arrival',
      'status',
      'execution',
      'generic',
    ];
    for (const type of types) {
      rec.record(makeNode({ ts: 1, type, label: type }));
    }
    expect(rec.getAll().map((n: TreeNode) => n.type)).toEqual(types);
  });
});

describe('genNodeId', () => {
  it('生成唯一性(连续调用不重复)', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      ids.add(genNodeId());
    }
    expect(ids.size).toBe(100);
  });

  it('默认 prefix=node', () => {
    const id = genNodeId();
    expect(id.startsWith('node-')).toBe(true);
  });

  it('支持 prefix 参数', () => {
    expect(genNodeId('decision').startsWith('decision-')).toBe(true);
    expect(genNodeId('execution').startsWith('execution-')).toBe(true);
  });
});
