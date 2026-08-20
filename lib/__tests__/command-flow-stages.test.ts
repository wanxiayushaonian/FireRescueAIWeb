import { describe, it, expect } from 'vitest';
import { STAGE_ORDER, STAGE_VIEW_INTENT, nextStage, stageIndex } from '../command-flow/stages';
import type { ViewSpec } from '../command-flow/types';

describe('STAGE_ORDER', () => {
  it('按接警→出动→到场→控制→熄灭 顺序', () => {
    expect(STAGE_ORDER).toEqual(['接警', '出动', '到场', '控制', '熄灭']);
  });
});

describe('STAGE_VIEW_INTENT', () => {
  it('接警聚焦案点,出动适配多站路线', () => {
    expect(STAGE_VIEW_INTENT['接警']).toBe('focusIncident');
    expect(STAGE_VIEW_INTENT['出动']).toBe('fitRoutes');
  });
  it('到场/控制 = settle(视角不乱动的契约),熄灭 = reset', () => {
    expect(STAGE_VIEW_INTENT['到场']).toBe('settle');
    expect(STAGE_VIEW_INTENT['控制']).toBe('settle');
    expect(STAGE_VIEW_INTENT['熄灭']).toBe('reset');
  });
});

describe('nextStage / stageIndex', () => {
  it('按顺序迁移,熄灭无后继', () => {
    expect(nextStage('接警')).toBe('出动');
    expect(nextStage('出动')).toBe('到场');
    expect(nextStage('到场')).toBe('控制');
    expect(nextStage('控制')).toBe('熄灭');
    expect(nextStage('熄灭')).toBeNull();
    expect(stageIndex('到场')).toBe(2);
  });
});
