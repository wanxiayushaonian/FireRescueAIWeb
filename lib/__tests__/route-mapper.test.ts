import { describe, it, expect } from 'vitest';
import { mapRoute } from '../route-mapper';

describe('mapRoute', () => {
  it('[lng,lat]→[lat,lng] 翻转 + 字段映射', () => {
    const r = mapRoute({
      distance: 5230,
      duration: 780,
      traffic_lights: 3,
      polyline: [
        [115.97, 29.7],
        [115.98, 29.71],
      ],
    });
    expect(r.distance).toBe(5230);
    expect(r.duration).toBe(780);
    expect(r.trafficLights).toBe(3);
    // [lng,lat] → [lat,lng]
    expect(r.polyline).toEqual([
      [29.7, 115.97],
      [29.71, 115.98],
    ]);
  });

  it('空 polyline → 空数组', () => {
    const r = mapRoute({ distance: 0, duration: 0, traffic_lights: 0, polyline: [] });
    expect(r.polyline).toEqual([]);
  });
});
