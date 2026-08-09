import { describe, it, expect } from 'vitest';
import {
  mapBuildingProfile,
  mapFireSystem,
  normalizeFacilityStatus,
  type ZnyaKeyBuildingDetail,
  type ZnyaFireFacility,
} from '../building-mapper';

const DETAIL: ZnyaKeyBuildingDetail = {
  id: 'b-1',
  name: '乐盈广场21号楼',
  address: '九江市浔阳区长虹大道128号',
  building_type: '高层民用建筑',
  building_usage: '商业',
  building_height: 258.0,
  floor_area: 185000.0,
  ground_floors: 58,
  underground_floors: 4,
  standard_floor_area: 3200.0,
  building_length: 95.0,
  building_width: 48.0,
  property_owner: '九江乐盈置业有限公司',
  management_unit: '九江乐盈物业',
  contact_name: '张伟',
  contact_phone: '13800138001',
  scene_id: '465718852859613184',
  status: 'pending_review',
  completion_rate: 100,
  longitude: 115.947,
  latitude: 29.661,
  structure_designs: [
    {
      structure_type: '钢混框架核心筒结构',
      fire_resistance_rating: '一级',
      fire_compartment_count: 12,
      fire_elevator_count: 4,
      refuge_floor: '15F, 30F, 45F',
      refuge_floor_area: 450.0,
    },
  ],
  surroundings: [
    {
      surrounding_roads: '长虹大道、浔阳东路',
      fire_lane: '环形消防车道',
      fire_lane_width: 6.0,
      fire_lane_height: 4.5,
      adjacent_building_spacing: '东侧距写字楼30米',
    },
  ],
  key_floors: [
    {
      id: 'kf-1',
      name: '首层大堂',
      floor: '1F',
      function: '商业入口',
      fire_hazard: '人员密集',
      hazard_source: '装修材料',
      internal_facilities: '自动扶梯、空调',
      access_route: '主入口、侧门',
      exit_count: 6,
      responsible_person: '李经理',
    },
  ],
};

const FACILITY: ZnyaFireFacility = {
  id: 'ff-1',
  ref_type: 'key_building',
  ref_id: 'b-1',
  facility_type: '消火栓系统',
  name: '消火栓系统',
  status: 'normal',
  location_path: '每层设置',
  extra_attrs: {
    inspection_date: '2026-06-15',
    design_parameters: 'DN150主管',
    inspection_result: '合格',
    quantity_capacity: '120个消火栓',
    water_supply_connection_location: '北侧消防泵房',
  },
  ai_description: '消火栓系统',
};

describe('building-mapper', () => {
  it('mapBuildingProfile 组装 overview + 嵌套数组', () => {
    const p = mapBuildingProfile(DETAIL, [FACILITY]);
    expect(p.id).toBe('b-1');
    expect(p.overview.name).toBe('乐盈广场21号楼');
    expect(p.overview.heightMeters).toBe(258.0);
    expect(p.overview.sceneId).toBe('465718852859613184');
    expect(p.overview.completionRate).toBe(100);
    expect(p.structureDesigns).toHaveLength(1);
    expect(p.structureDesigns[0].fireCompartmentCount).toBe(12);
    expect(p.structureDesigns[0].refugeFloor).toBe('15F, 30F, 45F');
    expect(p.surroundings).toHaveLength(1);
    expect(p.surroundings[0].fireLaneWidth).toBe(6.0);
    expect(p.keyFloors).toHaveLength(1);
    expect(p.keyFloors[0].func).toBe('商业入口');
    expect(p.keyFloors[0].exitCount).toBe(6);
    expect(p.contacts.contactPhone).toBe('13800138001');
  });

  it('mapFireSystem 展开 extra_attrs + 状态归一化', () => {
    const f = mapFireSystem(FACILITY);
    expect(f.name).toBe('消火栓系统');
    expect(f.status).toBe('normal');
    expect(f.statusNormalized).toBe('ok');
    expect(f.inspectionDate).toBe('2026-06-15');
    expect(f.quantityCapacity).toBe('120个消火栓');
    expect(f.waterSupplyConnectionLocation).toBe('北侧消防泵房');
  });

  it('mapFireSystem 容忍缺省 extra_attrs / 空字符串 name 回退 facility_type', () => {
    const f = mapFireSystem({
      id: 'x',
      ref_type: 'key_building',
      ref_id: 'b-1',
      facility_type: '气体灭火',
      name: '',
      status: 'offline',
    });
    expect(f.name).toBe('气体灭火');
    expect(f.statusNormalized).toBe('error');
    expect(f.quantityCapacity).toBe('');
  });

  it('mapBuildingProfile 容忍空嵌套数组', () => {
    const p = mapBuildingProfile({ ...DETAIL, structure_designs: [], surroundings: [], key_floors: [] }, []);
    expect(p.structureDesigns).toEqual([]);
    expect(p.surroundings).toEqual([]);
    expect(p.keyFloors).toEqual([]);
    expect(p.facilities).toEqual([]);
  });

  it('normalizeFacilityStatus 覆盖中英文 / 未知归 empty(非 ok)', () => {
    expect(normalizeFacilityStatus('normal')).toBe('ok');
    expect(normalizeFacilityStatus('正常')).toBe('ok');
    expect(normalizeFacilityStatus('offline')).toBe('error');
    expect(normalizeFacilityStatus('离线')).toBe('error');
    expect(normalizeFacilityStatus('unknown')).toBe('empty');
  });
});
