1.cypherQuery

输入scene_id和cypher对场景空间图谱执行自定义Cypher查询。

cypher (string)*

Neo4j Cypher 查询语句。必须带 WHERE 过滤 + LIMIT，只 RETURN 目标节点的少量字段（如  id/name/outInstanceId/楼层名），严禁无过滤全表扫描。空间节点标签 Space、楼层节点标签 Story（可能带前缀，用  ENDS WITH '.Space' 兜底）；节点属性含 id、name、outInstanceId。

scene_id (string)*

场景ID



2.getNodeRelations

输入scene_id和twins_instance_id查询该本体实例在知识图谱中有关联的节点和边。

twins_instance_id (string)

本体实例ID

scene_id (string)

场景ID



3.getNodeRelations

输入scene_id和twins_instance_id查询该本体实例在知识图谱中有关联的节点和边。

twins_instance_id (string)

本体实例ID

scene_id (string)

场景ID



4.getSceneDetail

输入scene_id查询场景详情，包含模型路径、解密密钥等渲染所需信息。

scene_id (string)*

场景ID



5.getSceneInstanceTree

输入scene_id查询该场景内的本体实例树形层级结构。。

scene_id (string)*

场景ID



6.getSchemaMetadata

输入scene_id查询该场景空间图谱的Schema元数据（节点类型、属性、关系描述）。

scene_id (string)*

场景ID

schema_source (string)

Schema来源：system(默认) / openspg



7.getShortestPathWithWaypoints

输入scene_id、source、target（这三个必传）和waypoint_twins_instance_ids（选传，如果有途径点就传入）查询从起点到终点（可以经过途径点）的路线点位xyz的path列表

waypoint_twins_instance_ids (array)

途经点本体实例ID列表（有序），可为空，最多 50 个

target (object)

终点，包含本体实例ID或坐标,示例为：{"x": -0.49,"y": 3,"z": 2.98}或{"twins_instance_id":"435635746899734528"}

source (object)

起点，包含本体实例ID或坐标,示例为：{"x": -0.49,"y": 3,"z": 2.98}或{"twins_instance_id":"435635746899734528"}

scene_id (string)

场景ID



8.getTwinsDefinitionDetail

输入twins_id查询该本体定义的详情，一般用来获取该本体定义的twins_identifier、全部属性标识以及functions（这个本体定义的本体功能列表）。

twins_id (string)*

本体定义ID



9.getTwinsInstanceByAssetCode

输入asset_code查询本体实例详情，用来获取本体实例的twins_instance_id、全部属性标识和属性值以及这个实例属于哪个本体定义。

asset_code (string)*

资产编码



10.getTwinsInstanceDetail

输入twins_instance_id查询本体实例详情，用来获取本体实例的全部属性标识和属性值以及这个实例属于哪个本体定义。

twins_instance_id (string)*

本体实例ID



11.invokeTwinsFunction

输入twins_id、twins_instance_id、function_identifier和input_params调用本体实例的功能（飞向/高亮/隐藏等可视化操作）。可视化操作由在线的场景前端执行，若无前端连接会执行失败。支持同步和异步模式，异步时返回消息ID供后续查询。同步模式直接返回执行状态(SUCCESS/FAIL/NOT_FOUND)；异步模式返回 message_id。

function_identifier (string)*

功能标识（来自 getTwinsDefinitionDetail 的功能定义，如飞向/高亮对应的 identifier）

input_params (array)*

功能入参列表，每项格式为 {key: 参数名, value: 参数值}，无参数时传空数组

twins_id (string)*

本体定义ID（来自 listTwinsInstances 返回的 twins_id）

twins_instance_id (string)*

本体实例ID（来自 listTwinsInstances 返回的 twins_instance_id，不要误用 out_instance_id）



12.listSceneTwinsDefinitions

输入scene_id查询该场景下有哪些本体定义，用来获取该场景内的twins_id和twins_identifier。

scene_id (string)*

场景ID



13.listScenes

无需输入或者输入scene_name进行模糊匹配查询该租户下的场景列表。

 (string)

场景名称（模糊查询）



14.listTwinsInstances

输入scene_id（必传）加上twins_id或者twins_identifier（二选一）去获取到该场景下面该类本体的所有实例，用来获取目标实例的twins_instance_id及所有属性标识和属性值

