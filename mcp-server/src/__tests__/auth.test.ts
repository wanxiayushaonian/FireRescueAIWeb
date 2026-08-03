import { describe, it, expect } from 'vitest';
import { checkAppKey } from '../auth.js';

describe('checkAppKey', () => {
  it('匹配返回 true', () => {
    expect(checkAppKey('abc', 'abc')).toBe(true);
  });
  it('不匹配返回 false', () => {
    expect(checkAppKey('wrong', 'abc')).toBe(false);
  });
  it('空值返回 false', () => {
    expect(checkAppKey(null, 'abc')).toBe(false);
  });
});
