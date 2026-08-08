import { describe, it, expect } from 'vitest';
import { popupForStation, popupForWater, popupIncidentSuffix, popupForIncident } from '../gis/popup-html';

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
