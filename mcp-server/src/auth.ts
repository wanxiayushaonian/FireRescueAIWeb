import { timingSafeEqual } from 'node:crypto';

/**
 * 常量时间比较 appKey,避免计时侧信道。
 *
 * 长度不等时仍执行一次等长比较(用 expected 与自身比),不提前返回,
 * 以免通过响应耗时泄漏 appKey 长度信息。
 */
export function checkAppKey(provided: string | null, expected: string): boolean {
  if (!provided || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b); // 消耗相近时间,避免长度侧信道
    return false;
  }
  return timingSafeEqual(a, b);
}
