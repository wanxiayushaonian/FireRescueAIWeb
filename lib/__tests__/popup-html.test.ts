import { describe, it, expect } from 'vitest';
import {
  popupForStation,
  popupForWater,
  popupIncidentSuffix,
  popupForIncident,
  popupForKeyUnit,
  popupForKeyBuilding,
} from '../gis/popup-html';

describe('popupForStation', () => {
  it('含站名/类型/在位人数/地址/坐标', () => {
    const html = popupForStation({ name: '庐山大道站', type: '救援站', address: '庐山大道 1 号', lng: 115.98, lat: 29.67 }, 42);
    expect(html).toContain('庐山大道站');
    expect(html).toContain('在位 42 人');
    expect(html).toContain('(GCJ02)');
  });
});

describe('popupForWater', () => {
  it('含名称/类型/区划/地址', () => {
    const html = popupForWater({ name: '消火栓A', type: '市政消火栓', district: '濂溪区', address: 'x路', lng: 116, lat: 29.7 });
    expect(html).toContain('消火栓A');
    expect(html).toContain('市政消火栓 · 濂溪区');
  });
});

describe('popupForKeyUnit', () => {
  const unit = {
    id: 'u1', name: '某化工厂', unitType: '化工单位', district: '濂溪区',
    lng: 115.98, lat: 29.67, contactName: '张三', contactPhone: '13800000000',
    status: 'draft', extra: {},
  } as any;
  it('微型站行按 " · " 拼接且跳过缺省字段', () => {
    const html = popupForKeyUnit({
      ...unit,
      extra: { has_micro_station: '有', duty_24h: '是', total_people: 12, has_equipment: '', has_control_room: null },
    });
    expect(html).toContain('微型站 有 · 24h执勤 是 · 总人数 12');
    expect(html).not.toContain('器材');
    expect(html).not.toContain('控制室');
  });
  it('status=completed 含已 3D 建模标记', () => {
    expect(popupForKeyUnit({ ...unit, status: 'completed' })).toContain('★ 已 3D 建模');
    expect(popupForKeyUnit(unit)).not.toContain('★ 已 3D 建模');
  });
  it('负责人缺省回退 -', () => {
    const html = popupForKeyUnit({ ...unit, contactName: undefined, contactPhone: undefined });
    expect(html).toContain('负责人 -');
    expect(html).not.toContain('13800000000');
  });
});

describe('popupForKeyBuilding', () => {
  const building = {
    id: 'b1', name: '1 号厂房', buildingType: '厂房', buildingUsage: '生产车间',
    lng: 115.98, lat: 29.67, status: 'draft',
  } as any;
  it('含类型/用途/所属单位', () => {
    const html = popupForKeyBuilding(building, '某化工厂');
    expect(html).toContain('重点建筑 · 厂房');
    expect(html).toContain('生产车间');
    expect(html).toContain('所属单位: 某化工厂');
  });
  it('status=completed 含已 3D 建模标记;无所属单位时省略该行', () => {
    expect(popupForKeyBuilding({ ...building, status: 'completed' })).toContain('★ 已 3D 建模');
    expect(popupForKeyBuilding(building)).not.toContain('所属单位');
  });
});

describe('popupIncidentSuffix / popupForIncident', () => {
  const inc = { id: 'i1', address: '某化工厂', incidentType: '火灾', level: 3, status: '出动', description: '明火', lng: 116, lat: 29.7, keyUnitId: null } as any;
  it('后缀含类型/等级/状态/描述', () => {
    const s = popupIncidentSuffix(inc);
    expect(s).toContain('火灾 · 3 级 · 出动');
    expect(s).toContain('(明火)');
  });
  it('无描述时不含括号', () => {
    expect(popupIncidentSuffix({ ...inc, description: '' })).not.toContain('(明火)');
  });
  it('警情 popup 含 ⚠ 与地址', () => {
    expect(popupForIncident(inc)).toContain('⚠ 某化工厂');
  });
});
