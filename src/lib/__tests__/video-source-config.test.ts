import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  VIDEO_SLOTS,
  getVideoSource,
  getVideoSources,
  saveVideoSources,
  clearVideoSource,
  subscribeVideoSources,
  isLocalFileSource,
} from '../video-source-config';

// node 测试环境无 localStorage → 走模块内内存降级路径;localStorage 路径为纯 window API 透传,
// 由类型与守卫保证,不在此重复(mock window 反而引入跨用例状态泄漏风险)。
beforeEach(() => {
  // 清空内存态:逐槽 clear(不依赖未导出的内部 Map)
  for (const slot of VIDEO_SLOTS) clearVideoSource(slot.id);
});

describe('video-source-config', () => {
  it('默认全部为空配置', () => {
    for (const slot of VIDEO_SLOTS) {
      expect(getVideoSource(slot.id)).toBe('');
    }
    expect(Object.keys(getVideoSources()).length).toBe(VIDEO_SLOTS.length);
  });

  it('save 写入并可读回,值两端空白被裁剪', () => {
    saveVideoSources({ 'plan-forces': ' /videos/forces.mp4 ' });
    expect(getVideoSource('plan-forces')).toBe('/videos/forces.mp4');
    expect(getVideoSource('plan-tactics')).toBe('');
  });

  it('save 为局部合并:未提供的槽位保持原值', () => {
    saveVideoSources({ 'plan-forces': '/a.mp4', 'command-live': '/live.mp4' });
    saveVideoSources({ 'plan-tactics': '/b.mp4' });
    expect(getVideoSource('plan-forces')).toBe('/a.mp4');
    expect(getVideoSource('plan-tactics')).toBe('/b.mp4');
    expect(getVideoSource('command-live')).toBe('/live.mp4');
  });

  it('clear 清空单个槽位,不影响其他槽位', () => {
    saveVideoSources({ 'plan-forces': '/a.mp4', 'plan-routes': '/r.mp4' });
    clearVideoSource('plan-forces');
    expect(getVideoSource('plan-forces')).toBe('');
    expect(getVideoSource('plan-routes')).toBe('/r.mp4');
  });

  it('订阅者收到保存通知,取消订阅后不再收到', () => {
    const cb = vi.fn();
    const unsub = subscribeVideoSources(cb);
    saveVideoSources({ 'plan-forces': '/a.mp4' });
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]['plan-forces']).toBe('/a.mp4');
    unsub();
    saveVideoSources({ 'plan-forces': '/b.mp4' });
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('未知槽位键被忽略(存储损坏数据不外溢)', () => {
    saveVideoSources({ 'plan-forces': '/a.mp4' });
    const sources = getVideoSources();
    expect(Object.keys(sources).sort()).toEqual([...VIDEO_SLOTS.map((s) => s.id)].sort());
  });

  it('isLocalFileSource 识别本地文件方案值', () => {
    expect(isLocalFileSource('localfile:demo.mp4')).toBe(true);
    expect(isLocalFileSource('/videos/demo.mp4')).toBe(false);
    expect(isLocalFileSource('https://cdn.example.com/demo.mp4')).toBe(false);
    expect(isLocalFileSource('')).toBe(false);
  });
});
