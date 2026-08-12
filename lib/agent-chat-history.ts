// lib/agent-chat-history.ts
// agent 历史会话:agent 平台 conversations API(跨浏览器共享)。
// 列表/详情/删除都走 BFF(/uagent-service/... 透传 + X-App-Key),详情含完整消息文本可完整恢复。
// 注意:平台只返回 USER/ASSISTANT 文本消息(不含 reasoning/tool-call 过程),历史回看以文本为主。
import type { ThreadMessageLike } from '@assistant-ui/react';
import { X_APP_KEY } from '@/lib/app-key';

/** 会话列表项(平台 API 映射)。 */
export interface RemoteSession {
  id: string; // conversation_id
  title: string; // first_message
  updatedAt: number; // updated_at(ms)
  messageCount: number;
}

/** 平台会话详情 + 转换后的 ThreadMessageLike 消息。 */
export interface RemoteSessionDetail {
  conversationId: string;
  messages: ThreadMessageLike[];
}

// ===== 平台 API 原始结构 =====

interface PlatformConversation {
  conversation_id: string;
  updated_at: string; // ISO
  first_message?: string;
  message_count?: number;
}

interface PlatformMessage {
  messageType: 'USER' | 'ASSISTANT' | string;
  text?: string;
  media?: unknown[];
}

interface PlatformDetail {
  conversation_id?: string;
  messages?: PlatformMessage[];
}

function apiUrl(appId: string, conversationId?: string): string {
  const base = `/uagent-service/api/agent/v1/apps/${appId}/conversations`;
  return conversationId ? `${base}/${conversationId}` : base;
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { 'X-App-Key': X_APP_KEY, ...(init?.headers ?? {}) },
  });
}

/** 会话列表(按 updated_at 倒序)。 */
export async function fetchRemoteSessions(appId: string): Promise<RemoteSession[]> {
  const res = await apiFetch(apiUrl(appId));
  if (!res.ok) throw new Error(`会话列表请求失败 ${res.status}`);
  const data = (await res.json()) as { conversations?: PlatformConversation[] };
  return (data.conversations ?? [])
    .map((c) => ({
      id: c.conversation_id,
      title: c.first_message || '未命名对话',
      updatedAt: new Date(c.updated_at).getTime(),
      messageCount: c.message_count ?? 0,
    }))
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

/** 单个 media 项 → image part 的 URL(未知结构时原样转字符串)。 */
function mediaToImageUrl(media: unknown): string | null {
  if (typeof media === 'string') return media;
  if (media && typeof media === 'object') {
    const m = media as Record<string, unknown>;
    const url = m.url ?? m.path ?? m.image;
    if (typeof url === 'string') return url;
  }
  return null;
}

/** 平台消息 → ThreadMessageLike(USER 带 media 图片,ASSISTANT 纯文本 + complete)。 */
export function platformMessagesToThread(msgs: PlatformMessage[]): ThreadMessageLike[] {
  const out: ThreadMessageLike[] = [];
  for (const m of msgs) {
    const text = (m.text ?? '').trim();
    const mediaUrls = (m.media ?? []).map(mediaToImageUrl).filter((u): u is string => u !== null);
    if (m.messageType === 'USER') {
      const content: Exclude<ThreadMessageLike['content'][number], string>[] = [];
      if (text) content.push({ type: 'text', text });
      for (const url of mediaUrls) content.push({ type: 'image', image: url });
      if (content.length === 0) continue;
      out.push({ role: 'user', content });
    } else {
      // ASSISTANT / 其他一律按 assistant 文本
      if (!text) continue;
      out.push({ role: 'assistant', content: [{ type: 'text', text }], status: { type: 'complete', reason: 'stop' } });
    }
  }
  return out;
}

/** 会话详情:含完整消息(转换后)。 */
export async function fetchRemoteSession(appId: string, conversationId: string): Promise<RemoteSessionDetail> {
  const res = await apiFetch(apiUrl(appId, conversationId));
  if (!res.ok) throw new Error(`会话详情请求失败 ${res.status}`);
  const data = (await res.json()) as PlatformDetail;
  const cid = data.conversation_id ?? conversationId;
  return { conversationId: cid, messages: platformMessagesToThread(data.messages ?? []) };
}

/** 删除会话。 */
export async function deleteRemoteSession(appId: string, conversationId: string): Promise<void> {
  const res = await apiFetch(apiUrl(appId, conversationId), { method: 'DELETE' });
  if (!res.ok) throw new Error(`删除会话失败 ${res.status}`);
}
