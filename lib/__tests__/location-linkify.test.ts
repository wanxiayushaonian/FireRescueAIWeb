// location-linkify 分词器测试:楼层/设施类型/GIS 实体识别与重叠消解。
import { describe, expect, it } from 'vitest';
import { linkifyText, type TextSegment } from '../location-linkify';

function anchors(text: string, vocab?: Parameters<typeof linkifyText>[1]): TextSegment[] {
  return linkifyText(text, vocab);
}

function kinds(segs: TextSegment[]): Array<string | null> {
  return segs.map((s) => s.anchor?.kind ?? null);
}

describe('linkifyText 楼层识别', () => {
  it.each([
    ['起火层 5F 已被控制', ['5F']],
    ['13F避难层 与 25F避难层', ['13F', '25F']],
    ['B1F 车库积水', ['B1F']],
    ['火势沿 3-4F 餐饮层蔓延', ['3-4F']],
    ['人员已撤至 13 层避难', ['13F']], // 中文层式归一
  ])('%s → %j', (text, specs) => {
    const floors = anchors(text).flatMap((s) => (s.anchor?.kind === 'floor' ? [s.anchor.spec] : []));
    expect(floors).toEqual(specs);
  });

  it.each([
    ['接警编号 JZ-20250612-005', []], // 编号数字不误报
    ['坐标 116.0029, 29.7040', []], // 小数不误报
    ['建筑高度 150米', []],
    ['多方 Metaverse2F 数据?', []], // 紧贴英文字母的编号不误报
  ])('负向/边界:%s → %j', (text, specs) => {
    const floors = anchors(text).flatMap((s) => (s.anchor?.kind === 'floor' ? [s.anchor.spec] : []));
    expect(floors).toEqual(specs);
  });
});

describe('linkifyText 类型与实体', () => {
  const vocab = {
    gisEntities: new Map([
      ['乐盈广场21号楼'.toLowerCase(), { name: '乐盈广场21号楼', lng: 115.95, lat: 29.66 }],
      ['柘林大道消防站'.toLowerCase(), { name: '柘林大道消防站', lng: 115.8, lat: 29.6 }],
    ]),
  };

  it('设施类型命中静态词表(长词优先)', () => {
    const text = '本层室内消火栓 4 个、喷淋嘴 168 个';
    const types = anchors(text).flatMap((s) => (s.anchor?.kind === 'type' ? [s.text] : []));
    expect(types).toEqual(['室内消火栓', '喷淋嘴']);
  });

  it('GIS 实体优先于类型标签的重叠区间', () => {
    // "消防电梯" 是类型词;实体名覆盖更长跨度时实体胜
    const text = '从乐盈广场21号楼消防电梯前室进入';
    const chips = anchors(text, vocab).filter((s) => s.anchor);
    expect(chips[0]?.anchor).toMatchObject({ kind: 'gis', name: '乐盈广场21号楼' });
  });

  it('实体与楼层混合无重叠', () => {
    const text = '乐盈广场21号楼 12F 建筑火灾';
    const kindsList = kinds(anchors(text, vocab));
    expect(kindsList.filter(Boolean)).toEqual(['gis', 'floor']);
  });

  it('分段重构恒等于原文', () => {
    const text = '依托 5F 室内消火栓与周边的柘林大道消防站力量处置';
    const rebuilt = anchors(text, vocab).map((s) => s.text).join('');
    expect(rebuilt).toBe(text);
  });
});

describe('linkifyText 重叠消解', () => {
  it('"室内消火栓"内嵌"消火栓"类短词时取长词(此处仅一个候选)', () => {
    // 词表里没有"消火栓"单独词条,这里验证的是超集词直接命中
    const chips = anchors('先占领室内消火栓阵地').filter((s) => s.anchor);
    expect(chips).toHaveLength(1);
    expect(chips[0]?.anchor).toMatchObject({ kind: 'type', label: '室内消火栓' });
  });

  it('相邻不同类 chip 边界不打架', () => {
    const text = '25F避难层配置手动报警按钮';
    const segs = anchors(text);
    const clicked = segs.filter((s) => s.anchor).map((s) => s.text);
    expect(clicked).toEqual(['25F', '避难层', '手动报警按钮']);
  });

  it('空串安全', () => {
    expect(anchors('')).toEqual([]);
  });
});
