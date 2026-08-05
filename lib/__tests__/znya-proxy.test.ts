import { describe, it, expect } from 'vitest';
import { buildProxyUrl, buildProxyHeaders } from '@/lib/znya-proxy';

describe('znya proxy', () => {
  it('buildProxyUrl: path + query 拼到 ZNYA_BASE_URL,保留尾斜杠', () => {
    expect(buildProxyUrl('fire-stations/', 'page=1&size=10')).toBe(
      'http://localhost:8000/fire-stations/?page=1&size=10',
    );
    expect(buildProxyUrl('key-buildings', '')).toBe('http://localhost:8000/key-buildings');
  });

  it('buildProxyHeaders: 注入 Bearer + 保留原始 content-type', () => {
    const incoming = {
      get: (k: string) => (k.toLowerCase() === 'content-type' ? 'application/json' : null),
    } as unknown as Headers;
    const h = buildProxyHeaders('tok123', incoming);
    expect(h.authorization).toBe('Bearer tok123');
    expect(h['content-type']).toBe('application/json');
  });
});
