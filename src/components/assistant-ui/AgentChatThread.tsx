'use client';
// AgentChatThread:assistant-ui Thread + 自定义 agent-chat SSE 桥接。
// 协议层(lib/agent-chat-client)零改动复用;消息模型直接存 ThreadMessageLike,
// SSE 事件(reasoning/text/tool-call/finish)增量 patch 到最后一条 assistant 消息。
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AssistantRuntimeProvider,
  useExternalStoreRuntime,
  type AppendMessage,
  type AttachmentAdapter,
  type CompleteAttachment,
  type MessageStatus,
  type PendingAttachment,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { Thread } from './thread';
import { postAgentChat, parseAgentChatSSE, stopAgentChat, uploadAgentImage, agentImageUrl } from '@/lib/agent-chat-client';
import { AGENT_APP_IDS } from '@/lib/agent-app-ids';
import { agentToolToSceneAction, toolCallLabel } from '@/lib/agent-scene-tools';
import { addSceneAction } from '@/mock/sceneLog';
import type { ModuleKey } from '@/mock/agentScripts';
import { fetchRemoteSession } from '@/lib/agent-chat-history';

/** 连接状态(上报给标题栏 ConnBadge) */
export type AgentConnState = 'idle' | 'streaming' | 'online' | 'error';

interface AgentChatThreadProps {
  module: ModuleKey;
  /** 显式 app_id(双 tab:业务/全局助手由 Sidebar 算好传入);缺省用本模块业务助手 */
  appId?: string;
  /** 当前会话 id(来自历史列表);变化时恢复对应会话,undefined=新会话 */
  sessionId?: string;
  /** 会话变更上报(新建/恢复时给父组件同步 activeId) */
  onSessionChange?: (s: { id: string; title: string } | null) => void;
  /** 快捷话术 chips 触发发送的句柄 */
  sendRef: React.MutableRefObject<((text: string) => void) | null>;
  /** 连接状态上报 */
  onStateChange?: (state: AgentConnState) => void;
}

const RUNNING: MessageStatus = { type: 'running' };
const COMPLETE: MessageStatus = { type: 'complete', reason: 'stop' };
const INCOMPLETE: MessageStatus = { type: 'incomplete', reason: 'error' };

