import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  getBuildingProfile,
  getFacilities,
  getKeyParts,
  getKnowledge,
  DEFAULT_KB_ID,
} from '../business-client.js';

beforeEach(() => {
  vi.unstubAllGlobals();
});

const BUILDING_DETAIL = {
  id: 'b1',
  name: '21号楼',
  address: '某路1号',
  scene_id: 's-1',
  longitude: 115.96,
  latitude: 29.7,
  building_type: 'highrise',
  building_usage: 'commercial',
  built_year: 2018,
  building_height: 80,
  ground_floors: 20,
  underground_floors: 2,
  floor_area: 30000,
  property_owner: '某物业',
  management_unit: '某管理',
  contact_name: '张三',
  contact_phone: '13800000000',
  structure_designs: [{ id: 'sd1' }],
  surroundings: [{ id: 'su1' }],
  key_floors: [
    {
      id: 'kf1', name: '避难层', floor: '15', function: '避难',
      fire_hazard: '低', hazard_source: null, internal_facilities: '应急照明',
      access_route: '消防电梯', exit_count: 2, responsible_person: '李四',
    },
  ],
};

const FACILITY_PAGE = {
  items: [
    {
      id: 'f1', ref_type: 'key_building', ref_id: 'b1', facility_type: '消火栓',
      name: '一层消火栓', status: '正常', location_path: '一层东区',
      longitude: 115.96, latitude: 29.7, extra_attrs: { quantity: 2 }, ai_description: '室内消火栓',
    },
    {
      id: 'f2', ref_type: 'key_building', ref_id: 'b1', facility_type: '喷淋系统',
      name: '三层喷淋', status: '故障', location_path: '三层中区',
      longitude: null, latitude: null, extra_attrs: null, ai_description: null,
    },
  ],
  total: 2,
};

function mockFetch(urls: Record<string, unknown>): void {
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const u = String(url);
    for (const [key, body] of Object.entries(urls)) {
      if (u.includes(key)) {
        return Promise.resolve(new Response(JSON.stringify(body), {
          headers: { 'content-type': 'application/json' },
        }));
      }
    }
    return Promise.resolve(new Response('not found', { status: 404 }));
  }));
}

describe('getBuildingProfile', () => {
  it('拍平核心字段 + 透传 structureDesigns/surroundings + 统计 keyFloorCount', async () => {
    mockFetch({ 'key-buildings/b1': BUILDING_DETAIL });
    const p = await getBuildingProfile('b1');
    expect(p.id).toBe('b1');
    expect(p.name).toBe('21号楼');
    expect(p.location).toEqual({ lng: 115.96, lat: 29.7 });
    expect(p.sceneId).toBe('s-1');
    expect(p.structureDesignCount).toBe(1);
    expect(p.surroundingCount).toBe(1);
    expect(p.keyFloorCount).toBe(1);
    expect(p.structureDesigns).toEqual([{ id: 'sd1' }]);
    expect(p.surroundings).toEqual([{ id: 'su1' }]);
  });

  it('BFF 非 200 时错误信息带响应 body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response('{"detail":"not found"}', { status: 404 }),
    ));
    await expect(getBuildingProfile('missing')).rejects.toThrow(/not found/);
  });

  it('BFF 网络错误时抛出可读信息', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));
    await expect(getBuildingProfile('b1')).rejects.toThrow(/网络错误或超时/);
  });
});

describe('getFacilities', () => {
  it('默认返回全部(扁平化字段)', async () => {
    mockFetch({ 'fire-facilities': FACILITY_PAGE });
    const list = await getFacilities('b1');
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: 'f1', facilityType: '消火栓', status: '正常' });
    expect(list[1]).toMatchObject({ id: 'f2', facilityType: '喷淋系统', status: '故障' });
  });

  it('floor 子串过滤 location_path', async () => {
    mockFetch({ 'fire-facilities': FACILITY_PAGE });
    const list = await getFacilities('b1', { floor: '三层' });
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('f2');
  });

  it('type 子串大小写不敏感匹配 facility_type', async () => {
    mockFetch({ 'fire-facilities': FACILITY_PAGE });
    const list = await getFacilities('b1', { type: 'sprinkler' });
    // facility_type=喷淋系统(中文),英文 sprinkler 不匹配 → 空
    expect(list).toHaveLength(0);
    const list2 = await getFacilities('b1', { type: '消火栓' });
    expect(list2).toHaveLength(1);
    expect(list2[0].id).toBe('f1');
  });
});

describe('getKeyParts', () => {
  it('返回 key_floors 扁平化', async () => {
    mockFetch({ 'key-buildings/b1': BUILDING_DETAIL });
    const parts = await getKeyParts('b1');
    expect(parts).toHaveLength(1);
    expect(parts[0]).toMatchObject({
      id: 'kf1', name: '避难层', floor: '15', func: '避难',
      exitCount: 2, responsiblePerson: '李四',
    });
  });

  it('建筑无 key_floors → 空数组', async () => {
    mockFetch({ 'key-buildings/b1': { ...BUILDING_DETAIL, key_floors: undefined } });
    const parts = await getKeyParts('b1');
    expect(parts).toEqual([]);
  });
});

describe('getKnowledge', () => {
  const RETRIEVE_BODY = {
    items: [
      {
        chunk_id: 'c1', document_id: 'd1', document_name: '乐盈广场21号楼预案.docx',
        content: '29F 楼梯间高空坠落/烟囱效应风险', score: 0.702,
        chunk_index: 0, kb_id: 'kb-1', kb_type: '处置对策',
      },
      {
        chunk_id: 'c2', document_id: 'd1', document_name: '乐盈广场21号楼预案.docx',
        content: '29F 泵房爆炸风险', score: 0.698,
        chunk_index: 1, kb_id: 'kb-1', kb_type: '处置对策',
      },
    ],
    total: 2,
  };

  it('POST retrieve + 返回结构化结果（显式 kbId/topK 传参）', async () => {
    mockFetch({ 'knowledge/bases/kb-1/retrieve': RETRIEVE_BODY });
    const r = await getKnowledge('高层建筑火灾风险', { kbId: 'kb-1' });
    expect(r).toMatchObject({ query: '高层建筑火灾风险', kbId: 'kb-1', count: 2 });
    expect(r.chunks[0]).toMatchObject({
      chunk_id: 'c1', document_name: '乐盈广场21号楼预案.docx',
      content: '29F 楼梯间高空坠落/烟囱效应风险', score: 0.702,
    });
  });

  it('请求体携带 query/top_k（topK 传参覆盖默认 5）', async () => {
    const fetchMock = vi.fn((url: string) => {
      if (String(url).includes('knowledge/bases/kb-1/retrieve')) {
        return Promise.resolve(new Response(JSON.stringify(RETRIEVE_BODY), {
          headers: { 'content-type': 'application/json' },
        }));
      }
      return Promise.resolve(new Response('not found', { status: 404 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await getKnowledge('危化品泄漏处置', { topK: 3, kbId: 'kb-1' });
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ query: '危化品泄漏处置', top_k: 3 });
  });

  it('items 缺失时 count=0 空数组（不抛错）', async () => {
    mockFetch({ [`knowledge/bases/${DEFAULT_KB_ID}/retrieve`]: { total: 0 } });
    const r = await getKnowledge('任意查询');
    expect(r).toMatchObject({ count: 0, chunks: [] });
    expect(r.kbId).toBe(DEFAULT_KB_ID);
  });

  it('BFF 网络错误时抛出可读信息', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED')));
    await expect(getKnowledge('高层建筑火灾风险')).rejects.toThrow(/网络错误或超时/);
  });
});
