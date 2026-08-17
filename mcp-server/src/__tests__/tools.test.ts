import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handleToolCall, TOOLS } from '../tools.js';
import { publishCommand } from '../command-bus.js';

vi.mock('../command-bus.js', () => ({
  publishCommand: vi.fn(),
}));

vi.mock('../bff-client.js', () => ({
  getSceneOverview: vi.fn().mockResolvedValue({
    sceneId: 's1',
    storyCount: 2,
    deviceCount: 5,
    fireDeviceCount: 1,
    ok: true,
  }),
  getFireDeviceList: vi.fn().mockResolvedValue([
    { id: 'd1', name: '喷淋头A', type: 'ClosedSprinklerHead' },
    { id: 'd2', name: '烟感B', type: 'StandaloneSmokeAlarm' },
  ]),
  getFloorList: vi.fn().mockResolvedValue([
    { id: 'f1', name: '一层' },
    { id: 'f2', name: '二层' },
  ]),
}));

vi.mock('../business-client.js', () => ({
  getBuildingProfile: vi.fn().mockResolvedValue({
    id: 'b1', name: '21号楼', address: '某路1号', sceneId: 's-1',
    keyFloorCount: 1, structureDesignCount: 1, surroundingCount: 1,
  }),
  getFacilities: vi.fn().mockResolvedValue([
    { id: 'f1', facilityType: '消火栓', name: '一层消火栓', status: '正常' },
  ]),
  getKeyParts: vi.fn().mockResolvedValue([
    { id: 'kf1', name: '避难层', floor: '15', func: '避难' },
  ]),
  getKnowledge: vi.fn().mockResolvedValue({
    query: '高层建筑火灾风险', kbId: 'kb-1', count: 1,
    chunks: [
      {
        chunkId: 'c1', documentId: 'd1', documentName: '乐盈广场21号楼预案.docx',
        content: '29F 楼梯间高空坠落/烟囱效应风险', score: 0.702,
        chunkIndex: 0, kbId: 'kb-1', kbType: '处置对策',
      },
    ],
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('tools', () => {
  it('TOOLS 含 list_fire_devices / fly_to / list_floors', () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain('list_fire_devices');
    expect(names).toContain('fly_to');
    expect(names).toContain('list_floors');
  });

  it('fly_to 发布命令,文案明确为「已下发」而非暗示确定执行成功', async () => {
    const res = await handleToolCall('fly_to', { target: 'd1' });
    expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({ tool: 'fly_to', args: { target: 'd1' } }));
    expect(res.content[0].text).toContain('已下发');
    expect(res.content[0].text).not.toMatch(/^ack:/);
  });

  it('fly_to 空 target → 标记错误且不发布命令', async () => {
    const res = await handleToolCall('fly_to', {});
    expect(res.isError).toBe(true);
    expect(publishCommand).not.toHaveBeenCalled();
  });

  it('list_fire_devices 返回设备清单', async () => {
    const res = await handleToolCall('list_fire_devices', {});
    const text = res.content[0].text;
    expect(text).toContain('"total": 2');
    expect(text).toContain('d1');
    expect(text).toContain('喷淋头A');
    expect(text).toContain('ClosedSprinklerHead');
  });

  it('list_floors 返回楼层清单(id/name)', async () => {
    const res = await handleToolCall('list_floors', {});
    const text = res.content[0].text;
    expect(text).toContain('"total": 2');
    expect(text).toContain('f1');
    expect(text).toContain('一层');
  });

  it('focus_objects 发布命令并返回已下发', async () => {
    const res = await handleToolCall('focus_objects', { ids: ['d1', 'd2'] });
    expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'focus_objects', args: { ids: ['d1', 'd2'] },
    }));
    expect(res.content[0].text).toContain('已下发');
  });

  it('focus_objects 空 ids 也发布(清除命令)', async () => {
    await handleToolCall('focus_objects', { ids: [] });
    expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'focus_objects', args: { ids: [] },
    }));
  });

  it('focus_floors 发布命令并返回已下发', async () => {
    const res = await handleToolCall('focus_floors', { story_ids: ['s1'] });
    expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'focus_floors', args: { story_ids: ['s1'] },
    }));
    expect(res.content[0].text).toContain('已下发');
  });

  it('TOOLS 含 show_route(场景命令;业务查询走 Python MCP,不塞 Node)', () => {
    expect(TOOLS.map((t) => t.name)).toContain('show_route');
  });

  it('show_route 发布命令并返回已下发', async () => {
    const routes = [{ stationName: '康泰路专职队', polyline: [[29.7, 115.96]], distance: 3300, duration: 480, trafficLights: 3 }];
    const res = await handleToolCall('show_route', { routes, target: '乐盈广场' });
    expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'show_route', args: { routes, target: '乐盈广场' },
    }));
    expect(res.content[0].text).toContain('已下发');
  });

  it('show_route 空 routes → 标记错误且不发布命令', async () => {
    const res = await handleToolCall('show_route', { routes: [] });
    expect(res.isError).toBe(true);
    expect(publishCommand).not.toHaveBeenCalled();
  });

  it('TOOLS 含 gis_fly_to(GIS 态势总览地图命令)', () => {
    expect(TOOLS.map((t) => t.name)).toContain('gis_fly_to');
  });

  it('gis_fly_to 发布命令:坐标必填,zoom/label 可选透传', async () => {
    const res = await handleToolCall('gis_fly_to', { lat: 29.6612, lng: 115.9475, zoom: 16, label: '乐盈广场21号楼' });
    expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'gis_fly_to',
      args: { lat: 29.6612, lng: 115.9475, zoom: 16, label: '乐盈广场21号楼' },
    }));
    expect(res.content[0].text).toContain('已下发');
    expect(res.content[0].text).toContain('乐盈广场21号楼');
  });

  it('gis_fly_to 仅坐标也可(无 zoom/label 时 args 不含空字段)', async () => {
    await handleToolCall('gis_fly_to', { lat: 29.6612, lng: 115.9475 });
    expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'gis_fly_to',
      args: { lat: 29.6612, lng: 115.9475 },
    }));
  });

  it('gis_fly_to 缺坐标/非法坐标 → 标记错误且不发布命令', async () => {
    for (const bad of [{}, { lat: 29.6612 }, { lat: 'abc', lng: 115.9475 }]) {
      const res = await handleToolCall('gis_fly_to', bad);
      expect(res.isError).toBe(true);
    }
    expect(publishCommand).not.toHaveBeenCalled();
  });

  it('TOOLS 含 5C 新工具(query_building_profile/query_facilities/query_key_parts/query_scene_state/inject_event/report_decision)', () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain('query_building_profile');
    expect(names).toContain('query_facilities');
    expect(names).toContain('query_key_parts');
    expect(names).toContain('query_scene_state');
    expect(names).toContain('inject_event');
    expect(names).toContain('report_decision');
  });

  it('TOOLS 含 query_knowledge（RAG 检索，Round 9 加入）', () => {
    const names = TOOLS.map((t) => t.name);
    expect(names).toContain('query_knowledge');
  });

  it('query_knowledge 调 business-client 返回检索结果', async () => {
    const res = await handleToolCall('query_knowledge', { query: '高层建筑火灾风险' });
    const text = res.content[0].text;
    expect(text).toContain('"count": 1');
    expect(text).toContain('29F 楼梯间高空坠落/烟囱效应风险');
    expect(text).toContain('"score": 0.702');
  });

  it('query_knowledge 透传 top_k', async () => {
    const { getKnowledge } = await import('../business-client.js');
    await handleToolCall('query_knowledge', { query: '危化品泄漏处置', top_k: 3 });
    expect(getKnowledge).toHaveBeenCalledWith('危化品泄漏处置', { topK: 3 });
  });

  it('query_knowledge 缺 query → 错误', async () => {
    const res = await handleToolCall('query_knowledge', {});
    expect(res.isError).toBe(true);
  });

  it('query_building_profile 调 business-client 返回档案', async () => {
    const res = await handleToolCall('query_building_profile', { building_id: 'b1' });
    const text = res.content[0].text;
    expect(text).toContain('"id": "b1"');
    expect(text).toContain('21号楼');
    expect(text).toContain('"keyFloorCount": 1');
  });

  it('query_building_profile 缺 building_id → 错误', async () => {
    const res = await handleToolCall('query_building_profile', {});
    expect(res.isError).toBe(true);
  });

  it('query_facilities 透传 floor/type 过滤参数', async () => {
    const { getFacilities } = await import('../business-client.js');
    await handleToolCall('query_facilities', { building_id: 'b1', floor: '三层', type: '消火栓' });
    expect(getFacilities).toHaveBeenCalledWith('b1', { floor: '三层', type: '消火栓' });
  });

  it('query_facilities 缺 building_id → 错误', async () => {
    const res = await handleToolCall('query_facilities', {});
    expect(res.isError).toBe(true);
  });

  it('query_key_parts 返回重点部位', async () => {
    const res = await handleToolCall('query_key_parts', { building_id: 'b1' });
    const text = res.content[0].text;
    expect(text).toContain('"total": 1');
    expect(text).toContain('避难层');
  });

  it('query_scene_state stub 返回 wired=false + 文案含 6.2', async () => {
    const res = await handleToolCall('query_scene_state', { drill_id: 'd1' });
    const text = res.content[0].text;
    expect(text).toContain('"wired": false');
    expect(text).toContain('6.2');
    expect(text).toContain('"drillId": "d1"');
  });

  it('query_scene_state 缺 drill_id → 错误', async () => {
    const res = await handleToolCall('query_scene_state', {});
    expect(res.isError).toBe(true);
  });

  it('inject_event stub 透传 publishCommand + 返回 wired=false', async () => {
    const event = { type: 'wind_shift', payload: { dir: 'NE' } };
    const res = await handleToolCall('inject_event', { drill_id: 'd1', event });
    const text = res.content[0].text;
    expect(text).toContain('"accepted": true');
    expect(text).toContain('"wired": false');
    expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'drill_inject_event',
      args: { drill_id: 'd1', event },
    }));
  });

  it('inject_event 缺 event → 错误', async () => {
    const res = await handleToolCall('inject_event', { drill_id: 'd1' });
    expect(res.isError).toBe(true);
  });

  it('inject_event event 非对象 → 错误', async () => {
    const res = await handleToolCall('inject_event', { drill_id: 'd1', event: 'wind_shift' });
    expect(res.isError).toBe(true);
  });

  it('report_decision stub 透传 publishCommand + 返回 wired=false', async () => {
    const decision = { action: 'dispatch', targets: ['station-a'] };
    const res = await handleToolCall('report_decision', { drill_id: 'd1', decision });
    const text = res.content[0].text;
    expect(text).toContain('"accepted": true');
    expect(text).toContain('"wired": false');
    expect(publishCommand).toHaveBeenCalledWith(expect.objectContaining({
      tool: 'drill_report_decision',
      args: { drill_id: 'd1', decision },
    }));
  });

  it('report_decision 缺 decision → 错误', async () => {
    const res = await handleToolCall('report_decision', { drill_id: 'd1' });
    expect(res.isError).toBe(true);
  });

  it('未知 tool 抛出 unknown tool 错误', async () => {
    await expect(handleToolCall('unknown_xyz', {})).rejects.toThrow(/unknown tool/);
  });
});
