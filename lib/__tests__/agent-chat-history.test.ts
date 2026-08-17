// lib/__tests__/agent-chat-history.test.ts
// 验证 agent 历史会话平台 API 封装:列表解析/详情转换(USER/ASSISTANT/media)/删除。
// vitest node 环境:mock 全局 fetch。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  fetchRemoteSessions, fetchRemoteSession, deleteRemoteSession, platformMessagesToThread,
  fetchTextMessageCount, enrichSessionMessageCounts,
} from '../agent-chat-history';

function mockFetchOnce(body: unknown, ok = true, status = 200) {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok,
    status,
    json: async () => body,
  }));
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchRemoteSessions', () => {
  it('解析平台列表并按 updated_at 倒序', async () => {
    mockFetchOnce({
      conversations: [
        { conversation_id: 'a', updated_at: '2026-08-12T10:00:00Z', first_message: '老会话', message_count: 3 },
        { conversation_id: 'b', updated_at: '2026-08-12T11:00:00Z', first_message: '新会话', message_count: 5 },
      ],
    });
    const list = await fetchRemoteSessions('app1');
    expect(list.map((s) => s.title)).toEqual(['新会话', '老会话']);
    expect(list[0]).toMatchObject({ id: 'b', messageCount: 5 });
    expect(list[0].updatedAt).toBeGreaterThan(list[1].updatedAt);
  });

  it('first_message 缺失回退未命名对话', async () => {
    mockFetchOnce({ conversations: [{ conversation_id: 'a', updated_at: '2026-08-12T10:00:00Z' }] });
    const list = await fetchRemoteSessions('app1');
    expect(list[0].title).toBe('未命名对话');
  });

  it('请求失败抛错', async () => {
    mockFetchOnce({}, false, 500);
    await expect(fetchRemoteSessions('app1')).rejects.toThrow();
  });
});

describe('platformMessagesToThread', () => {
  it('USER + ASSISTANT 文本转换', () => {
    const out = platformMessagesToThread([
      { messageType: 'USER', text: '你好' },
      { messageType: 'ASSISTANT', text: ' 您好！**欢迎**' },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ role: 'user', content: [{ type: 'text', text: '你好' }] });
    expect(out[1]).toMatchObject({
      role: 'assistant',
      content: [{ type: 'text', text: '您好！**欢迎**' }], // trim 后
      status: { type: 'complete', reason: 'stop' },
    });
  });

  it('USER 带 media 图片 → image part', () => {
    const out = platformMessagesToThread([
      { messageType: 'USER', text: '看图', media: [{ url: 'http://x/img.png' }, { path: 'image/abc' }] },
    ]);
    expect(out[0].content).toEqual([
      { type: 'text', text: '看图' },
      { type: 'image', image: 'http://x/img.png' },
      { type: 'image', image: 'image/abc' },
    ]);
  });

  it('空文本消息跳过', () => {
    const out = platformMessagesToThread([
      { messageType: 'USER', text: '   ' },
      { messageType: 'ASSISTANT', text: '' },
    ]);
    expect(out).toHaveLength(0);
  });

  it('未知 messageType 按 assistant 处理', () => {
    const out = platformMessagesToThread([{ messageType: 'SYSTEM', text: '系统消息' }]);
    expect(out[0].role).toBe('assistant');
  });
});

describe('fetchRemoteSession', () => {
  it('拉详情并转换', async () => {
    mockFetchOnce({
      conversation_id: 'cid1',
      messages: [
        { messageType: 'USER', text: '问' },
        { messageType: 'ASSISTANT', text: '答' },
      ],
    });
    const detail = await fetchRemoteSession('app1', 'cid1');
    expect(detail.conversationId).toBe('cid1');
    expect(detail.messages).toHaveLength(2);
  });
});

describe('deleteRemoteSession', () => {
  it('调 DELETE 接口', async () => {
    const fn = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    vi.stubGlobal('fetch', fn);
    await deleteRemoteSession('app1', 'cid1');
    const [url, init] = fn.mock.calls[0];
    expect(String(url)).toContain('/conversations/cid1');
    expect(init.method).toBe('DELETE');
  });
});

describe('fetchTextMessageCount', () => {
  it('拉详情统计文本消息数（平台 message_count 含工具消息，此处只算 USER/ASSISTANT 文本）', async () => {
    // 平台列表给 message_count=5，但详情只有 3 条文本消息（另 2 条是工具过程）
    mockFetchOnce({
      conversation_id: 'cid1',
      messages: [
        { messageType: 'USER', text: '九江有哪些消防站' },
        { messageType: 'ASSISTANT', text: '九江有 X 个消防站：…' },
        { messageType: 'USER', text: '最近的呢？' },
      ],
    });
    await expect(fetchTextMessageCount('app1', 'cid1')).resolves.toBe(3);
  });

  it('详情拉取失败返回 null（调用方保留平台原值）', async () => {
    mockFetchOnce({}, false, 500);
    await expect(fetchTextMessageCount('app1', 'cid1')).resolves.toBeNull();
  });
});

describe('enrichSessionMessageCounts', () => {
  it('并发重算：有详情会话修正消息数，详情失败保留平台原值', async () => {
    const sessions = [
      { id: 'a', title: '会话A', updatedAt: 1, messageCount: 5 },
      { id: 'b', title: '会话B', updatedAt: 2, messageCount: 8 },
    ];
    const fn = vi.fn((url: string) => {
      if (String(url).includes('/conversations/a')) {
        return Promise.resolve({
          ok: true, status: 200,
          json: async () => ({
            conversation_id: 'a',
            messages: [
              { messageType: 'USER', text: '问1' },
              { messageType: 'ASSISTANT', text: '答1' },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: false, status: 500, json: async () => ({}) });
    });
    vi.stubGlobal('fetch', fn);
    const enriched = await enrichSessionMessageCounts('app1', sessions);
    expect(enriched[0].messageCount).toBe(2);
    expect(enriched[1].messageCount).toBe(8);
  });
});
