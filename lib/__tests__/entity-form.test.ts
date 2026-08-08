import { describe, it, expect } from 'vitest';
import {
  emptyEntityForm,
  buildWaterPayload,
  buildUnitPayload,
  buildBuildingPayload,
} from '../entity-form';

const base = { ...emptyEntityForm('water'), name: '测试点', lng: 115.99, lat: 29.7 };

describe('buildWaterPayload', () => {
  it('create:带 standalone ref_type + 生成的 ref_id', () => {
    const p = buildWaterPayload({ ...base, districtCode: '360403' }, 'create', () => 'uuid-1');
    expect(p.ref_type).toBe('standalone');
    expect(p.ref_id).toBe('uuid-1');
    expect(p.water_type).toBe('市政消火栓');
    expect(p.district_code).toBe('360403');
  });

  it('edit:不含 ref_type/ref_id', () => {
    const p = buildWaterPayload(base, 'edit');
    expect(p).not.toHaveProperty('ref_type');
    expect(p).not.toHaveProperty('ref_id');
  });

  it('缺名称/坐标/类型报错', () => {
    expect(() => buildWaterPayload({ ...base, name: ' ' }, 'create')).toThrow('名称必填');
    expect(() => buildWaterPayload({ ...base, lng: null }, 'create')).toThrow('坐标未设置');
    expect(() => buildWaterPayload({ ...base, waterType: '' }, 'create')).toThrow('水源类型必填');
  });

  it('空地址/空区划不进 payload', () => {
    const p = buildWaterPayload(base, 'create');
    expect(p).not.toHaveProperty('location_path');
    expect(p).not.toHaveProperty('district_code');
  });
});

describe('buildUnitPayload', () => {
  const u = { ...emptyEntityForm('unit'), name: '人民医院', lng: 115.99, lat: 29.7 };
  it('必填校验 + 可选字段省略', () => {
    const p = buildUnitPayload(u);
    expect(p.unit_type).toBe('重点单位');
    expect(p).not.toHaveProperty('contact_name');
    expect(() => buildUnitPayload({ ...u, name: '' })).toThrow('名称必填');
  });
  it('联系人/电话/地址带上', () => {
    const p = buildUnitPayload({ ...u, contactName: '张三', contactPhone: '138', address: 'xx路' });
    expect(p.contact_name).toBe('张三');
    expect(p.address).toBe('xx路');
  });
});

describe('buildBuildingPayload', () => {
  const b = {
    ...emptyEntityForm('building'),
    name: '1号楼', lng: 115.99, lat: 29.7,
    buildingType: '高层', buildingUsage: '住院部',
    buildingHeight: '60', floorArea: '12000', groundFloors: '20', undergroundFloors: '2',
  };
  it('数值字段解析为 number,层数取整', () => {
    const p = buildBuildingPayload({ ...b, groundFloors: '20.7' });
    expect(p.building_height).toBe(60);
    expect(p.ground_floors).toBe(20);
    expect(p.underground_floors).toBe(2);
  });
  it('缺必填数值报错', () => {
    expect(() => buildBuildingPayload({ ...b, buildingHeight: '' })).toThrow('高度必须是数字');
    expect(() => buildBuildingPayload({ ...b, buildingUsage: '' })).toThrow('建筑用途必填');
    expect(() => buildBuildingPayload({ ...b, groundFloors: '0' })).toThrow('地上层数不能小于 1');
    expect(() => buildBuildingPayload({ ...b, floorArea: '-5' })).toThrow('面积不能小于 0.01');
  });
  it('地下层数允许 0;keyUnitId 空则不传', () => {
    const p = buildBuildingPayload({ ...b, undergroundFloors: '0' });
    expect(p.underground_floors).toBe(0);
    expect(p).not.toHaveProperty('key_unit_id');
  });
});
