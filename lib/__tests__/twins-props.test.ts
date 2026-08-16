import { describe, expect, it } from 'vitest';
import { extractTwinProperties, flattenTwinProperties } from '../twins-props';

describe('extractTwinProperties(平台实测形态)', () => {
  const realDetail = {
    twins_instance_id: '478488393632698370',
    twins_instance_name: '室外消火栓3',
    twins_name: '室外消火栓',
    twins_identifier: 'OutdoorFireHydrant',
    twins_type: 'model',
    twins_icon: '/dt-ustudio-service/file/xxx.png',
    category_name: '室外消防设施/消火栓',
    twins_instance_property_list: [
      {
        twins_property_identifier: 'assetCode',
        property_name: '资产编码',
        property_value: 'SSSS-1-3-003',
        property_format_value: 'SSSS-1-3-003',
        property_group: '未分组',
      },
      {
        twins_property_identifier: 'installlocation',
        property_name: '安装位置',
        property_format_value: '1F 东侧',
      },
    ],
  };

  it('属性表优先:property_name 中文标签直出,格式化值优先于原始值', () => {
    const out = extractTwinProperties(realDetail);
    const map = new Map(out.map((p) => [p.key, p.value]));
    expect(map.get('资产编码')).toBe('SSSS-1-3-003');
    expect(map.get('安装位置')).toBe('1F 东侧');
    expect(map.get('twins_name')).toBe('室外消火栓');
    expect(map.get('category_name')).toBe('室外消防设施/消火栓');
  });

  it('摆放属性(position/scale/rotation)过滤;用户业务属性保留', () => {
    const out = extractTwinProperties({
      twins_name: '喷淋嘴',
      twins_instance_property_list: [
        { twins_property_identifier: 'position', property_name: '位置', property_format_value: '1&2&3' },
        { twins_property_identifier: 'scale', property_name: '缩放', property_format_value: '1&1&1' },
        { twins_property_identifier: 'rotation', property_name: '旋转', property_format_value: '0&0&0' },
        { twins_property_identifier: 'specmodel', property_name: '规格型号', property_format_value: 'ZSTX-15' },
        { twins_property_identifier: 'kfactor', property_name: '流量系数', property_format_value: '80' },
        { twins_property_identifier: 'assetCode', property_name: '资产编码', property_value: null },
      ],
    });
    const map = new Map(out.map((p) => [p.key, p.value]));
    expect(map.has('位置')).toBe(false);
    expect(map.has('缩放')).toBe(false);
    expect(map.has('旋转')).toBe(false);
    expect(map.get('规格型号')).toBe('ZSTX-15');
    expect(map.get('流量系数')).toBe('80');
    expect(map.has('资产编码')).toBe(false); // 空值
  });

  it('噪声字段不进(id/icon/identifier/名称重复);空值属性跳过;JSON 串值与布尔串处理', () => {
    const keys = extractTwinProperties(realDetail).map((p) => p.key);
    expect(keys).not.toContain('twins_instance_id');
    expect(keys).not.toContain('twins_instance_name');
    expect(keys).not.toContain('twins_icon');
    expect(keys).not.toContain('twins_type');
    expect(keys).not.toContain('twins_identifier');
    const withExtras = extractTwinProperties({
      twins_name: '门',
      twins_instance_property_list: [
        { property_name: '空', property_value: '' },
        { property_name: '连通室外', property_format_value: 'true' },
        { property_name: '门底面多边形', property_format_value: '{"shape":[1,2]}' },
      ],
    });
    const map = new Map(withExtras.map((p) => [p.key, p.value]));
    expect(map.get('连通室外')).toBe('是');
    expect(map.has('门底面多边形')).toBe(false);
    expect(map.has('空')).toBe(false);
  });

  it('无属性表结构 → 兜底递归扁平化', () => {
    const out = extractTwinProperties({ status: 'normal', online: true });
    expect(out).toEqual(
      expect.arrayContaining([
        { key: 'status', value: 'normal' },
        { key: 'online', value: '是' },
      ]),
    );
    expect(extractTwinProperties(null)).toEqual([]);
  });
});

describe('flattenTwinProperties', () => {
  it('嵌套对象下钻为点路径,标量叶子收集;布尔映射中文', () => {
    const detail = {
      name: '室内消火栓',
      props: { status: 'normal', online: true, metric: { pressure: 0.8 } },
    };
    const out = flattenTwinProperties(detail);
    expect(out).toEqual(
      expect.arrayContaining([
        { key: 'name', value: '室内消火栓' },
        { key: 'props.status', value: 'normal' },
        { key: 'props.online', value: '是' },
        { key: 'props.metric.pressure', value: '0.8' },
      ]),
    );
  });

  it('过滤噪声 id 字段/空值;重复 key 首见保留', () => {
    const out = flattenTwinProperties({
      id: '4784888',
      twins_instance_id: 'tw-1',
      device_id: 'x',
      name: 'A',
      remark: '',
      extra: { name: '重复', note: ' ' },
    });
    const keys = out.map((p) => p.key);
    expect(keys).not.toContain('id');
    expect(keys).not.toContain('twins_instance_id');
    expect(keys).not.toContain('device_id');
    expect(keys).not.toContain('remark');
    expect(keys.filter((k) => k === 'name')).toHaveLength(1);
    expect(out.find((p) => p.key === 'extra.name')?.value).toBe('重复');
  });

  it('超长值截断加省略号;条目数封顶', () => {
    const long = 'x'.repeat(200);
    const many: Record<string, number> = {};
    for (let i = 0; i < 30; i += 1) many[`f${i}`] = i;
    const out = flattenTwinProperties({ long, ...many });
    expect(out).toHaveLength(16);
    expect(out.find((p) => p.key === 'long')?.value.endsWith('…')).toBe(true);
    expect(out.find((p) => p.key === 'long')?.value.length).toBeLessThanOrEqual(61);
  });

  it('标量数组拼顿号串;对象数组下钻;深度超限剪枝;null/undefined 跳过', () => {
    const out = flattenTwinProperties({
      tags: ['消防', '栓'],
      items: [{ label: 'L1' }, { label: 'L2' }],
      deep: { a: { b: { c: { d: { e: '太深' } } } } },
      nothing: null,
      gone: undefined,
    });
    const map = new Map(out.map((p) => [p.key, p.value]));
    expect(map.get('tags')).toBe('消防、栓');
    expect(map.get('items.label')).toBe('L1');
    expect(map.has('deep.a.b.c.d.e')).toBe(false); // 深度 5 > 4
    expect(map.has('nothing')).toBe(false);
    expect(map.has('gone')).toBe(false);
  });

  it('非对象入参安全返回空/顶层标量', () => {
    expect(flattenTwinProperties(null)).toEqual([]);
    expect(flattenTwinProperties(undefined)).toEqual([]);
    expect(flattenTwinProperties('plain')).toEqual([]);
    expect(flattenTwinProperties(42)).toEqual([]);
  });
});