scene_id (string)*

场景ID（必填，限定在当前场景内查询，避免跨场景返回海量数据）

twins_instance_name (string)

实例名称，模糊匹配。定位空间/对象时必须配合此条件收窄，禁止不带任何过滤条件调用本工具。

twins_instance_ids (array)

批量实例ID列表

twins_instance_id (string)

单个实例ID

twins_identifier (string)

本体标识

twins_id (string)

本体定义ID

out_instance_ids (array)

外部系统实例ID列表

out_instance_id (string)

外部系统实例ID



14.navigateFromExternal

输入scene_id、source、target从外部WGS84经纬度坐标导航到场景内的目标实例或世界坐标。

scene_id (string)*

场景ID

source (object)*

起点 WGS84 经纬度坐标

target (object)*

终点：支持 twins_instance_id（实例ID）或世界坐标 (x, y, z) 两种模式，x/z 优先

cost_model (string)

最短路径边权模型：nav_distance（默认，导航距离）/ euclidean（欧氏直线距离）



15.pageTwinsDefinition

分页查询本体定义列表，用来查看当前租户下有哪些本体定义，输入page_no=1,page_size=1000可以获取到租户下全部的twins_id和twins_identifier。

page_no (integer)*

页码，从1开始

page_size (integer)*

每页条数

twins_name (string)

本体名称，模糊匹配

twins_industry_type (array)

行业类型筛选列表

twins_identifier (string)

本体唯一标识，精确匹配



16.queryFunctionResult

输入message_id查询异步本体功能调用的执行结果。

message_id (string)*

消息ID，来自invokeTwinsFunction的异步响应



17.radiusQuery

输入scene_id、anchor（这两个必传）、twins_identifier（查询指定目标时传入）、radius_m（anchor传入xyz的时候传入）、cross_floor（需要跨楼层查询时传入）查询某个层级的空间中心为圆心或者某个坐标点为圆心周围有哪些目标本体实例或者周围的所有本体实例

anchor (object)*

查询中心，支持 twins_instance_id 或 x/y/z 坐标两种模式，例如  {"twins_instance_id":"460054423520694453"} 或  {"x":"12.137740863889343","y":"3","z":"-1.9185789195278575"}

scene_id (string)*

场景ID

twins_identifier (string)

目标节点类型

top_k (integer)

返回数量上限（按 distance_m 升序取前N个），须为正数；不传时使用服务端默认值

radius_m (number)

查询半径（米），须为正数；不传时使用服务端默认值

cross_floor (boolean)

是否跨楼层查询：false（默认）仅查 anchor 所在楼层，true 查询所有楼层



18.spaceMetrics

输入scene_id、targets和node_type批量查询Space或Story本体实例的几何度量信息（面积、周长、容积、净高、质心坐标）。

node_type (string)*

节点类型：Space 或 Story

scene_id (string)*

场景ID

targets (array)*

目标节点列表，支持节点ID/名称、story:<N>（整层）、all（整楼）



19.spaceStats

输入scene_id、anchor、twins_identifier、range_mode（这四个必传）、radius_m（anchor传入xyz的时候传入）、cross_floor（需要跨楼层时传入），查询某个层级的空间内或者以某个点位为圆心的范围内有多少个某个本体的实例。

anchor (object)*

查询中心，支持 twins_instance_id 或 x/y/z 坐标两种模式，例如  {"twins_instance_id":"460054423520694453"} 或  {"x":"12.137740863889343","y":"3","z":"-1.9185789195278575"}

range_mode (string)*

范围模式：radius（几何半径圆）/ container（结构容器实体内）。容器具体类型由服务端按 anchor.twins_instance_id 对应节点自动推定

scene_id (string)*

场景 ID

twins_identifier (string)*

目标节点类型

radius_m (number)

查询半径（米），radius模式填写

cross_floor (boolean)

是否跨楼层，radius模式填写



20.updateTwinsInstanceProperty

输入twins_instance_id、twins_property_identifier和property_value把该本体实例的对应属性值更新成输入的值。

twins_instance_id (string)*

本体实例ID

twins_property_identifier (string)*

属性标识

twins_instance_property_id (string)

实例属性ID（未传时通过实例ID+属性标识定位）

property_value (string)

属性值
