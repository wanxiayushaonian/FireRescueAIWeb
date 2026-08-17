import { describe, expect, it } from 'vitest';
import { parseEvaluateJson } from '@/lib/agent-evaluate';

const VALID = {
  score: 86,
  conclusion: '处置基本得当，增援衔接可优化',
  opinions: ['力量编成满足首调需求', '疏散路线无交叉冲突'],
  dimensions: [{ name: '响应时效', score: 90, comment: '到场及时' }],
  improvements: [{ content: '补充供水备份干线', target: '预案·水源节' }],
};

describe('parseEvaluateJson', () => {
  it('解析标准 JSON 对象', () => {
    expect(parseEvaluateJson(JSON.stringify(VALID))).toEqual(VALID);
  });

  it('剥 ```json fence（含带语言标记变体）', () => {
    expect(parseEvaluateJson('```json\n' + JSON.stringify(VALID) + '\n```')).toEqual(VALID);
    expect(parseEvaluateJson('```\n' + JSON.stringify(VALID) + '\n```')).toEqual(VALID);
  });

  it('容忍前后杂质文本（无 fence 时按首尾花括号截取）', () => {
    const text = '好的，以下是评估结果：\n' + JSON.stringify(VALID) + '\n希望有帮助！';
    expect(parseEvaluateJson(text)).toEqual(VALID);
  });

  it('score 越界/非数字返回 null', () => {
    expect(parseEvaluateJson(JSON.stringify({ ...VALID, score: 120 }))).toBeNull();
    expect(parseEvaluateJson(JSON.stringify({ ...VALID, score: '高分' }))).toBeNull();
  });

  it('完全空内容返回 null', () => {
    expect(parseEvaluateJson('')).toBeNull();
    expect(parseEvaluateJson('agent 没有输出结构化结果，只说了些话')).toBeNull();
    expect(parseEvaluateJson('{ 不是合法 json')).toBeNull();
  });

  it('JSON 数组 / 非对象返回 null', () => {
    expect(parseEvaluateJson('[1,2,3]')).toBeNull();
  });

  it('opinions/dimensions/improvements 过滤非法项并截断', () => {
    const messy = {
      score: 70,
      conclusion: 'ok',
      opinions: ['a', 1, null, 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'],
      dimensions: [
        { name: '维度一', score: 80, comment: '好' },
        { name: '坏维度', score: 999, comment: '超界' },
        '不是对象',
        { name: '维度二', score: -5, comment: '负分' },
      ],
      improvements: [
        { content: '措施一', target: '预案A' },
        { content: '', target: '空内容' },
        { content: '措施二', target: '预案B' },
        { content: '措施三', target: '预案C' },
        { content: '措施四', target: '预案D' },
        { content: '措施五', target: '预案E' },
        { content: '措施六', target: '预案F' },
        { content: '措施七', target: '预案G' },
      ],
    };
    const r = parseEvaluateJson(JSON.stringify(messy));
    expect(r).not.toBeNull();
    expect(r!.opinions).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    expect(r!.dimensions).toEqual([{ name: '维度一', score: 80, comment: '好' }]);
    expect(r!.improvements).toHaveLength(6);
    expect(r!.improvements![0]).toEqual({ content: '措施一', target: '预案A' });
  });

  it('字段全空（无 opinions/dimensions/improvements/conclusion）返回 null', () => {
    expect(parseEvaluateJson(JSON.stringify({ score: 50, conclusion: '', opinions: [], dimensions: [], improvements: [] }))).toBeNull();
  });
});
