import { describe, expect, it } from 'vitest';
import {
  generateRandomScenario,
  generateBuildingScenario,
  buildScenarioBriefing,
  hazardToMaterial,
  MATERIAL_OPTIONS,
} from '../scenario-gen';
import type { DisasterScenario } from '../disaster-state';
import type { RealBuildingProfile } from '@/lib/building-mapper';

const BASE: DisasterScenario = {
  firePoint: { x: 0, y: 0 },
  material: '电气',
  trappedCount: 5,
  windDirection: 90,
  windSpeed: 3,
  buildingStructure: 'concrete',
  initialFireLevel: 1,
};

const fakeProfile = {
  id: 'b21',
  keyFloors: [
    { id: 'k1', floor: '5F', name: '5F 后厨', func: '餐饮厨房', hazardSource: '燃气管道', fireHazard: '高', hazardSourceRaw: '' },
    { id: 'k2', floor: 'B1', name: 'B1 配电室', func: '变配电', hazardSource: '电气设备', fireHazard: '高', hazardSourceRaw: '' },
    { id: 'k3', floor: '16F', name: '16F 避难层', func: '避难', hazardSource: '', fireHazard: '低', hazardSourceRaw: '' },
  ],
} as unknown as RealBuildingProfile;

describe('hazardToMaterial', () => {
  it('功能关键词映射物质', () => {
    expect(hazardToMaterial('餐饮厨房 燃气管道')).toBe('燃气');
    expect(hazardToMaterial('变配电 电气设备')).toBe('电气');
    expect(hazardToMaterial('储油间 柴油')).toBe('油类');
    expect(hazardToMaterial('仓库 危化品')).toBe('危化品');
    expect(hazardToMaterial('普通房间')).toBe('普通固体');
    expect(hazardToMaterial(undefined)).toBe('普通固体');
  });
});

describe('generateRandomScenario', () => {
  it('同 seed 可复现;参数在合理范围内;保留 base 不可变字段', () => {
    const a = generateRandomScenario(BASE, 42);
    const b = generateRandomScenario(BASE, 42);
    expect(a).toEqual(b);
    expect(MATERIAL_OPTIONS).toContain(a.material);
    expect(a.trappedCount).toBeGreaterThanOrEqual(1);
    expect(a.trappedCount).toBeLessThanOrEqual(12);
    expect(a.windDirection).toBeGreaterThanOrEqual(0);
    expect(a.windDirection).toBeLessThan(360);
    expect(a.windSpeed).toBeGreaterThanOrEqual(1);
    expect(a.windSpeed).toBeLessThanOrEqual(8);
    expect(a.initialFireLevel).toBeGreaterThanOrEqual(1);
    expect(a.initialFireLevel).toBeLessThanOrEqual(3);
    expect(a.firePoint).toEqual(BASE.firePoint);
    expect(a.buildingStructure).toBe('concrete');
  });

  it('不同 seed 大概率不同(序列漂移)', () => {
    const a = generateRandomScenario(BASE, 1);
    const b = generateRandomScenario(BASE, 2);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe('generateBuildingScenario', () => {
  it('按档案针对性:着火部位来自 keyFloors,物质由功能推导,带楼层/部位信息', () => {
    const s = generateBuildingScenario(BASE, fakeProfile, 7);
    expect(s).not.toBeNull();
    expect(['5F', 'B1', '16F']).toContain(s!.fireFloor);
    expect(s!.fireLocation).toBeTruthy();
    if (s!.fireFloor === '5F') expect(s!.material).toBe('燃气');
    if (s!.fireFloor === 'B1') expect(s!.material).toBe('电气');
    expect(s!.trappedCount).toBeGreaterThanOrEqual(1);
  });

  it('档案缺失/无重点部位 → null', () => {
    expect(generateBuildingScenario(BASE, null, 1)).toBeNull();
    expect(generateBuildingScenario(BASE, { id: 'x', keyFloors: [] } as unknown as RealBuildingProfile, 1)).toBeNull();
  });
});

describe('buildScenarioBriefing', () => {
  it('组装含楼层/物质/火势/被困/风况的启动提示词', () => {
    const s = { ...BASE, material: '燃气', trappedCount: 8, fireFloor: '5F', initialFireLevel: 2 };
    const b = buildScenarioBriefing(s, s.fireFloor);
    expect(b).toContain('5F');
    expect(b).toContain('燃气');
    expect(b).toContain('2 级');
    expect(b).toContain('8 人');
  });
});
