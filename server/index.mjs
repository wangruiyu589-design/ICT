import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ZONE = 'Asia/Shanghai';
const localFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
const iso = (time) => new Date(time).toISOString();
const round = (value) => Math.round(value * 1e6) / 1e6;
const uid = (prefix) => `${prefix}-${randomUUID()}`;

function localTime(time) {
  const parts = Object.fromEntries(localFormatter.formatToParts(time).map(({ type, value }) => [type, value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const day = new Date(`${date}T12:00:00Z`).getUTCDay() || 7;
  return { date, day, minute: `${parts.hour}:${parts.minute}` };
}

function seedState(time) {
  const zoneRows = [
    ['zone-1', '东区一号田', '冬小麦', 240, 42, 55, 360],
    ['zone-2', '东区二号田', '冬小麦', 180, 31, 55, 300],
    ['zone-3', '中区试验田', '玉米', 210, 48, 60, 420],
    ['zone-4', '西区果园', '苹果', 150, 38, 50, 240],
    ['zone-5', '北区示范田', '冬小麦', 280, 46, 55, 480],
    ['zone-6', '南区温室', '番茄', 200, 29, 65, 320],
  ];
  const zones = zoneRows.map(([id, name, crop, area, moisture, targetMoisture, nominalFlow], i) => ({
    id, name, crop, area, moisture, targetMoisture, nominalFlow,
    status: i === 5 ? 'offline' : i === 4 ? 'watering' : 'idle',
    flow: i === 4 ? nominalFlow : 0, pressure: i === 4 ? 0.32 : 0,
    battery: [96, 89, 94, 82, 91, 18][i],
    lastSeen: iso(time - (i === 5 ? 3 * 3600_000 : 0)), deviceId: `device-${i + 1}`,
  }));
  const water = [21.4, 25.8, 29.2, 24.1, 32.7, 27.3, 22.6, 30.4, 26.8, 23.5, 29.7, 33.1, 24.9, 28.5, 20.8, 31.2, 27.6, 25.4, 30.9, 26.3, 22.1, 29.4, 32.5, 23.6, 31.4, 27.8, 34.2, 22.9, 28.6, 0];
  const history = water.map((amount, i) => ({ date: localTime(time - (water.length - 1 - i) * 86400_000).date, water: amount, moisture: [39, 42, 40, 45, 44, 46, 44][i % 7] }));
  return {
    farm: { name: '澜枢智慧农场', location: '河北省 · 石家庄市 · 栾城区', area: 1260 },
    zones,
    devices: zones.map((zone) => ({ id: zone.deviceId, name: `${zone.name}控制器`, type: '一体化灌溉控制器', zoneId: zone.id, status: zone.status === 'offline' ? 'offline' : 'online', battery: zone.battery, signal: zone.status === 'offline' ? 0 : 88, lastSeen: zone.lastSeen })),
    plans: [
      { id: 'plan-1', name: '东区清晨补水', zoneIds: ['zone-1', 'zone-2'], startTime: '06:30', duration: 30, days: [1, 2, 3, 4, 5, 6, 7], enabled: true, lastRun: null },
      { id: 'plan-2', name: '果园隔日滴灌', zoneIds: ['zone-4'], startTime: '17:00', duration: 25, days: [1, 3, 5, 7], enabled: true, lastRun: null },
      { id: 'plan-3', name: '试验田精细灌溉', zoneIds: ['zone-3'], startTime: '08:00', duration: 20, days: [2, 4, 6], enabled: false, lastRun: null },
    ],
    alerts: [
      { id: 'alert-1', title: '南区温室设备离线', detail: '模拟控制器已 3 小时未上报，请检查供电与通信。', level: 'critical', zoneId: 'zone-6', createdAt: iso(time - 3 * 3600_000), acknowledged: false },
      { id: 'alert-2', title: '东区二号田土壤偏干', detail: '土壤含水率 31%，低于预警阈值 35%，建议安排补水。', level: 'warning', condition: 'low-moisture', zoneId: 'zone-2', createdAt: iso(time - 35 * 60000), acknowledged: false },
      { id: 'alert-3', title: '本地模拟模式已启动', detail: '页面数据与控制操作均为本地模拟，不连接真实设备。', level: 'info', zoneId: null, createdAt: iso(time), acknowledged: false },
    ],
    logs: [{ id: uid('log'), message: '北区示范田启动模拟灌溉，持续 25 分钟', type: 'irrigation', createdAt: iso(time) }],
    history,
    sessions: [{ id: uid('session'), zoneId: 'zone-5', startedAt: iso(time), endsAt: iso(time + 25 * 60000), duration: 25, status: 'active', waterUsed: 0, accountedAt: iso(time), planId: null }],
    settings: { farmName: '澜枢智慧农场', location: '河北省 · 石家庄市 · 栾城区', moistureThreshold: 35, maxDuration: 120 },
    weather: { temperature: 24, humidity: 62, wind: 2.4, rainProbability: 15, description: '晴间多云' },
    totalWater: round(water.reduce((sum, value) => sum + value, 0)),
    updatedAt: iso(time), mode: 'simulation',
  };
}

class ApiError extends Error {
  constructor(status, message, code = 'INVALID_REQUEST') { super(message); this.status = status; this.code = code; }
}
const assert = (condition, message, status = 400, code) => { if (!condition) throw new ApiError(status, message, code); };
const integer = (value, min, max, label) => assert(Number.isInteger(value) && value >= min && value <= max, `${label}须为 ${min}–${max} 的整数`);
const text = (value, max, label) => { assert(typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max, `${label}不能为空，且不能超过 ${max} 字`); return value.trim(); };

/** Create an isolated, synchronous JSON-backed HTTP handler. All controls are simulation only. */
export function createApp({ dataDir = path.join(__dirname, 'data'), now = Date.now, autoTick = true, tickIntervalMs = 1000 } = {}) {
  fs.mkdirSync(dataDir, { recursive: true });
  const stateFile = path.join(dataDir, 'state.json');
  let state;
  if (fs.existsSync(stateFile)) {
    state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    assert(state.mode === 'simulation' && Array.isArray(state.zones) && Array.isArray(state.sessions) && Array.isArray(state.plans) && state.settings, '存储文件格式错误；已保留原文件，请检查后重启', 500, 'INVALID_STORAGE');
  } else state = seedState(now());
  // Preserve the original seed event's acknowledgement when opening an older local demo.
  const originalMoistureAlert = state.alerts.find((alert) => alert.id === 'alert-2' && alert.zoneId === 'zone-2');
  if (originalMoistureAlert && !originalMoistureAlert.condition) originalMoistureAlert.condition = 'low-moisture';

  function persist() {
    const temporary = `${stateFile}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    fs.renameSync(temporary, stateFile);
  }
  function commit(time) { state.updatedAt = iso(time); persist(); }
  function log(message, type, time) {
    state.logs.unshift({ id: uid('log'), message, type, createdAt: iso(time) });
    state.logs = state.logs.slice(0, 500);
  }
  function getZone(id) {
    const zone = state.zones.find((item) => item.id === id);
    assert(zone, '地块不存在', 404, 'NOT_FOUND');
    return zone;
  }
  function validateDuration(duration) { integer(duration, 1, state.settings.maxDuration, '灌溉时长（分钟）'); }
  function isOnline(zone) { return zone.status !== 'offline' && state.devices.find((device) => device.id === zone.deviceId)?.status === 'online'; }
  function reconcileMoistureAlerts(time) {
    let changed = false;
    for (const zone of state.zones) {
      // An offline reading is stale: do not create or resolve a moisture event from it.
      if (!isOnline(zone)) continue;
      const current = state.alerts.find((alert) => alert.zoneId === zone.id && alert.condition === 'low-moisture' && !alert.resolvedAt);
      if (zone.moisture < state.settings.moistureThreshold) {
        if (current) continue; // Acknowledgement is distinct from recovery.
        state.alerts.unshift({
          id: uid('alert'), title: `${zone.name}土壤偏干`,
          detail: `土壤含水率 ${round(zone.moisture)}%，低于预警阈值 ${state.settings.moistureThreshold}%，建议安排补水。`,
          level: 'warning', condition: 'low-moisture', zoneId: zone.id, createdAt: iso(time), acknowledged: false,
        });
        log(`${zone.name}触发低墒情预警（阈值 ${state.settings.moistureThreshold}%）`, 'alert', time); changed = true;
      } else if (current) {
        current.resolvedAt = iso(time);
        log(`${zone.name}墒情已恢复到当前预警阈值以上`, 'alert', time); changed = true;
      }
    }
    return changed;
  }
  function begin(zone, duration, time, planId = null) {
    assert(isOnline(zone), '设备离线，无法启动灌溉', 409, 'DEVICE_OFFLINE');
    assert(zone.status !== 'watering', '该地块正在灌溉，请先停止当前任务', 409, 'ALREADY_WATERING');
    zone.status = 'watering'; zone.flow = zone.nominalFlow || 300; zone.pressure = 0.32; zone.lastSeen = iso(time);
    state.sessions.unshift({ id: uid('session'), zoneId: zone.id, startedAt: iso(time), endsAt: iso(time + duration * 60000), duration, status: 'active', waterUsed: 0, accountedAt: iso(time), planId });
    log(`${zone.name}启动${planId ? '计划' : '手动'}灌溉，持续 ${duration} 分钟`, 'irrigation', time);
  }
  function finish(session, time, reason = 'completed') {
    session.status = reason; session.finishedAt = iso(time);
    const zone = getZone(session.zoneId);
    zone.status = isOnline(zone) ? 'idle' : 'offline'; zone.flow = 0; zone.pressure = 0;
    log(`${zone.name}${reason === 'completed' ? '定时灌溉完成' : '灌溉已停止'}，本次用水 ${session.waterUsed.toFixed(3)} m³`, 'irrigation', time);
  }
  function addWater(date, amount) {
    let day = state.history.find((entry) => entry.date === date);
    if (!day) {
      day = { date, water: 0, moisture: round(state.zones.reduce((sum, item) => sum + item.moisture, 0) / state.zones.length) };
      state.history.push(day); state.history.sort((a, b) => a.date.localeCompare(b.date));
      state.history = state.history.slice(-90);
    }
    day.water = round(day.water + amount);
    day.moisture = round(state.zones.reduce((sum, item) => sum + item.moisture, 0) / state.zones.length);
  }
  function ensureDailyHistory(time) {
    const today = localTime(time).date;
    const latest = state.history.at(-1)?.date;
    if (latest && latest >= today) return false;
    const todayStart = Date.parse(`${today}T00:00:00+08:00`);
    const start = latest ? Math.max(Date.parse(`${latest}T00:00:00+08:00`) + 86400_000, todayStart - 89 * 86400_000) : todayStart;
    for (let day = start; day <= todayStart; day += 86400_000) addWater(localTime(day).date, 0);
    return true;
  }
  function account(session, time) {
    const zone = getZone(session.zoneId);
    const until = Math.min(time, Date.parse(session.endsAt));
    let since = Date.parse(session.accountedAt || session.startedAt);
    if (until <= since) return false;
    const rate = zone.flow || zone.nominalFlow || 300;
    // Split at Beijing midnight so downtime across dates does not put all water into today.
    let amount = 0;
    while (since < until) {
      const date = localTime(since).date;
      const midnight = Date.parse(`${date}T00:00:00+08:00`) + 86400_000;
      const end = Math.min(until, midnight);
      const part = round((end - since) / 60000 * rate / 1000);
      amount = round(amount + part);
      zone.moisture = round(Math.min(zone.targetMoisture, zone.moisture + part * 0.18));
      addWater(date, part); since = end;
    }
    session.waterUsed = round(session.waterUsed + amount);
    session.accountedAt = iso(until);
    state.totalWater = round(state.totalWater + amount);
    zone.lastSeen = iso(until);
    const device = state.devices.find((item) => item.id === zone.deviceId);
    if (device) device.lastSeen = iso(until);
    return true;
  }
  function tick(time = now(), runPlans = true) {
    let changed = ensureDailyHistory(time);
    for (const session of state.sessions.filter((item) => item.status === 'active')) {
      changed = account(session, time) || changed;
      if (Date.parse(session.endsAt) <= time) { finish(session, Date.parse(session.endsAt)); changed = true; }
    }
    if (runPlans) {
      const local = localTime(time);
      const key = `${local.date} ${local.minute}`;
      for (const plan of state.plans) {
        if (!plan.enabled || !plan.days.includes(local.day) || plan.startTime !== local.minute || plan.lastRunKey === key) continue;
        plan.lastRun = iso(time); plan.lastRunKey = key; changed = true;
        let started = 0;
        for (const id of plan.zoneIds) {
          const zone = getZone(id);
          if (!isOnline(zone) || zone.status === 'watering') { log(`${plan.name}：跳过${zone.name}（${isOnline(zone) ? '已有灌溉任务' : '设备离线'}）`, 'warning', time); continue; }
          begin(zone, plan.duration, time, plan.id); started++;
        }
        log(`计划「${plan.name}」已执行，启动 ${started} 个地块`, 'plan', time);
      }
    }
    changed = reconcileMoistureAlerts(time) || changed;
    if (changed) commit(time);
    return changed;
  }
  function validatePlan(body) {
    const name = text(body.name, 50, '计划名称');
    assert(Array.isArray(body.zoneIds) && body.zoneIds.length > 0 && body.zoneIds.every((id) => typeof id === 'string'), '至少选择一个有效地块');
    const zoneIds = [...new Set(body.zoneIds)]; zoneIds.forEach(getZone);
    assert(typeof body.startTime === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(body.startTime), '开始时间须为 HH:mm');
    validateDuration(body.duration);
    assert(Array.isArray(body.days) && body.days.length > 0 && body.days.every((day) => Number.isInteger(day) && day >= 1 && day <= 7), '执行日须为 1–7（周一至周日）');
    assert(body.enabled === undefined || typeof body.enabled === 'boolean', 'enabled 须为布尔值');
    return { name, zoneIds, startTime: body.startTime, duration: body.duration, days: [...new Set(body.days)].sort(), enabled: body.enabled ?? true };
  }
  async function readBody(request) {
    let size = 0; const chunks = [];
    for await (const chunk of request) { size += chunk.length; assert(size <= 65536, '请求内容超过 64 KB', 413, 'BODY_TOO_LARGE'); chunks.push(chunk); }
    if (!size) return {};
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      assert(body && typeof body === 'object' && !Array.isArray(body), '请求须为 JSON 对象');
      return body;
    } catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'JSON 格式无效', 'INVALID_JSON'); }
  }
  function reply(response, status, payload) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(payload));
  }
  const app = async (request, response) => {
    try {
      response.setHeader('X-Content-Type-Options', 'nosniff');
      const origin = request.headers.origin;
      if (origin) {
        assert(/^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(origin), '仅允许本地开发页面访问', 403, 'ORIGIN_DENIED');
        response.setHeader('Access-Control-Allow-Origin', origin);
        response.setHeader('Vary', 'Origin');
        response.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
        response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
      }
      if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
      const url = new URL(request.url || '/', 'http://127.0.0.1');
      const pathname = url.pathname.replace(/\/$/, '') || '/';
      if (request.method === 'GET' && pathname === '/api/health') { reply(response, 200, { ok: true, mode: 'simulation', timezone: ZONE, updatedAt: state.updatedAt }); return; }
      if (request.method === 'GET' && pathname === '/api/state') { tick(); reply(response, 200, state); return; }
      if (request.method === 'GET' && pathname === '/api/export.csv') {
        tick();
        const escape = (value) => `"${String(value).replaceAll('"', '""')}"`;
        const rows = [['日期（北京时间）', '灌溉用水（m³）', '平均土壤含水率（%）'], ...state.history.map((day) => [day.date, day.water, day.moisture])];
        response.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="irrigation-history.csv"', 'Cache-Control': 'no-store' });
        response.end(`\uFEFF${rows.map((row) => row.map(escape).join(',')).join('\r\n')}\r\n`); return;
      }
      assert(['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method), '接口不存在', 404, 'NOT_FOUND');
      const body = await readBody(request);
      // No await occurs between mutation and persist: concurrent HTTP requests cannot lose an update.
      const time = now(); tick(time, false);
      let match;
      if (request.method === 'POST' && (match = pathname.match(/^\/api\/zones\/([^/]+)\/start$/))) {
        validateDuration(body.duration); begin(getZone(match[1]), body.duration, time);
      } else if (request.method === 'POST' && (match = pathname.match(/^\/api\/zones\/([^/]+)\/stop$/))) {
        getZone(match[1]);
        for (const session of state.sessions.filter((item) => item.zoneId === match[1] && item.status === 'active')) finish(session, time, 'stopped');
      } else if (request.method === 'POST' && pathname === '/api/stop-all') {
        for (const session of state.sessions.filter((item) => item.status === 'active')) finish(session, time, 'stopped');
        log('已停止全部模拟灌溉任务', 'control', time);
      } else if (request.method === 'POST' && pathname === '/api/plans') {
        const plan = { id: uid('plan'), ...validatePlan(body), lastRun: null };
        state.plans.unshift(plan); log(`新建灌溉计划「${plan.name}」`, 'plan', time);
      } else if (request.method === 'POST' && (match = pathname.match(/^\/api\/plans\/([^/]+)\/enabled$/))) {
        const plan = state.plans.find((item) => item.id === match[1]); assert(plan, '计划不存在', 404, 'NOT_FOUND');
        assert(typeof body.enabled === 'boolean', 'enabled 须为布尔值');
        plan.enabled = body.enabled; log(`${plan.enabled ? '启用' : '暂停'}计划「${plan.name}」`, 'plan', time);
      } else if (['PUT', 'PATCH', 'DELETE'].includes(request.method) && (match = pathname.match(/^\/api\/plans\/([^/]+)$/))) {
        const plan = state.plans.find((item) => item.id === match[1]); assert(plan, '计划不存在', 404, 'NOT_FOUND');
        if (request.method === 'DELETE') { state.plans = state.plans.filter((item) => item.id !== plan.id); log(`删除计划「${plan.name}」`, 'plan', time); }
        else if (request.method === 'PATCH') { assert(typeof body.enabled === 'boolean', 'enabled 须为布尔值'); plan.enabled = body.enabled; log(`${plan.enabled ? '启用' : '暂停'}计划「${plan.name}」`, 'plan', time); }
        else { Object.assign(plan, validatePlan(body)); log(`更新计划「${plan.name}」`, 'plan', time); }
      } else if (request.method === 'POST' && (match = pathname.match(/^\/api\/alerts\/([^/]+)\/ack$/))) {
        const alert = state.alerts.find((item) => item.id === match[1]); assert(alert, '预警不存在', 404, 'NOT_FOUND');
        if (!alert.acknowledged) { alert.acknowledged = true; alert.acknowledgedAt = iso(time); log(`已确认预警「${alert.title}」`, 'alert', time); }
      } else if (request.method === 'PUT' && pathname === '/api/settings') {
        const settings = { ...state.settings, ...body };
        const farmName = text(settings.farmName, 60, '农场名称'); const location = text(settings.location, 120, '农场位置');
        integer(settings.moistureThreshold, 0, 100, '含水率阈值'); integer(settings.maxDuration, 1, 240, '最长灌溉时长');
        assert(!state.plans.some((plan) => plan.duration > settings.maxDuration), '已有计划时长超过新上限，请先调整计划');
        state.settings = { farmName, location, moistureThreshold: settings.moistureThreshold, maxDuration: settings.maxDuration };
        state.farm.name = farmName; state.farm.location = location; log('农场设置已更新', 'settings', time);
        reconcileMoistureAlerts(time);
      } else throw new ApiError(404, '接口不存在', 'NOT_FOUND');
      commit(time); reply(response, 200, state);
    } catch (error) {
      if (!(error instanceof ApiError)) console.error('[irrigation-api]', error);
      if (!response.headersSent) reply(response, error.status || 500, { error: error instanceof ApiError ? error.message : '本地服务内部错误，请查看终端日志', code: error.code || 'INTERNAL_ERROR' });
      else response.end();
    }
  };
  tick(now(), false); persist();
  const timer = autoTick ? setInterval(() => { try { tick(); } catch (error) { console.error('[irrigation-timer]', error); } }, tickIntervalMs) : null;
  timer?.unref();
  app.getState = () => structuredClone(state);
  app.tick = tick;
  app.close = () => { if (timer) clearInterval(timer); };
  return app;
}

export function createServer(options = {}) {
  const app = createApp(options);
  const server = http.createServer(app);
  server.app = app;
  server.on('close', app.close);
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT 须为 1–65535 的整数');
  const host = process.env.HOST || '127.0.0.1';
  const server = createServer({ ...(process.env.DATA_DIR ? { dataDir: path.resolve(process.env.DATA_DIR) } : {}) });
  server.listen(port, host, () => console.log(`澜枢灌溉模拟 API：http://${host}:${port}（北京时间计划调度，仅本地模拟）`));
  server.on('error', (error) => { server.app.close(); console.error(error.message); process.exitCode = 1; });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { server.close(); server.closeIdleConnections(); });
}