/** 从 agentImageUrl(path) 还原图片 path。 */
function extractImagePath(url: string): string | null {
  const m = url.match(/[?&]path=([^&]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// 空消息起始:assistant-ui Thread 自带 Welcome 组件展示「您好,有什么可以帮您?」

/** 图片上传 adapter:add 先建 pending,发送时上传拿 path 并转为 complete。 */
function createImageAttachmentAdapter(): AttachmentAdapter {
  return {
    accept: 'image/*',
    async add(state: { file: File }): Promise<PendingAttachment> {
      return {
        id: crypto.randomUUID(),
        type: 'image',
        name: state.file.name,
        contentType: state.file.type,
        file: state.file,
        status: { type: 'requires-action', reason: 'composer-send' },
      };
    },
    async send(attachment: PendingAttachment): Promise<CompleteAttachment> {
      const path = await uploadAgentImage(attachment.file as File);
      return {
        ...attachment,
        status: { type: 'complete' },
        content: [{ type: 'image', image: agentImageUrl(path) }],
      };
    },
    async remove() {
      // 平台侧文件保留,无需删除
    },
  };
}

export function AgentChatThread({ module, appId: appIdProp, sessionId, onSessionChange, sendRef, onStateChange }: AgentChatThreadProps) {
  const [messages, setMessages] = useState<ThreadMessageLike[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const convIdRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const runIdRef = useRef<number>(0); // 并发守卫:只 patch 当前 run 的消息
  const appId = appIdProp ?? AGENT_APP_IDS[module].business;

  // sessionId(平台 conversation_id)变化 → 拉详情恢复消息;undefined → 空新会话
  useEffect(() => {
    let alive = true;
    if (sessionId) {
      fetchRemoteSession(appId, sessionId)
        .then((detail) => {
          if (!alive) return;
          convIdRef.current = detail.conversationId;
          setMessages(detail.messages);
        })
        .catch(() => {
          if (!alive) return;
          convIdRef.current = sessionId; // 详情拉取失败仍可带 id 续聊
          setMessages([]);
        });
    } else {
      convIdRef.current = undefined;
      setMessages([]);
    }
    return () => {
      alive = false;
    };
  }, [sessionId, appId]);

  const attachments = useMemo<AttachmentAdapter>(() => createImageAttachmentAdapter(), []);

  /** patch 最后一条 assistant 消息(仅当 id 匹配当前 run)。 */
  /** patch 最后一条 assistant 消息(仅当 id 匹配当前 run)。
   *  自愈:runtime 经 adapter.setMessages 回写(如 onNew 合入 user 消息)会覆盖掉
   *  预置的 assistant 占位 → 此处发现末位不是 assistant 时自动补一条再应用增量,
   *  否则整轮流式内容会被静默丢弃(现象:发消息后 AI 回复空白)。 */
  const patchAssistant = useCallback((runId: number, updater: (m: ThreadMessageLike) => ThreadMessageLike) => {
    if (runId !== runIdRef.current) return;
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last && last.role === 'assistant') {
        return [...prev.slice(0, -1), updater(last)];
      }
      return [...prev, updater({ role: 'assistant', content: [], status: RUNNING })];
    });
  }, []);

  /** content 统一为对象数组(string 简写 → text part)。 */
  const partsOf = useCallback((c: ThreadMessageLike['content']): Exclude<ThreadMessageLike['content'][number], string>[] => {
    return typeof c === 'string' ? [{ type: 'text', text: c }] : [...c];
  }, []);

  /** 核心:追加 user 消息 → 空 assistant 占位 → SSE 流式 patch。 */
  const runConversation = useCallback(async (content: AppendMessage['content'], images?: string[]) => {
    const text = content.find((c): c is { type: 'text'; text: string } => c.type === 'text')?.text ?? '';
    const runId = ++runIdRef.current;
    setMessages((prev) => [...prev, { role: 'user', content }, {
      role: 'assistant',
      content: [],
      status: RUNNING,
    }]);
    setIsRunning(true);
    onStateChange?.('streaming');

    const sceneId = typeof window !== 'undefined' ? window.__sceneId : undefined;
    const abort = new AbortController();
    abortRef.current = abort;
    try {
      const stream = await postAgentChat({
        content: text,
        app_id: appId,
        forwardedProps: sceneId ? { scene_id: sceneId } : {},
        conversationId: convIdRef.current,
        images: images && images.length > 0 ? images : undefined,
        signal: abort.signal,
      });
      for await (const ev of parseAgentChatSSE(stream)) {
        switch (ev.type) {
          case 'conversation_id':
            convIdRef.current = ev.conversation_id;
            // 平台会话已建立 → 上报父组件同步 activeId(历史列表可定位当前会话)
            onSessionChange?.({ id: ev.conversation_id, title: text.slice(0, 24) || '(图片)' });
            break;          case 'reasoning':
            if (ev.content) {
              patchAssistant(runId, (m) => {
                const content = partsOf(m.content);
                const lastR = content[content.length - 1];
                if (lastR && lastR.type === 'reasoning') {
                  content[content.length - 1] = { type: 'reasoning', text: lastR.text + ev.content };
                } else {
                  content.push({ type: 'reasoning', text: ev.content });
                }
                return { ...m, content };
              });
            }
            break;
          case 'text':
            if (ev.content) {
              patchAssistant(runId, (m) => {
                const content = partsOf(m.content);
                const lastT = content[content.length - 1];
                if (lastT && lastT.type === 'text') {
                  content[content.length - 1] = { type: 'text', text: lastT.text + ev.content };
                } else {
                  content.push({ type: 'text', text: ev.content });
                }
                return { ...m, content };
              });
            }
            break;
          case 'tool-call': {
            // 执行场景动作(有映射的)
            const action = agentToolToSceneAction(ev);
            if (action) addSceneAction({ action: action.action, target: action.target, params: action.params, source: '智能体' });
            const argsText = typeof ev.args === 'string' ? ev.args : JSON.stringify(ev.args ?? {}, null, 1);
            patchAssistant(runId, (m) => ({
              ...m,
              content: [...partsOf(m.content), {
                type: 'tool-call',
                toolCallId: ev.toolCallId || undefined,
                toolName: ev.toolName,
                argsText,
              }],
            }));
            break;
          }
          case 'tool-approval-request': {
            // 平台工具审批请求:当前自研通道不启用审批 UI(平台未触发),占位提示避免静默。
            // 若未来平台启用审批,需在此渲染审批卡并经 tool_feedbacks(APPROVED/REJECTED/EDITED)回传。
            const argsText = typeof ev.args === 'string' ? ev.args : JSON.stringify(ev.args ?? {}, null, 1);
            patchAssistant(runId, (m) => ({
              ...m,
              content: [...partsOf(m.content), {
                type: 'tool-call',
                toolCallId: ev.toolCallId || undefined,
                toolName: ev.toolName,
                argsText,
                isError: false,
                summary: `⚠️ 工具待审批:${ev.toolName}(平台审批未启用,会话可能等待中)`,
              }],
            }));
            break;
          }
          case 'finish':
            patchAssistant(runId, (m) => ({ ...m, status: COMPLETE }));
            onStateChange?.('online');
            break;
          default:
            break;
        }
      }
      onStateChange?.('online');
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        patchAssistant(runId, (m) => ({
          ...m,
          content: [...partsOf(m.content), { type: 'text', text: '智能体服务连接失败,请稍后重试。' }],
          status: INCOMPLETE,
        }));
        onStateChange?.('error');
      }
    } finally {
      if (runId === runIdRef.current) {
        setIsRunning(false);
        abortRef.current = null;
      }
    }
  }, [appId, patchAssistant, onStateChange, onSessionChange]);

  const onNew = useCallback(async (msg: AppendMessage) => {
    // 图片不在 msg.content,而在 msg.attachments(assistant-ui 发送时把附件单独放)
    // 两者都扫:content 的 image part + attachments 里 complete attachment 的 image part
    const images: string[] = [];
    const collectImage = (url: unknown) => {
      if (typeof url === 'string') {
        const p = extractImagePath(url);
        if (p) images.push(p);
      }
    };
    for (const c of msg.content) {
      if (c.type === 'image') collectImage(c.image);
    }
    for (const a of msg.attachments ?? []) {
      for (const c of a.content) {
        if (c.type === 'image') collectImage(c.image);
      }
    }
    await runConversation(msg.content, images);
  }, [runConversation]);

  const onCancel = useCallback(async () => {
    // 1. 本地断流
    abortRef.current?.abort();
    // 2. 通知服务端停止当前 run(STOP 协议,尽力而为;无 conversation_id 时仅本地断流)
    const convId = convIdRef.current;
    if (convId) void stopAgentChat({ appId, conversationId: convId });
  }, [appId]);

  // chips 快捷话术:直接复用同一发送路径
  useEffect(() => {
    sendRef.current = (text: string) => {
      void runConversation([{ type: 'text', text }]);
    };
    return () => {
      sendRef.current = null;
    };
  }, [sendRef, runConversation]);

  const runtime = useExternalStoreRuntime({
    messages,
    isRunning,
    onNew,
    onCancel,
    setMessages: (msgs) => setMessages([...msgs]),
    convertMessage: (m) => m, // 消息即 ThreadMessageLike,恒等转换
    adapters: { attachments },
  });

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <div
        className="h-full"
        style={{
          ['--thread-max-width' as string]: '100%',
          ['--composer-radius' as string]: '12px',
          ['--composer-padding' as string]: '10px',
          ['--composer-bg' as string]: 'color-mix(in oklab, var(--color-bg-panel-2) 60%, var(--color-bg-panel))',
        }}
      >
        <Thread />
      </div>
    </AssistantRuntimeProvider>
  );
}
