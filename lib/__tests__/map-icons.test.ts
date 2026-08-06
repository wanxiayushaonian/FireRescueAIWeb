import { describe, it, expect } from 'vitest';
import {
  TYPE_COLORS, WATER_COLORS,
  stationIconSvg, waterIconSvg, shouldShowWater,
} from '../map-icons';

describe('map-icons', () => {
  it('shouldShowWater: zoom>=13 显水源', () => {
    expect(shouldShowWater(12)).toBe(false);
    expect(shouldShowWater(13)).toBe(true);
    expect(shouldShowWater(18)).toBe(true);
  });

  it('stationIconSvg 含对应站类型色', () => {
    const svg = stationIconSvg('特勤消防站');
    expect(svg).toContain(TYPE_COLORS['特勤消防站']); // #f97316
    expect(svg).toContain('<svg');
  });

  it('stationIconSvg 未知类型用默认色', () => {
    const svg = stationIconSvg('未知');
    expect(svg).toContain('#22d3ee');
  });

  it('waterIconSvg 含对应水源类型色', () => {
    expect(waterIconSvg('消防水池')).toContain(WATER_COLORS['消防水池']); // #34d399
    expect(waterIconSvg('天然水源')).toContain(WATER_COLORS['天然水源']); // #22d3ee
    expect(waterIconSvg('市政消火栓')).toContain(WATER_COLORS['市政消火栓']); // #38bdf8
  });

  it('waterIconSvg 未知类型用默认色', () => {
    expect(waterIconSvg('其它')).toContain('#60a5fa');
  });
});
