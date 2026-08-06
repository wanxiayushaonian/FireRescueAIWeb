# 第一批数据注入:水源(614 条)

- 日期:2026-08-06
- 范围:把 `资源/` 目录下两个水源 Excel(586 + 28 = 614 条)注入 znya 的 `water_sources` 表,作为"真实业务数据注入"全流程的**第 1 批验证**
- 数据源:
  - `/home/ljb/program/FireRescueAI/资源/水源明细.xlsx`(586 条)
  - `/home/ljb/program/FireRescueAI/资源/消防水源导出数据.xlsx`(28 条)
- 目标:znya `server` · PostgreSQL `fire_rescue` · 表 `water_sources`
- 关联:
  - 增量架构:`2026-08-05-incremental-integration-architecture.md`
  - 数据注入总决策:① 给 `fire_force_items` 加 `extra_attrs`(第 3 批车辆/装备用)② 补正机构编码对齐(车辆/装备用)③ **先做水源验证**(本 spec)
  - web 端:`/api/business/water-sources/` catch-all 代理(已存在)→ znya `/water-sources/`(已存在 router)

## 背景

迁壳完成后,业务数据接入正按"就绪度"推进。消防站 82 条(含真实坐标)已入 `fire_stations`。`资源/` 目录新到一批真实业务 Excel(人员/车辆/装备/水源/单位,共 ~7200 条)。经判断,**水源就绪度最高**(`water_sources` 已有 `extra_attrs` + 坐标 + 类别字段,且数据完整),选作第 1 批,验证"读 Excel → 清洗 → 映射 → 事务 upsert → web 可查"全流程,为后续批次趟路。

## 目标

1. 614 条水源真实数据落入 `water_sources`,经 web BFF `/api/business/water-sources/` 可查
2. 验证 ETL 全流程可重复、可回滚、幂等
3. 不破坏现有数据(82 站、1 条测试水源、其它表)

## 非目标

- 不改 web 前端 UI(水源地图图层/面板是 follow-up;本批只保证后端数据 + BFF 可查)
- 不动 `fire_force_items` / `extra_attrs` 迁移(第 3 批)
- 不补正机构编码(第 2 批前置,水源用 `district` 挂载不需要)
- 不处理其余 9 个文件(人员/车辆/装备/单位/字典/登高面/大纲)

## 数据源清单(已核实)

| 文件 | 数据行 | 覆盖区县 | water_type | 坐标 |
|---|---|---|---|---|
| 水源明细.xlsx | 586 | 濂溪区 288 / 柴桑区 256 / 浔阳区 42 | **无类别列**(默认填) | 全有 |
| 消防水源导出数据.xlsx | 28 | 彭泽县(矶山工业园) | 有(消火栓 26 / 水池 1 / 天然水体 1) | 全有 |

两文件**地理互补、名称体系不同**(编码 vs 中文),不重叠 → 无需跨文件去重。

## 字段映射

`water_sources` 列 ← 源列(明细 / 导出):

| 目标列 | 水源明细(586) | 水源导出(28) |
|---|---|---|
| `id` | `str(uuid.uuid4())` 生成 | 同 |
| `ref_type` | `"district"` | `"district"` |
| `ref_id` | 区划码(见下) | `"360406"` |
| `water_type` | `"市政消火栓"`(Q1a 默认) | `水源类别` 原值 |
| `name` | `名称`(编码 `JJ-BLHxxx`)strip | `名称` 原值 strip |
| `status` | `"normal"`(列空) | `"normal"`(`资源状态`=正常) |
| `location_path` | `地址` strip | `地址` strip |
| `longitude` | `经度` float | `经度` float |
| `latitude` | `纬度` float | `纬度` float |
| `district_code` | 区划码(见下) | `"360406"` |
| `extra_attrs` | 见下 | 见下 |
| `ai_description` | `None` | `None` |
| `created_by/updated_by` | `None`(nullable) | `None` |
| `created_at/updated_at` | `datetime.now(UTC)` | 同 |

> **status 用英文 `'normal'`**(与现有那条一致,model default 也是 `normal`),**不**用中文"正常"。

### 区名 → 区划码映射(九江下辖区县,源自已删 md 的 124 单位区划代码)

| 区名(源"区域"/"区"列) | district_code / ref_id |
|---|---|
| 濂溪区 | `360404` |
| 柴桑区 | `360411` |
| 浔阳区 | `360410` |
| 彭泽县 | `360406` |

> 未命中映射的行 → 跳过并记入清洗日志(本批数据已确认只有这 4 个区,预期 0 跳过)。

### extra_attrs(jsonb)

