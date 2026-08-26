// 位置指代链接化渲染:把智能体文本/React 行内节点里的楼层、设施类型、GIS 地名
// 转成可点击 chip(scene:// → 3D 联动,gis:// 地图飞行)。
// 分词逻辑在 lib/location-linkify.ts(纯函数)。三个入口:
//   LocationVocabProvider —— 根部挂一次(地名簿异步就绪后刷新词汇表)
//   RichLocationText —— 纯字符串入口(对抗决策卡/复盘证据链等裸文本位)
//   RichInline —— React 行内子树转换(markdown 组件 p/li/td/strong 等覆盖用)
"use client";

import {
  createContext, useContext, useEffect, useMemo, useState,
  cloneElement, isValidElement, type ReactNode,
} from 'react';
import { SceneLink } from '@/components/assistant-ui/scene-link';
import { GisLink } from '@/components/assistant-ui/gis-link';
import { buildSceneLink } from '@/lib/scene-links';
import { linkifyText, type LinkifyVocab } from '@/lib/location-linkify';
import { findGisEntity, gazetteerReady, listGisEntityNames, primeGazetteer } from '@/lib/gazetteer';

const VocabContext = createContext<LinkifyVocab>({});

/** 根部挂载一次:聚合地名簿为 gis 词汇表;数据到达后重算。 */
export function LocationVocabProvider({ children }: { children?: ReactNode }) {
  const [readyTick, setReadyTick] = useState(0);
  useEffect(() => {
    primeGazetteer();
    let alive = true;
    void gazetteerReady()
      .then(() => { if (alive) setReadyTick((v) => v + 1); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  const vocab = useMemo<LinkifyVocab>(() => {
    const m = new Map<string, { name: string; lng: number; lat: number }>();
    for (const name of listGisEntityNames()) {
      const e = findGisEntity(name);
      if (e) m.set(name.toLowerCase().replace(/[\s·・()（）]/g, ''), { name: e.name, lng: e.lng, lat: e.lat });
    }
    return { gisEntities: m };
  }, [readyTick]);
  return <VocabContext.Provider value={vocab}>{children}</VocabContext.Provider>;
}

function SegmentChip({ text, anchor }: { text: string; anchor: NonNullable<ReturnType<typeof linkifyText>[number]['anchor']> }) {
  if (anchor.kind === 'gis') return <GisLink name={text} lng={anchor.lng} lat={anchor.lat} />;
  const href = anchor.kind === 'floor'
    ? buildSceneLink({ kind: 'floor', spec: anchor.spec })
    : buildSceneLink({ kind: 'type', type: anchor.label });
  return <SceneLink href={href}>{text}</SceneLink>;
}

function renderSegments(text: string, vocab: LinkifyVocab): ReactNode {
  if (!text) return null;
  const segments = linkifyText(text, vocab);
  return segments.map((seg, i) =>
    seg.anchor && seg.text.trim().length > 0
      ? <SegmentChip key={`c${i}`} text={seg.text} anchor={seg.anchor} />
      : <span key={`s${i}`}>{seg.text}</span>,
  );
}

/** 纯字符串渲染入口。 */
export function RichLocationText({ text }: { text: string }) {
  const vocab = useContext(VocabContext);
  return <>{renderSegments(text, vocab)}</>;
}

// 不再深入转化的元素:外链保持原语义,代码块不链接化,按钮自成一体。
const SKIP_INLINE_TAGS = new Set(['a', 'code', 'pre', 'button']);

/**
 * 递归转换行内子树中的字符串叶子。已渲染的 ReactElement 克隆保样式;
 * 跳过 a/code/pre/button 与既有 chip 组件(防循环、防语义破坏)。
 */
export function RichInline({ children }: { children?: ReactNode }) {
  const vocab = useContext(VocabContext);
  const transform = (node: ReactNode, depth: number): ReactNode => {
    if (typeof node === 'string') return renderSegments(node, vocab);
    if (depth > 8 || node == null || typeof node !== 'object') return node;
    if (Array.isArray(node)) return node.map((c, i) => <FragmentLike key={i} inner={transform(c, depth + 1)} />);
    if (!isValidElement(node)) return node;
    const el = node;
    const tag = typeof el.type === 'string' ? el.type : '';
    if (SKIP_INLINE_TAGS.has(tag)) return el;
    if (el.type === SceneLink || el.type === GisLink || el.type === RichInline || el.type === SegmentChip) return el;
    const inner = (el.props as { children?: ReactNode }).children;
    if (inner == null) return el;
    return cloneElement(el, {}, transform(inner, depth + 1));
  };
  return <>{transform(children, 0)}</>;
}

/** 数组元素占位(保留 key 语义,不引入额外 DOM)。 */
function FragmentLike({ inner }: { inner: ReactNode }) {
  return <>{inner}</>;
}
