// lib/drill/__tests__/drill-camera.test.ts
// 演练相机联动纯函数:楼层解析 + 火势蔓延聚焦范围
import { describe, expect, it } from 'vitest';
import { extractFloorSpec, floorSpecFromEvent, spreadFloorSpecs } from '../drill-camera';

describe('extractFloorSpec:自由文本 → 楼层 spec', () => {
  it('标准格式:5F / 5层', () => {
    expect(extractFloorSpec('5F')).toBe('5F');
    expect(extractFloorSpec('5层')).toBe('5F');
    expect(extractFloorSpec('21号楼5层电气起火')).toBe('5F');
  });

  it('地下层:B1 / B1F / 地下1层', () => {
    expect(extractFloorSpec('B1')).toBe('B1F');
    expect(extractFloorSpec('B1F')).toBe('B1F');
    expect(extractFloorSpec('地下1层')).toBe('B1F');
    expect(extractFloorSpec('B1 变配电间')).toBe('B1F');
  });

  it('无法解析 → null', () => {
    expect(extractFloorSpec(undefined)).toBeNull();
    expect(extractFloorSpec('')).toBeNull();
    expect(extractFloorSpec('风向东南')).toBeNull();
  });
});

describe('floorSpecFromEvent:location 优先,description 兜底', () => {
  it('location 命中直接用', () => {
    expect(floorSpecFromEvent({ location: '5F', description: '无关' })).toBe('5F');
  });
  it('location 缺失/不可解析 → description 兜底', () => {
    expect(floorSpecFromEvent({ description: '13层避难人员拥挤' })).toBe('13F');
    expect(floorSpecFromEvent({ location: '着火区域', description: '7层吊顶坍塌' })).toBe('7F');
  });
  it('都不可解析 → null', () => {
    expect(floorSpecFromEvent({ description: '风向突变' })).toBeNull();
    expect(floorSpecFromEvent({})).toBeNull();
  });
});

describe('spreadFloorSpecs:火势等级 → 聚焦范围(蔓延近似)', () => {
  it('1-2 级单层,3 级+1 层,4 级+2 层', () => {
    expect(spreadFloorSpecs('5F', 1)).toEqual(['5F']);
    expect(spreadFloorSpecs('5F', 2)).toEqual(['5F']);
    expect(spreadFloorSpecs('5F', 3)).toEqual(['5F', '6F']);
    expect(spreadFloorSpecs('5F', 4)).toEqual(['5F', '6F', '7F']);
  });
  it('熄灭(0)→ null(调用方恢复全楼)', () => {
    expect(spreadFloorSpecs('5F', 0)).toBeNull();
  });
  it('地下层不扩散', () => {
    expect(spreadFloorSpecs('B1F', 3)).toEqual(['B1F']);
  });
});
