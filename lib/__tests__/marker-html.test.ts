import { describe, it, expect } from 'vitest';
import { HIGH_RISK_PATTERN, keyUnitMarkerHtml, incidentMarkerHtml } from '../gis/marker-html';

describe('keyUnitMarkerHtml', () => {
  it('有警情:警情圆环 + 等级,不含风险角标(警情优先互斥)', () => {
    const html = keyUnitMarkerHtml({ unitType: '化工', incidentLevel: 2, highRisk: true });
    expect(html).toContain('unit-incident-ring-base');
    expect(html).toContain('unit-incident-ring');
    expect(html).toContain('data-level="2"');
    expect(html).not.toContain('unit-risk-badge');
  });
  it('无警情且高风险:! 角标', () => {
    const html = keyUnitMarkerHtml({ unitType: '高层建筑', highRisk: true });
    expect(html).toContain('unit-risk-badge');
    expect(html).not.toContain('unit-incident-wrap');
  });
  it('普通单位:裸图标', () => {
    const html = keyUnitMarkerHtml({ unitType: '学校' });
    expect(html).not.toContain('unit-risk-wrap');
    expect(html).not.toContain('unit-incident-wrap');
  });
});

describe('HIGH_RISK_PATTERN', () => {
  it('命中高层/化工/危化/超高层/大空间/地下', () => {
    for (const t of ['高层建筑', '化工园区', '危化品仓库', '超高层', '大空间厂房', '地下商场']) {
      expect(HIGH_RISK_PATTERN.test(t)).toBe(true);
    }
    expect(HIGH_RISK_PATTERN.test('学校')).toBe(false);
  });
});

describe('incidentMarkerHtml', () => {
  it('独立警情 marker:等级数字 + data-level', () => {
    expect(incidentMarkerHtml(4)).toBe('<div class="incident-marker" data-level="4">4</div>');
  });
});