- 明细:`{"source_file":"水源明细.xlsx","raw_index":<序号>,"raw_region":"柴桑区","import_batch":"2026-08-06-water"}`
- 导出:`{"source_file":"消防水源导出数据.xlsx","source_no":<水源编号>,"maintainer":"彭泽县消防救援大队","province":"江西省","city":"九江市","import_batch":"2026-08-06-water"}`

`import_batch` 标记便于按批撤销。

## 关键决策(均已与用户确认)

1. **water_type**:明细 586 条无类别 → 统一 `"市政消火栓"`(业务常识 + 导出文件 26/28 亦为消火栓);extra_attrs 留原名供后续校正
2. **坐标系**:先按 WGS84 注入,注入后视觉校验;若系统性偏移则判定 GCJ02 用 `lib/geo-convert.gcj02ToWgs84` 批量转后重注
3. **注入方式**:幂等 ETL 脚本 + 事务 upsert,先 1 条试跑再全量
4. **挂载**:`ref_type="district"` + `ref_id`=区划码(水源是公共市政设施,挂行政区划维度)
5. **status 英文** `normal`(修正中文"正常")

## 去重与幂等

- 唯一约束 `uq_water_sources_ref_name_loc(ref_type, ref_id, name, location_path) NULLS NOT DISTINCT`
- 明细:585 个唯一名称 + 1 个重名(靠 `location_path` 区分,组合仍唯一)
- 导出:28 个名称全唯一
- 幂等:`INSERT ... ON CONFLICT (ref_type, ref_id, name, location_path) DO NOTHING` → 脚本可重复跑不翻倍

## ETL 脚本设计

- 位置:`znya/server/scripts/import_water_sources.py`
- 依赖:`openpyxl`(已装入 znya .venv)+ `sqlalchemy`/`psycopg2`(znya 已有)+ `uuid`/`datetime`
- 读 DB 配置:复用 znya `app.core.config`(DATABASE_URL)
- 参数:
  - `--dry-run`:只解析 + 打印清洗日志 + 预览前 5 条,不写库
  - `--limit N`:只处理前 N 条(试跑用,如 `--limit 1`)
  - `--undo`:硬删除本批(`DELETE WHERE extra_attrs @> '{"import_batch":"2026-08-06-water"}'`),精确回滚不误伤旧数据
- 输出:处理/跳过/冲突/写入计数 + 跳过原因明细

## 数据清洗规则

- 经纬度:`float()`,解析失败或越界(lng 不在 113–119 / lat 不在 28–31)→ 跳过 + 记录
- 名称:strip;空 → 跳过
- 地址:strip;空 → `location_path=None`(唯一约束含此列,`NULLS NOT DISTINCT` 允许多 NULL)
- 区名:命中映射表才收,否则跳过 + 记录

## 坐标系校验(注入后,可逆;不依赖 web UI)

本批不改 web 前端,坐标校验用**抽样核验**:
1. **范围对比**:水源坐标 lng[115.82–116.59]/lat[29.61–29.96] 与 82 站坐标同处九江,数值合理
2. **抽样在线核验**:抽 3–5 个水源经纬度,分别输入天地图在线(WGS84/CGCS2000)与高德在线(GCJ02)搜点,看哪个落在路网旁(消火栓应沿路)、哪个偏移
3. **判定**:天地图落点正确 → WGS84,无需处理;高德落点正确 → GCJ02,用 `lib/geo-convert.ts` 的 `gcj02ToWgs84` 在脚本批量转后 `--undo` + 重注
4. web 前端水源图层是后续 follow-up,不在本批

## 回滚兜底

- `--dry-run` + `--limit 1` 试跑
- 单事务:任何异常全回滚
- `--undo` 按 `import_batch` 精确撤销本批(不误伤 82 站 / 1 条旧测试水)
- 幂等 upsert:重跑不翻倍

## 验证清单

1. `--dry-run`:0 异常、计数 = 614(预期)
2. `--limit 1` 试跑写入 1 条 → 查库确认字段正确
3. 全量:写入 ≈ 614(允许冲突少计)
4. `curl /api/business/water-sources/` → `total` ≈ 615(含旧 1 条)
5. 坐标视觉校验(见上)
6. web typecheck/build 不受影响(本批不动 web 代码,期望无变化)

## 风险

| 风险 | 缓解 |
|---|---|
| 坐标系误判(GCJ02 当 WGS84) | 视觉校验 + geo-convert 转换重注(可逆) |
| 明细 water_type 默认值不准 | extra_attrs 留原名,可批量 UPDATE |
| 重跑翻倍 | ON CONFLICT DO NOTHING 幂等 |
| 误删旧数据 | `--undo` 只按 import_batch 批量标记 |
| znya 在 `feature/fire-station-entity` 分支 | 脚本与表结构在该分支;注入只写数据不改 schema,与分支无关;脚本提交走该分支 |
