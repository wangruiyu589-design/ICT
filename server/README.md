# 本地灌溉模拟 API

Node.js 22 原生 HTTP 服务，零第三方依赖。所有地块、设备、天气和历史数据都是演示数据；控制操作只修改本地模拟状态，不连接真实阀门、泵站或气象服务。

在项目根目录运行：

```bash
node server/index.mjs
node --test server/index.test.mjs
```

默认地址为 `http://127.0.0.1:8787`。环境变量 `PORT` 可调整端口；`HOST` 可显式改为 `0.0.0.0` 进行同一局域网的手机调试；`DATA_DIR` 可指定模拟数据目录。默认数据保存在 `server/data/state.json`，通过同步写入临时文件再替换完成持久化。请勿同时启动两个服务进程共享一个数据目录。测试创建独立的 `server/work/api-test-*` 目录并自行清理，不会改动演示数据。

## 数据与单位

- 六个地块合计 1260 亩，初始有一个离线地块、一条持续 25 分钟的模拟灌溉。
- 全新数据目录包含最近 30 天示范历史；已有数据目录保留原始记录，不凭空补写过去的示范用水。运行或重启跨日后补齐无灌溉日期的零用水记录。
- `mode` 始终为 `simulation`；API 成功响应直接返回对象，不包裹 `data`。
- `zone.area` 与 `farm.area`：亩；`moisture` / `targetMoisture` / `battery` / `signal`：百分比。
- `zone.flow` / `zone.nominalFlow`：L/min；`zone.pressure`：MPa。空闲、离线流量与压力均为 0。
- `history[].water`、`totalWater`、`sessions[].waterUsed`：m³。计量公式为 `流量(L/min) × 实际运行分钟 / 1000`。
- `weather.temperature`：℃；`weather.wind`：m/s；湿度与降雨概率：%。天气为固定示范值。
- `duration`：整数分钟；`days`：周一 = 1 至周日 = 7。
- ISO 时间戳以 UTC 存储；计划时刻、历史日期按 `Asia/Shanghai`（北京时间）解释，不依赖操作系统时区。
- `sessions[].status`：`active` / `completed` / `stopped`；`accountedAt` 记录最后计量时刻；`planId` 关联计划或为 null；结束后追加 `finishedAt`。
- `plans[].lastRunKey` 为内部持久化去重字段，同一北京时间日期、分钟只触发一次。
- 保留最近 90 天日统计、最近 500 条操作日志；会话记录用于追溯。

## 接口

| 方法 | 路径 | 请求 / 返回 |
| --- | --- | --- |
| GET | `/api/health` | `{ok:true,mode:"simulation",timezone:"Asia/Shanghai",updatedAt}` |
| GET | `/api/state` | 完整状态快照 |
| POST | `/api/zones/:id/start` | `{duration:25}`；离线或已灌溉返回 409 |
| POST | `/api/zones/:id/stop` | 停止此地块；空闲时幂等成功 |
| POST | `/api/stop-all` | 停止全部当前任务，不禁用未来计划 |
| POST | `/api/plans` | 完整计划字段，示例如下 |
| PUT | `/api/plans/:id` | 完整更新计划；保留 id、执行去重记录 |
| PATCH | `/api/plans/:id` | `{enabled:false}` |
| POST | `/api/plans/:id/enabled` | `{enabled:false}`，与 PATCH 等价，供原生微信小程序使用 |
| DELETE | `/api/plans/:id` | 删除计划；已启动任务继续直到完成或手动停止 |
| POST | `/api/alerts/:id/ack` | 标记预警已确认，不会让离线设备恢复在线 |
| PUT | `/api/settings` | 更新设置，可提交部分字段；同步农场名称、位置 |
| GET | `/api/export.csv` | UTF-8 CSV，包含日用水量与平均土壤含水率 |

除健康检查与 CSV 外，所有成功请求均返回完整状态。错误格式为 `{error:"中文说明",code:"错误代码"}`，使用 400、403、404、409、413、500 等状态码。

计划请求示例：

```json
{
  "name": "东区清晨补水",
  "zoneIds": ["zone-1", "zone-2"],
  "startTime": "06:30",
  "duration": 30,
  "days": [1, 2, 3, 4, 5, 6, 7],
  "enabled": true
}
```

设置字段为 `farmName`、`location`、`moistureThreshold`（0–100 整数）、`maxDuration`（1–240 整数分钟）。灌溉与计划时长须不大于 `maxDuration`；降低上限前须先调整超过上限的计划。

服务每次推进模拟或保存设置时检查在线地块墒情。低于阈值即生成 `condition:"low-moisture"` 告警；同一异常持续期间只生成一次，即使已确认也不重复生成。恢复至阈值后记录 `resolvedAt`，后续再次低于阈值时生成新事件。恢复不会自动确认原事件；离线地块的过时墒情不参与低墒情事件的生成或恢复。初始离线告警保持原有行为。

## 调度与恢复

每秒推进活动任务并检查计划。计划只在服务正在运行、命中北京时间的执行分钟及星期时触发；不会补执行服务离线时错过的历史计划。遇到离线地块或正在灌溉的地块会跳过并记录日志，不重复启动。重启后，会按已保存的实际结束时刻补齐模拟用水量、关闭过期任务；跨午夜计量分别归入两天。

模拟的土壤含水率随灌溉缓慢升高，最高到地块目标值；它不是农业水分模型，也不会作为真实设备的控制依据。含水率达到目标不会提前停止计时任务。

允许 `http://localhost[:port]`、`http://127.0.0.1[:port]` 的浏览器开发 CORS 请求，以及没有 Origin 的小程序/本地客户端请求。默认仅监听回环地址。此服务没有鉴权，适合本地模拟开发，不应直接部署为公开生产接口。

## 可测试接口

`createApp({dataDir,now,autoTick,tickIntervalMs})` 返回 HTTP request handler，附带 `getState()`（深拷贝）、`tick()`、`close()`。`createServer(options)` 返回 Node HTTP Server，并通过 `server.app` 暴露 handler。测试可注入毫秒时钟并禁用自动定时器，以确定性验证时间、重启与调度。
