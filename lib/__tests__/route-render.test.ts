import { describe, it, expect } from 'vitest';
import { ROUTE_COLORS, routeColor, routeSegIndex, routeTipHtml } from '../gis/route-render';

describe('routeColor', () => {
  it('按色板轮换,超出长度取模', () => {
    expect(routeColor(0)).toBe('#22d3ee');
    expect(routeColor(ROUTE_COLORS.length)).toBe('#22d3ee');
    expect(routeColor(3)).toBe('#fbbf24');
  });
});

describe('routeSegIndex', () => {
  it('按 idx 错开锚点,且不超过末点', () => {
    expect(routeSegIndex(100, 0)).toBe(30);   // floor(100*0.3)
    expect(routeSegIndex(100, 1)).toBe(48);   // floor(100*0.48)
    expect(routeSegIndex(10, 9)).toBe(9);     // 夹取到 length-1
  });
});

describe('routeTipHtml', () => {
  it('含站名/距离km/ETA分/红绿灯数,颜色为对应色板色', () => {
    const html = routeTipHtml({ stationName: '庐山大道站', polyline: [], distance: 2500, duration: 480, trafficLights: 3 }, 0);
    expect(html).toContain('庐山大道站');
    expect(html).toContain('2.5km');
    expect(html).toContain('8分');
    expect(html).toContain('3灯');
    expect(html).toContain('#22d3ee');
  });
  it('缺 distance/duration 时显示 ?(MCP 通道数据可能不全)', () => {
    const html = routeTipHtml({ stationName: 'x', polyline: [] }, 1);
    expect(html).toContain('?km');
    expect(html).toContain('?分');
    expect(html).toContain('0灯');
  });
});
