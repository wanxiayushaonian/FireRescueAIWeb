import { motion } from 'framer-motion';
import { Radar, Building2, Target, BookOpen, Flag, ChevronsLeft, ChevronsRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import SettingsMenu from './SettingsMenu';

export type ModuleKey = 'overview' | 'objects' | 'drill' | 'training' | 'command';

interface NavItem {
  key: ModuleKey;
  label: string;
  icon: LucideIcon;
  wip?: boolean;
}

const ITEMS: NavItem[] = [
  { key: 'overview', label: '态势总览', icon: Radar },
  { key: 'objects', label: '对象总览', icon: Building2 },
  { key: 'drill', label: '演练对抗', icon: Target },
  { key: 'training', label: '熟悉考核', icon: BookOpen },
  { key: 'command', label: '实战指挥', icon: Flag },
];

export default function SideNav({
  active,
  onSelect,
  collapsed,
  onToggleCollapsed,
  onWarmup,
}: {
  active: ModuleKey;
  onSelect: (k: ModuleKey) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  /** 首次 hover 3D 模块按钮时触发场景预热加载(是否启用由调用方判断) */
  onWarmup?: (k: ModuleKey) => void;
}) {
  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? 72 : 200 }}
      whileHover={{ width: 200 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="group relative z-[55] flex w-[72px] shrink-0 flex-col overflow-hidden border-r border-line bg-bg-panel"
    >
      <nav className="mt-2 flex flex-col gap-1 px-2">
        {ITEMS.map((item, i) => {
          const Icon = item.icon;
          const isActive = active === item.key;
          return (
            <motion.button
              key={item.key}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.05 * i, duration: 0.3 }}
              onClick={() => onSelect(item.key)}
              onPointerEnter={() => onWarmup?.(item.key)}
              className={`relative flex h-11 items-center gap-3 rounded-md px-3 text-left transition-colors ${
                isActive ? 'bg-cyan/10 text-cyan' : 'text-text-2 hover:bg-white/5 hover:text-text-1'
              }`}
            >
              {isActive && (
                <motion.span
                  layoutId="nav-indicator"
                  transition={{ duration: 0.3 }}
                  className="absolute left-0 top-1.5 h-8 w-[3px] rounded-full bg-cyan shadow-[0_0_8px_rgba(34,211,238,.7)]"
                />
              )}
              <Icon className={`h-5 w-5 shrink-0 ${isActive ? 'text-cyan' : ''}`} />
              <span
                className={`whitespace-nowrap text-[14px] transition-opacity duration-200 ${
                  collapsed ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
                }`}
              >
                {item.label}
              </span>
              {item.wip && (
                <span
                  className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-amber transition-opacity duration-200 ${
                    collapsed ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
                  }`}
                  title="建设中"
                />
              )}
            </motion.button>
          );
        })}
      </nav>
      <div className="mt-auto flex flex-col gap-1 px-2 pb-3">
        <SettingsMenu collapsed={collapsed} />
        <button
          onClick={onToggleCollapsed}
          className="flex h-10 items-center gap-3 rounded-md px-3 text-text-3 transition hover:bg-white/5 hover:text-text-1"
        >
          {collapsed ? <ChevronsRight className="h-5 w-5 shrink-0" /> : <ChevronsLeft className="h-5 w-5 shrink-0" />}
          <span
            className={`whitespace-nowrap text-[13px] transition-opacity duration-200 ${
              collapsed ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
            }`}
          >
            {collapsed ? '展开导航' : '折叠导航'}
          </span>
        </button>
        <div
          className={`whitespace-nowrap px-3 text-[11px] text-text-3 transition-opacity duration-200 ${
            collapsed ? 'opacity-0 group-hover:opacity-100' : 'opacity-100'
          }`}
        >
          v0.1 演示版
        </div>
      </div>
    </motion.aside>
  );
}
