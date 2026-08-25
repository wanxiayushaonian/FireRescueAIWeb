import { describe, expect, it } from 'vitest';
import { describeUStudioError, UStudioRequestError } from '../ustudio';

describe('ustudio 错误信息脱敏', () => {
  it('只暴露 appKey 是否配置，不携带原始密钥字段', () => {
    const error = new UStudioRequestError('boom', {
      endpoint: '/api/test',
      upstreamUrl: 'https://example.test/api/test',
      upstreamMethod: 'POST',
      upstreamParams: {},
      xAppKeyConfigured: true,
    });

    const described = describeUStudioError(error);
    expect(described).toMatchObject({ xAppKeyConfigured: true });
    expect(described).not.toHaveProperty('xAppKey');
    expect(JSON.stringify(described)).not.toContain('secret');
  });
});
