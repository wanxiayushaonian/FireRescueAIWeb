// lib/agent-evaluate.ts
// 评估智能体接入层：演练预案评估 / 实战战后评估 统一走平台评估 agent（agent-chat SSE）。
// 评估请求以「消息前缀注入」携带过程数据（不依赖 forwarded_props 透传），要求 agent 只输出
// 结构化 JSON；任何失败（未配置 app_id / 网络 / 超时 / JSON 解析失败）返回 null，调用方降级 mock。
import { EVALUATE_APP_ID } from './agent-app-ids';
import { parseAgentChatSSE, postAgentChat } from './agent-chat-client';

/** 评估维度（0-100 + 评语） */
export interface EvaluationDimension {
  name: string;
  score: number;
  comment: string;
}

/** 改进措施（content=措施内容，target=回流对象） */
export interface EvaluationImprovement {
  content: string;
  target: string;
}

/** 评估 agent 统一输出（两处调用方各自适配自己的 UI 形态） */
export interface EvaluationData {
  score: number;
  conclusion: string;
  opinions: string[];
  dimensions: EvaluationDimension[];
  improvements: EvaluationImprovement[];
}

export interface EvaluateInput {
  /** 评估场景：演练预案评估 / 实战战后评估 */
  kind: 'drill-plan' | 'post-action';
  /** 评估对象描述（标题/建筑/楼层，作为 subject 行） */
  subject: string;
  /** 过程数据摘要（注入消息前 JSON 序列化；调用方负责控制体积） */
  process: Record<string, unknown>;
}

const EVALUATE_TIMEOUT_MS = 60_000;

/**
 * 从 agent 输出文本中提取评估 JSON 对象。兼容 ```json fence、前后杂质文本、
 * 首尾花括号截取；字段缺失/非法则返回 null。
 */
export function parseEvaluateJson(text: string): EvaluationData | null {
  if (!text) return null;
  let body = text.trim();
  // 剥 ```json ... ``` fence（含其他 fence 语言标记）
  const fence = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    body = fence[1].trim();
  } else {
    // 无 fence：从首个 { 到最后一个 } 截取（容忍前后杂质文本）
    const start = body.indexOf('{');
    const end = body.lastIndexOf('}');
    if (start < 0 || end <= start) return null;
    body = body.slice(start, end + 1);
  }
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return null;
  const o = data as Record<string, unknown>;
  const score = Number(o.score);
  if (!Number.isFinite(score) || score < 0 || score > 100) return null;
  const conclusion = typeof o.conclusion === 'string' ? o.conclusion : '';
  const opinions = Array.isArray(o.opinions)
    ? o.opinions.filter((x): x is string => typeof x === 'string').slice(0, 8)
    : [];
  const dimensions = Array.isArray(o.dimensions)
    ? o.dimensions
        .filter((d): d is Record<string, unknown> => typeof d === 'object' && d !== null)
        .map((d) => ({
          name: typeof d.name === 'string' ? d.name : '未命名维度',
          score: Number(d.score) || 0,
          comment: typeof d.comment === 'string' ? d.comment : '',
        }))
        .filter((d) => d.score >= 0 && d.score <= 100)
        .slice(0, 6)
    : [];
  const improvements = Array.isArray(o.improvements)
    ? o.improvements
        .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
        .map((x) => ({
          content: typeof x.content === 'string' ? x.content : '',
          target: typeof x.target === 'string' ? x.target : '',
        }))
        .filter((x) => x.content.length > 0)
        .slice(0, 6)
    : [];
  if (opinions.length === 0 && dimensions.length === 0 && improvements.length === 0 && !conclusion) {
    return null;
  }
  return { score, conclusion, opinions, dimensions, improvements };
}

/** 评估请求消息模板：角色 + 结构化输出要求 + 过程数据（消息前缀注入） */
function buildEvaluatePrompt(input: EvaluateInput): string {
  const role = input.kind === 'drill-plan' ? '预案评估' : '战后战评';
  return `你是消防救援${role}专家。请根据给定的过程数据，完成客观、专业的评估。
只输出一个 JSON 对象，不要输出任何其他文字。JSON 结构：
{
  "score": 0-100 的整数（综合得分）,
  "conclusion": "一句话总评",
  "opinions": ["评估要点 1", "评估要点 2", "评估要点 3"],
  "dimensions": [{"name": "维度名", "score": 0-100, "comment": "评语"}],
  "improvements": [{"content": "改进措施", "target": "回流对象（如 某某预案·力量编成节）"}]
}

评估对象：${input.subject}

过程数据：
${JSON.stringify(input.process)}`;
}

/**
 * 调用平台评估 agent 生成评估。失败（未配置 app_id / 网络 / 超时 / 解析失败）返回 null。
 * 流式 text 事件静默累积，finish 后一次性解析，不渲染中间过程。
 */
export async function evaluateViaAgent(input: EvaluateInput): Promise<EvaluationData | null> {
  if (!EVALUATE_APP_ID) return null;
  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), EVALUATE_TIMEOUT_MS);
    try {
      const stream = await postAgentChat({
        content: buildEvaluatePrompt(input),
        app_id: EVALUATE_APP_ID,
        signal: controller.signal,
      });
      const parts: string[] = [];
      for await (const ev of parseAgentChatSSE(stream)) {
        if (ev.type === 'text' && ev.content) parts.push(ev.content);
        if (ev.type === 'finish') break;
      }
      return parseEvaluateJson(parts.join(''));
    } finally {
      window.clearTimeout(timer);
    }
  } catch {
    return null;
  }
}
