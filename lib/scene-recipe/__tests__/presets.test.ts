import { describe, it, expect } from 'vitest';
import { presets } from '../presets';

describe('presets', () => {
  it('objectsOverview 结构层不裁剪 + 标注开 + GIS 关 + 完整展示(留周边环境、藏楼内设备)', () => {
    const p = presets.objectsOverview;
    expect(p.structural.visibleStories).toBeNull();
    expect(p.structural.gisVisible).toBe(false);
    expect(p.structural.labels.visible).toBe(true);
    expect(p.structural.detailLevel).toBe('full');
    expect(p.structural.hideDevices).toBe(true);
  });

  it('drillConfront 结构层 GIS 开(到场需要底图)', () => {
    expect(presets.drillConfront.structural.gisVisible).toBe(true);
  });

  it('familiarize 六步都有 focus', () => {
    expect(presets.familiarize).toHaveLength(6);
    for (const step of presets.familiarize) {
      expect(step.observational.focus).toBeDefined();
    }
  });
});
