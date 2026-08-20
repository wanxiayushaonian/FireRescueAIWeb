// 战备状态角标：基于该建筑最近考核成绩（training.ts getBuildingReadiness），
// 无成绩不显示；订阅成绩发布即时刷新。演示数据。
import { useEffect, useState } from 'react';
import { ShieldCheck } from 'lucide-react';
import { getBuildingReadiness, subscribeExamResult } from '@/mock/training';

export default function ReadinessBadge({
  buildingName,
  className = '',
}: {
  buildingName: string;
  className?: string;
}) {
  const [, setTick] = useState(0);
  useEffect(() => subscribeExamResult(() => setTick((t) => t + 1)), []);
  const r = getBuildingReadiness(buildingName);
  if (!r) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-px text-[11px] leading-4 select-none ${className}`}
      style={{ color: r.color, borderColor: `${r.color}66`, backgroundColor: `${r.color}1a` }}
      title={`战备状态按最近考核成绩评定`}
    >
      <ShieldCheck className="h-3 w-3" />
      战备 {r.label}
      <span className="font-num text-text-3">最近考核 {r.score} 分</span>
    </span>
  );
}
