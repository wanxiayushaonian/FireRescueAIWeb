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
  it('长度不等返回 false(provided 更短/更长)', () => {
    expect(checkAppKey('ab', 'abc')).toBe(false);
    expect(checkAppKey('abcd', 'abc')).toBe(false);
    expect(checkAppKey('', 'abc')).toBe(false);
  });
});
