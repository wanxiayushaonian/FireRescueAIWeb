'use client';
// 历史会话列表浮层:拉取 agent 平台会话(跨浏览器共享),支持选中恢复/删除/新建。
import { useCallback, useEffect, useState } from 'react';
import { MessageSquare, Trash2, Plus, X, History, Loader2 } from 'lucide-react';
import { fetchRemoteSessions, deleteRemoteSession, enrichSessionMessageCounts, type RemoteSession } from '@/lib/agent-chat-history';
import { AGENT_APP_IDS } from '@/lib/agent-app-ids';
import type { ModuleKey } from '@/mock/agentScripts';

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return '刚刚';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return `${Math.floor(diff / 86_400_000)} 天前`;
}

interface Props {
  module: ModuleKey;
  activeId: string | undefined;
  onSelect: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
}

export default function ChatHistoryPanel({ module, activeId, onSelect, onNew, onClose }: Props) {
  const [sessions, setSessions] = useState<RemoteSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const appId = AGENT_APP_IDS[module];

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    // 平台 message_count 含工具调用消息 → 并发拉详情修正为纯文本消息数
    fetchRemoteSessions(appId)
      .then((list) => enrichSessionMessageCounts(appId, list))
      .then(setSessions)
      .catch(() => setError('历史会话加载失败'))
      .finally(() => setLoading(false));
  }, [appId]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: string) => {
    setDeleting(id);
    try {
      await deleteRemoteSession(appId, id);
      if (id === activeId) onNew();
      setSessions((prev) => prev.filter((s) => s.id !== id));
    } catch {
      setError('删除失败');
    } finally {
      setDeleting(null);
    }
  };

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-bg-panel/98 backdrop-blur-sm">
      {/* 头部 */}
      <div className="relative flex h-12 shrink-0 items-center gap-2 border-b border-line px-3">
        <History className="h-4 w-4 text-cyan" />
        <span className="text-[13px] font-bold text-text-1">历史对话</span>
        {!loading && <span className="text-[11px] text-text-3">{sessions.length} 条</span>}
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-text-3 transition hover:bg-white/10 hover:text-text-1"
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* 列表 */}
      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-text-3">
            <Loader2 className="h-6 w-6 animate-spin opacity-60" />
            <span className="text-[12px]">加载中…</span>
          </div>
        ) : error ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-text-3">
            <span className="text-[12px]">{error}</span>
            <button
              onClick={load}
              className="rounded-md border border-cyan/40 px-3 py-1 text-[12px] text-cyan transition hover:bg-cyan/10"
            >
              重试
            </button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-text-3">
            <MessageSquare className="h-8 w-8 opacity-40" />
            <span className="text-[12px]">暂无历史对话</span>
          </div>
        ) : (
          <div className="space-y-1">
            {sessions.map((s) => (
              <div
                key={s.id}
                onClick={() => onSelect(s.id)}
                className={`group flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 transition ${
                  s.id === activeId
                    ? 'border-cyan/40 bg-cyan/8'
                    : 'border-transparent hover:bg-bg-panel-2/60'
                }`}
              >
                <MessageSquare className="h-3.5 w-3.5 shrink-0 text-text-3" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] text-text-1">{s.title}</div>
                  <div className="text-[10px] text-text-3">
                    {relTime(s.updatedAt)} · {s.messageCount} 条消息
                  </div>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    void remove(s.id);
                  }}
                  disabled={deleting === s.id}
                  className="shrink-0 rounded p-1 text-text-3 opacity-0 transition hover:bg-red/10 hover:text-red group-hover:opacity-100 disabled:opacity-40"
                  title="删除"
                >
                  {deleting === s.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 新建对话 */}
      <div className="shrink-0 border-t border-line p-2">
        <button
          onClick={onNew}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-cyan/40 bg-cyan/10 py-1.5 text-[12px] text-cyan transition hover:bg-cyan/20"
        >
          <Plus className="h-3.5 w-3.5" /> 新建对话
        </button>
      </div>
    </div>
  );
}
