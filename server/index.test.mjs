import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './index.mjs';

const workRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), 'work');
fs.mkdirSync(workRoot, { recursive: true });

async function fixture(t, initialTime = Date.parse('2026-10-09T02:15:00Z')) {
  const dataDir = fs.mkdtempSync(path.join(workRoot, 'api-test-'));
  let time = initialTime;
  let server;
  let base;
  async function start() {
    server = createServer({ dataDir, now: () => time, autoTick: false });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function stop() { if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
  await start();
  t.after(async () => {
    await stop();
    const resolved = path.resolve(dataDir);
    assert.ok(resolved.startsWith(`${path.resolve(workRoot)}${path.sep}api-test-`));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return {
    get server() { return server; }, get time() { return time; },
    advance(milliseconds) { time += milliseconds; }, setTime(value) { time = Date.parse(value); },
    async restart() { await stop(); await start(); },
    async call(route, method = 'GET', body, headers = {}) {
      const response = await fetch(`${base}${route}`, { method, headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
      const content = await response.text();
      return { status: response.status, headers: response.headers, body: content && response.headers.get('content-type')?.includes('json') ? JSON.parse(content) : content };
    },
  };
}

test('state contract, manual start/stop, timed finish and metered water', async (t) => {
  const f = await fixture(t);
  const initial = await f.call('/api/state');
  assert.equal(initial.status, 200); assert.equal(initial.body.mode, 'simulation');
  assert.equal(initial.body.zones.reduce((sum, zone) => sum + zone.area, 0), 1260);
  assert.equal(initial.body.history.length, 30, 'a new demo covers every offered 7/14/30-day view');
  await f.call('/api/stop-all', 'POST');
  const start = await f.call('/api/zones/zone-1/start', 'POST', { duration: 2 });
  assert.equal(start.status, 200); assert.equal(start.body.zones[0].status, 'watering');
  const totalBefore = start.body.totalWater;
  f.advance(60000);
  const stop = await f.call('/api/zones/zone-1/stop', 'POST');
  assert.equal(stop.body.zones[0].status, 'idle'); assert.equal(stop.body.zones[0].flow, 0);
  assert.equal(stop.body.sessions[0].status, 'stopped');
  assert.equal(stop.body.sessions[0].waterUsed, 0.36);
  assert.ok(Math.abs(stop.body.totalWater - totalBefore - 0.36) < 0.000001);
  await f.call('/api/zones/zone-2/start', 'POST', { duration: 1 });
  f.advance(90000); f.server.app.tick();
  const state = f.server.app.getState();
  assert.equal(state.zones[1].status, 'idle');
  assert.equal(state.sessions[0].status, 'completed');
  assert.equal(state.sessions[0].waterUsed, 0.3, 'only meter the scheduled minute, not the extra 30 seconds');
});

test('reject offline, duplicate, missing and invalid control requests', async (t) => {
  const f = await fixture(t);
  assert.equal((await f.call('/api/zones/zone-6/start', 'POST', { duration: 10 })).status, 409);
  assert.equal((await f.call('/api/zones/missing/start', 'POST', { duration: 10 })).status, 404);
  for (const duration of [0, -1, 1.5, '10', 121, null]) assert.equal((await f.call('/api/zones/zone-1/start', 'POST', { duration })).status, 400);
  assert.equal((await f.call('/api/zones/zone-1/start', 'POST', { duration: 1 })).status, 200);
  assert.equal((await f.call('/api/zones/zone-1/start', 'POST', { duration: 1 })).status, 409);
  assert.equal(f.server.app.getState().zones[5].status, 'offline');
  assert.equal((await f.call('/api/state', 'GET', undefined, { Origin: 'https://untrusted.example' })).status, 403);
  const local = await f.call('/api/state', 'GET', undefined, { Origin: 'http://localhost:5173' });
  assert.equal(local.headers.get('access-control-allow-origin'), 'http://localhost:5173');
});

test('JSON persistence survives restart and expires overdue sessions exactly once', async (t) => {
  const f = await fixture(t);
  await f.call('/api/stop-all', 'POST');
  await f.call('/api/zones/zone-3/start', 'POST', { duration: 2 });
  await f.call('/api/alerts/alert-1/ack', 'POST');
  await f.call('/api/settings', 'PUT', { farmName: '测试农场', location: '河北测试基地' });
  const before = f.server.app.getState().totalWater;
  f.advance(5 * 60000); await f.restart();
  const state = f.server.app.getState();
  assert.equal(state.farm.name, '测试农场');
  assert.equal(state.alerts[0].acknowledged, true);
  assert.equal(state.zones[2].status, 'idle');
  assert.equal(state.sessions[0].status, 'completed');
  assert.equal(state.sessions[0].waterUsed, 0.84);
  assert.ok(Math.abs(state.totalWater - before - 0.84) < 0.000001);
  await f.restart();
  assert.equal(f.server.app.getState().totalWater, state.totalWater);
});

test('Shanghai scheduler obeys weekday, skips offline, and persists once-per-minute run key', async (t) => {
  const f = await fixture(t, Date.parse('2026-10-08T21:59:50Z')); // Friday 05:59:50 in Beijing
  await f.call('/api/stop-all', 'POST');
  const payload = { name: '调度测试', zoneIds: ['zone-1', 'zone-6'], startTime: '06:00', duration: 1, days: [5], enabled: true };
  const created = await f.call('/api/plans', 'POST', payload);
  assert.equal(created.status, 200); const id = created.body.plans[0].id;
  const wrongDay = await f.call('/api/plans', 'POST', { ...payload, name: '星期不匹配', zoneIds: ['zone-2'], days: [4] });
  assert.equal(wrongDay.status, 200);
  f.advance(10000); f.server.app.tick();
  let state = f.server.app.getState();
  assert.equal(state.zones[0].status, 'watering'); assert.equal(state.zones[1].status, 'idle');
  assert.equal(state.zones[5].status, 'offline');
  assert.equal(state.sessions.filter((session) => session.planId === id).length, 1);
  assert.equal(state.plans.find((plan) => plan.id === id).lastRunKey, '2026-10-09 06:00');
  f.advance(15000); f.server.app.tick(); await f.restart(); f.server.app.tick();
  assert.equal(f.server.app.getState().sessions.filter((session) => session.planId === id).length, 1);
  f.advance(60000); f.server.app.tick();
  assert.equal(f.server.app.getState().zones[0].status, 'idle');
});

test('plan CRUD and settings validations preserve state on invalid update', async (t) => {
  const f = await fixture(t);
  const payload = { name: '新计划', zoneIds: ['zone-1'], startTime: '15:20', duration: 10, days: [1, 2], enabled: true };
  const created = await f.call('/api/plans', 'POST', payload); const id = created.body.plans[0].id;
  assert.equal((await f.call(`/api/plans/${id}`, 'PATCH', { enabled: false })).body.plans[0].enabled, false);
  assert.equal((await f.call(`/api/plans/${id}`, 'PUT', { ...payload, name: '已编辑' })).body.plans[0].name, '已编辑');
  assert.equal((await f.call(`/api/plans/${id}`, 'PUT', { ...payload, startTime: '25:00' })).status, 400);
  assert.equal((await f.call('/api/plans', 'POST', { ...payload, days: [0] })).status, 400);
  assert.equal((await f.call('/api/settings', 'PUT', { maxDuration: 5 })).status, 400);
  assert.equal(f.server.app.getState().settings.maxDuration, 120);
  assert.equal((await f.call(`/api/plans/${id}`, 'DELETE')).body.plans.some((plan) => plan.id === id), false);
});

test('concurrent mutations are retained and CSV contains metering history', async (t) => {
  const f = await fixture(t);
  await f.call('/api/stop-all', 'POST');
  const results = await Promise.all([1, 2, 3, 4].map((n) => f.call(`/api/zones/zone-${n}/start`, 'POST', { duration: 5 })));
  assert.ok(results.every((result) => result.status === 200));
  assert.equal(f.server.app.getState().sessions.filter((session) => session.status === 'active').length, 4);
  f.advance(60000);
  const csv = await f.call('/api/export.csv');
  assert.equal(csv.status, 200); assert.match(csv.headers.get('content-type'), /text\/csv/);
  assert.match(csv.body, /灌溉用水/); assert.match(csv.body, /2026-10-09/);
  const stopped = await f.call('/api/stop-all', 'POST');
  assert.ok(stopped.body.zones.every((zone) => zone.status !== 'watering'));
});

test('metering splits a session across Beijing midnight', async (t) => {
  const f = await fixture(t, Date.parse('2026-10-09T15:59:30Z'));
  await f.call('/api/stop-all', 'POST');
  await f.call('/api/zones/zone-1/start', 'POST', { duration: 1 });
  f.advance(60000); f.server.app.tick();
  const history = f.server.app.getState().history;
  assert.equal(history.find((day) => day.date === '2026-10-09').water, 0.18);
  assert.equal(history.find((day) => day.date === '2026-10-10').water, 0.18);
});

test('idle dates are recorded with zero water after midnight and downtime', async (t) => {
  const f = await fixture(t, Date.parse('2026-10-09T15:59:30Z'));
  await f.call('/api/stop-all', 'POST');
  await f.call('/api/zones/zone-1/start', 'POST', { duration: 1 });
  f.advance(10000); await f.call('/api/zones/zone-1/stop', 'POST');
  assert.equal(f.server.app.getState().history.at(-1).water, 0.06);
  f.advance(3 * 86400_000); await f.restart();
  const state = (await f.call('/api/state')).body;
  assert.equal(state.history.at(-1).date, '2026-10-12');
  assert.deepEqual(state.history.slice(-3).map((day) => day.water), [0, 0, 0]);
  const sum = state.history.reduce((total, day) => total + day.water, 0);
  assert.ok(Math.abs(sum - state.totalWater) < 0.000001);
});

test('POST plan enabled alias matches PATCH and validates the payload', async (t) => {
  const f = await fixture(t);
  const disabled = await f.call('/api/plans/plan-1/enabled', 'POST', { enabled: false });
  assert.equal(disabled.status, 200); assert.equal(disabled.body.plans.find((plan) => plan.id === 'plan-1').enabled, false);
  const enabled = await f.call('/api/plans/plan-1/enabled', 'POST', { enabled: true });
  assert.equal(enabled.status, 200); assert.equal(enabled.body.plans.find((plan) => plan.id === 'plan-1').enabled, true);
  assert.equal((await f.call('/api/plans/plan-1/enabled', 'POST', { enabled: 'false' })).status, 400);
  assert.equal((await f.call('/api/plans/missing/enabled', 'POST', { enabled: false })).status, 404);
});

test('moisture alerts deduplicate acknowledged episodes, recover, and recur', async (t) => {
  const f = await fixture(t);
  await f.call('/api/stop-all', 'POST');
  const raised = await f.call('/api/settings', 'PUT', { moistureThreshold: 50 });
  const moistureAlerts = (state) => state.alerts.filter((alert) => alert.condition === 'low-moisture');
  assert.equal(moistureAlerts(raised.body).length, 5, 'five online plots are below 50%; offline plot is excluded');
  assert.ok(moistureAlerts(raised.body).every((alert) => alert.zoneId !== 'zone-6'));
  const first = moistureAlerts(raised.body).find((alert) => alert.zoneId === 'zone-1');
  await f.call(`/api/alerts/${first.id}/ack`, 'POST');
  f.advance(60000); f.server.app.tick(); await f.restart(); f.server.app.tick();
  let state = f.server.app.getState();
  assert.equal(moistureAlerts(state).length, 5, 'persistent acknowledged conditions do not create another event');
  assert.equal(state.alerts.find((alert) => alert.id === first.id).acknowledged, true);
  const recovered = await f.call('/api/settings', 'PUT', { moistureThreshold: 30 });
  assert.ok(moistureAlerts(recovered.body).every((alert) => alert.resolvedAt));
  const recurred = await f.call('/api/settings', 'PUT', { moistureThreshold: 50 });
  assert.equal(moistureAlerts(recurred.body).length, 10, 'a later threshold crossing creates a fresh episode');
  const fresh = moistureAlerts(recurred.body).find((alert) => alert.zoneId === 'zone-1' && !alert.resolvedAt);
  assert.notEqual(fresh.id, first.id); assert.equal(fresh.acknowledged, false);
});

test('simulation irrigation resolves a low-moisture alert on a later tick', async (t) => {
  const f = await fixture(t);
  await f.call('/api/stop-all', 'POST');
  const raised = await f.call('/api/settings', 'PUT', { moistureThreshold: 32 });
  const low = raised.body.alerts.find((alert) => alert.zoneId === 'zone-2' && alert.condition === 'low-moisture' && !alert.resolvedAt);
  assert.ok(low);
  await f.call('/api/zones/zone-2/start', 'POST', { duration: 20 });
  f.advance(20 * 60000); f.server.app.tick();
  const state = f.server.app.getState();
  assert.ok(state.zones[1].moisture >= 32);
  assert.ok(state.alerts.find((alert) => alert.id === low.id).resolvedAt);
});
