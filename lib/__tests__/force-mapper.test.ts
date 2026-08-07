import { describe, it, expect } from 'vitest';
import { mapStation, mapResource, buildForceStats, buildResourceTree } from '../force-mapper';

const RAW_STATION = {
  id: 'st-1', name: '城东救援站', station_type: '普通消防站', address: '珠江路 100 号',
  longitude: 118.7545, latitude: 32.046, duty_phone: '025-8311****', status: 'normal',
  extra_attrs: { commander: '张海涛', personnel_count: 42, vehicle_summary: { 水罐车: 2, 云梯车: 1 } },
};
const RAW_VEHICLE = {
  id: 'f-1', ref_type: 'fire_station', ref_id: 'st-1', force_type: '车辆',
  name: '水罐车 A-001', subtype: '水罐车', status: '在位',
};

describe('force-mapper', () => {
  it('mapStation 映射 snake→camel 并展开 extra_attrs', () => {
    const s = mapStation(RAW_STATION);
    expect(s.name).toBe('城东救援站');
    expect(s.type).toBe('普通消防站');
    expect(s.lng).toBe(118.7545);
    expect(s.lat).toBe(32.046);
    expect(s.dutyPhone).toBe('025-8311****');
    expect(s.contact).toBe('张海涛');
    expect(s.personnel).toBe(42);
    expect(s.vehicles).toBe(3); // 2 + 1
  });

  it('mapStation 容忍缺省 extra_attrs/坐标', () => {
    const s = mapStation({ id: 'st-x', name: 'X站', station_type: '微型消防站', status: 'normal' });
    expect(s.personnel).toBe(0);
    expect(s.vehicles).toBe(0);
    expect(s.contact).toBe('');
  });

  it('mapResource 映射 force_type→category / ref_id→stationId', () => {
    const r = mapResource(RAW_VEHICLE);
    expect(r.category).toBe('车辆');
    expect(r.stationId).toBe('st-1');
    expect(r.subtype).toBe('水罐车');
    expect(r.status).toBe('在位');
  });

  it('buildForceStats 聚合队站/人员/车辆/装备', () => {
    const stations = [mapStation(RAW_STATION), mapStation({ id: 'st-2', name: '城西救援站', station_type: '救援站', status: 'normal' })];
    const resources = [mapResource(RAW_VEHICLE), mapResource({ ...RAW_VEHICLE, id: 'f-2', force_type: '人员', subtype: '干部' }), mapResource({ ...RAW_VEHICLE, id: 'f-3', force_type: '装备', subtype: '侦检' })];
    const stats = buildForceStats(stations, resources);
    expect(stats.map((s) => s.value)).toEqual([2, 1, 1, 1]);
    expect(stats.every((s) => s.delta === undefined)).toBe(true);
  });

  it('buildResourceTree 按分类/子类分组', () => {
    const stations = [mapStation(RAW_STATION), mapStation({ id: 'st-2', name: '庐山大道特勤站', station_type: '特勤消防站', status: 'normal' })];
    const resources = [
      mapResource(RAW_VEHICLE),
      mapResource({ ...RAW_VEHICLE, id: 'f-2', force_type: '人员', subtype: '干部' }),
      mapResource({ ...RAW_VEHICLE, id: 'f-3', name: '可燃气体检测仪', force_type: '装备', subtype: '侦检' }),
    ];
    const tree = buildResourceTree(stations, resources);
    const stationNode = tree.find((g) => g.category === '队站');
    expect(stationNode?.children).toEqual([{ name: '特勤消防站', count: 1 }, { name: '普通消防站', count: 1 }]);
    expect(tree.find((g) => g.category === '人员')?.children).toEqual([{ name: '干部', count: 1 }]);
    expect(tree.find((g) => g.category === '装备')?.children).toEqual([{ name: '可燃气体检测仪', count: 1 }]);
  });
});
