# 增量第 3 步:执勤力量真实数据接入(web ForceResourcePanel → znya)

- 日期:2026-08-05
- 范围:znya 后端新增 `fire_force_items` 明细模块(人员/车辆/装备)并回填 demo 数据;web 新增数据访问层,ForceResourcePanel 从 mock 切换为真实数据(znya)
- 关联:
  - 架构纲领:`2026-08-05-incremental-integration-architecture.md`
  - 上一步:`2026-08-05-connect-znya-backend.md`(web `/api/business/*` 代理已通)
  - znya 项目:`/home/ljb/program/FireRescueAI/znya_jjxf119/`(server=FastAPI 后端)
  - 原型数据契约:`web/src/mock/types.ts`(Station/ResourceItem)、`web/src/mock/stations.ts`(mock 数据源)

## 背景

原型迁壳后,`ForceResourcePanel`(态势总览:队站/人员/车辆/装备)仍消费 mock(`src/mock/stations.ts`)。增量第 2 步打通了 web → znya 的 `/fire-stations` 链路。本步把 ForceResourcePanel 主数据源切换为真实:

- **队站列表**:`znya /fire-stations`(已有,1 条 → 回填至 14 站 demo)
- **车辆/装备/人员明细**:znya **暂无对应模块** → 本步在 znya 新建 `fire_force_items` 表 + CRUD
- 状态演示下拉 + DemoTag 保留(用户决策:走查 UI 状态用)

## 关键决策(用户确认)

1. **明细载体:新建表 `fire_force_items`**(对齐 `base.py` 注释预留的 "future fire_forces / equipment" 意图,与 `fire_facilities` 的 ref_type+ref_id 挂载模式同构),**不塞 extra_attrs JSONB**
2. **回填 14 站 demo**(对齐现有 mock 量级与坐标,大屏态势丰满)
3. **保留**状态演示下拉与 DemoTag

## znya 端设计

### 1. 模型 `app/models/fire_force_item.py`

```python
class FireForceItem(TimestampedModel):
    __tablename__ = "fire_force_items"
    ref_type   = Column(String(20), nullable=False)   # 'fire_station'
    ref_id     = Column(String(36), nullable=False)   # fire_stations.id
    force_type = Column(String(20), nullable=False)   # '人员'|'车辆'|'装备'
    name       = Column(String(200), nullable=False)  # 名称/编号(水罐车 A-001)
    subtype    = Column(String(100), nullable=False)  # 子类(水罐车/干部/基本防护…)
    status     = Column(String(20), nullable=False, default="在位")  # 在位/出警/维保/正常/告警/离线
    # 索引:ref_type / ref_id / force_type / status / deleted_at
```

> 复用 `TimestampedModel`(id + 审计列);`location_path` 不需要定义(列表接口不传 `location_prefix` 即不访问该列)。

### 2. Schema `app/schemas/fire_force_item.py`

- `FireForceItemCreate`:ref_type / ref_id / force_type / name / subtype / status
- `FireForceItemUpdate`:全字段 Optional
- `FireForceItemResponse`:id + 上述字段 + created_by / updated_by / created_at / updated_at

### 3. API `app/api/fire_force_items.py`

```python
router = create_crud_router(
    model=FireForceItem,
    create_schema=FireForceItemCreate,
    update_schema=FireForceItemUpdate,
    response_schema=FireForceItemResponse,
    prefix="/fire-force-items",
    tags=["fire-force-items"],
    search_fields=("name",),   # 模型无 ai_description 列,禁用默认的该字段搜索
)
```

天然获得:POST / GET-list(按 `ref_type/ref_id/force_type/status` 过滤 + 分页)/ GET-one / PUT / DELETE。`main.py` `include_router(fire_force_items.router)`。

### 4. Alembic migration

新增 `fire_force_items` 表(跟随 versions/ 现有命名 `xxxx_create_fire_force_items_table.py`),`alembic upgrade head` 执行。

### 5. Seed 回填 `scripts/seed_demo_data.py`

沿用 `scripts/seed_dict_items.py` 模式(SessionLocal + ORM,幂等 upsert by name):

- **14 站**:对齐 mock `STATIONS`(name/坐标/地址/电话/类型),`extra_attrs` 填 `commander`(站长)/`personnel_count`(编制)/`vehicle_summary`(车型→数量)/`equipment`(装备简述)
- **明细**:每站车辆(5 子类)、人员(3 子类)、装备(6 子类),量级对齐 mock `RESOURCES`;`ref_type='fire_station'`、`ref_id=对应站 id`
- 幂等:同名站跳过(不删现有"消防站1")

## web 端设计

### 6. 数据访问层 `src/api/force.ts`(新增)

保留 mock 同签名 + `FetchState` 语义('ok'|'loading'|'empty'|'error'):

- `fetchStations(state)`: `GET /api/business/fire-stations?page_size=100` → 映射 Station
  - snake→camel:`station_type→type`、`duty_phone→dutyPhone`、`longitude/latitude→lng/lat`
  - `contact` 取 `extra_attrs.commander`;`personnel` 取 `extra_attrs.personnel_count`;`vehicles` 由 `vehicle_summary` 求和
  - `type` 映射表把常见 station_type 归到 UI 中文枚举,未知透传原字符串
- `fetchResources(state)`: `GET /api/business/fire-force-items?ref_type=fire_station&page_size=100` → 映射 ResourceItem(`force_type→category`、`ref_id→stationId`)
- `fetchForceStats(state)`: 聚合(队站=total、人员/车辆/装备=明细按 force_type 计数);`delta` 真实数据无历史趋势 → 返回 `undefined`(StatCard `{delta && …}` 自动隐藏"较昨日"行,不伪造)
- `buildResourceTree(stations, resources)`: 从真实数据派生(队站按 station_type 分组、人员/车辆/装备按 subtype 分组),替代静态 `RESOURCE_TREE`

### 7. ForceResourcePanel 适配

- import 从 `@/mock/stations` 切到 `@/api/force`
- 详情弹窗:`contact→commander`、`dutyPhone→duty_phone`、`lng/lat` 真实值
- `writeLinkage`:addMarker/flyTo 用真实经纬度
- 保留状态演示下拉 + DemoTag

## 测试与验证

- **znya**:`tests/test_fire_force_items.py` — 跟 `test_fire_stations.py` 模式(`db_session` fixture,SQLite 内存库):model 字段往返、CRUD 契约、`ref_id/force_type/status` 过滤、分页
- **web**:`src/api/__tests__/` — 映射/聚合纯函数 TDD(vitest,沿用 `lib/**/__tests__` include 需注意 → 放 `lib/` 或调 vitest include)

> 注意:vitest include 仅 `lib/**/__tests__/**`,若数据层放 `src/api/`,需扩展 vitest include 或把纯函数(映射/聚合)下沉 `lib/`。**优先把映射/聚合纯函数放 `lib/force-mapper.ts`**(可测),数据层薄壳放 `src/api/force.ts`。

- **三绿**:web typecheck + build + vitest;znya pytest;走查大屏(态势总览显示真实 14 站 + 明细)

## 范围边界

- **不做**:不改 znya `FireStationExtraAttrs`(汇总字段维持现状,seed 填充即可);不动其它业务模块(建筑档案等第 4+ 步);不动平台命令通道
- **保留**:mock 文件 `src/mock/stations.ts`(其它组件/回退用),状态演示下拉
