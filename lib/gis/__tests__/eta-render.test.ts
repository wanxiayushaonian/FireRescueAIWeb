import { describe, it, expect } from 'vitest';
import { etaColor, estimateRadiusKm, formatEta } from '../eta-render';

describe('etaColor', () => {
  it('5min 档:<=300 绿 / 300–600 黄 / >600 红', () => {
    expect(etaColor(120)).toBe('green');
    expect(etaColor(300)).toBe('green');
    expect(etaColor(301)).toBe('yellow');
    expect(etaColor(600)).toBe('yellow');
    expect(etaColor(601)).toBe('red');
  });
  it('targetMin=10 阈值翻倍', () => {
    expect(etaColor(600, 10)).toBe('green');
    expect(etaColor(601, 10)).toBe('yellow');
    expect(etaColor(1201, 10)).toBe('red');
  });
});

describe('estimateRadiusKm', () => {
  it('5min@30km/h=2.5km,10min=5km', () => {
    expect(estimateRadiusKm(5)).toBeCloseTo(2.5);
    expect(estimateRadiusKm(10)).toBeCloseTo(5);
  });
});

describe('formatEta', () => {
  it('秒 / 分秒 / 整分', () => {
    expect(formatEta(45)).toBe('45秒');
    expect(formatEta(125)).toBe('2分5秒');
    expect(formatEta(120)).toBe('2分钟');
  });
});
