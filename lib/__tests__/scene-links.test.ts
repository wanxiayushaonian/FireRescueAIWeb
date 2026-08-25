import { describe, it, expect } from 'vitest';
import { parseSceneLink, buildSceneLink } from '../scene-links';

describe('parseSceneLink', () => {
  it('非 scene:// 返回 null', () => {
    expect(parseSceneLink('https://example.com')).toBeNull();
    expect(parseSceneLink('')).toBeNull();
  });

  it('楼层锚点', () => {
    expect(parseSceneLink('scene://floor/13F')).toEqual({ kind: 'floor', spec: '13F' });
    expect(parseSceneLink('scene://floor/3-4F')).toEqual({ kind: 'floor', spec: '3-4F' });
  });

  it('设备锚点', () => {
    expect(parseSceneLink('scene://device/story_5f_hydrant_3')).toEqual({
      kind: 'device',
      id: 'story_5f_hydrant_3',
    });
  });

  it('类型锚点(可带楼层过滤,URL 解码中文)', () => {
    expect(parseSceneLink('scene://type/%E5%AE%A4%E5%86%85%E6%B6%88%E7%81%AB%E6%A0%93?floor=5F')).toEqual({
      kind: 'type',
      type: '室内消火栓',
      floor: '5F',
    });
    expect(parseSceneLink('scene://type/IndoorFireHydrant')).toEqual({
      kind: 'type',
      type: 'IndoorFireHydrant',
      floor: undefined,
    });
  });

  it('缺值/未知 kind 返回 null', () => {
    expect(parseSceneLink('scene://floor/')).toBeNull();
    expect(parseSceneLink('scene://unknown/13F')).toBeNull();
    expect(parseSceneLink('scene://')).toBeNull();
  });

  it('buildSceneLink 与 parseSceneLink 往返一致', () => {
    const l = { kind: 'type' as const, type: '感烟探测器', floor: '5F' };
    expect(parseSceneLink(buildSceneLink(l))).toEqual(l);
    expect(parseSceneLink(buildSceneLink({ kind: 'floor', spec: '25F' }))).toEqual({ kind: 'floor', spec: '25F' });
  });
});
