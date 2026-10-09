/* Runs page handlers through a wx API mock against an isolated real local API.
 * This checks requests and state transitions, not WeChat rendering or device support. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '..');

async function main() {
  const {createServer} = await import(pathToFileURL(path.resolve(root, '../server/index.mjs')).href);
  const workRoot = path.resolve(__dirname, 'work');
  fs.mkdirSync(workRoot, {recursive: true});
  const dataDir = fs.mkdtempSync(path.join(workRoot, 'wx-api-'));
  const server = createServer({dataDir, now: () => Date.parse('2026-10-09T03:00:00Z'), autoTick: false});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}`;
  const storage = new Map([['lanshu_api_url', url]]);
  const app = {globalData: {state: null, connectedAt: null}};
  const calls = [];
  let fault = '', holdNextGet = false, releaseHeld = null, lastPage = null, confirmations = 0;
  const wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, value),
    showModal(options) { confirmations++; options.success({confirm: true, cancel: false}); },
    showToast() {}, stopPullDownRefresh() {}, switchTab() {}, setClipboardData() {},
    request(options) {
      assert(['OPTIONS', 'GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'TRACE', 'CONNECT'].includes(options.method), `Unsupported wx.request method: ${options.method}`);
      calls.push({url: options.url, method: options.method, data: options.data});
      if (fault === 'network') { options.fail({errMsg: 'request:fail connection refused'}); return; }
      if (fault === 'invalid-body') { options.success({statusCode: 200, data: {wrong: true}}); return; }
      const hold = holdNextGet && options.method === 'GET';
      if (hold) holdNextGet = false;
      fetch(options.url, {method: options.method, headers: options.header, body: options.data === undefined ? undefined : JSON.stringify(options.data)})
        .then(async response => {
          const data = await response.json();
          const complete = () => options.success({statusCode: response.status, data});
          if (hold) releaseHeld = complete;
          else complete();
        }).catch(error => options.fail({errMsg: error.message}));
    }
  };
  const cache = new Map();
  function load(file) {
    const resolved = path.resolve(file.endsWith('.js') ? file : file + '.js');
    if (cache.has(resolved)) return cache.get(resolved).exports;
    const module = {exports: {}};
    cache.set(resolved, module);
    const context = {wx, getApp: () => app, Page: definition => { lastPage = definition; }, Date, Promise, Map, Set, setInterval: () => 1, clearInterval() {}, console};
    const factory = vm.runInNewContext(`(function(require,module,exports){\n${fs.readFileSync(resolved, 'utf8')}\n})`, context, {filename: resolved});
    factory(relative => load(path.resolve(path.dirname(resolved), relative)), module, module.exports);
    return module.exports;
  }
  function page(name) {
    load(path.join(root, 'pages', name, 'index.js'));
    const result = {...lastPage, data: JSON.parse(JSON.stringify(lastPage.data)), _requestVersion: 0, _visible: true};
    result.setData = function (updates) {
      for (const [key, value] of Object.entries(updates)) {
        const parts = key.split('.');
        let target = this.data;
        for (const part of parts.slice(0, -1)) target = target[part];
        target[parts[parts.length - 1]] = value;
      }
    };
    return result;
  }
  const event = dataset => ({currentTarget: {dataset}});
  let groups = 0;
  try {
    const api = load(path.join(root, 'utils/api.js'));
    const stateUtil = load(path.join(root, 'utils/state.js'));
    assert.equal(api.normalizeUrl(' http://127.0.0.1:8787/// '), 'http://127.0.0.1:8787');
    assert.throws(() => api.normalizeUrl('javascript:alert(1)'));
    assert.equal(stateUtil.dateTime('2026-10-09T03:00:00Z'), '10.09 11:00');
    assert.equal(stateUtil.dateTime(null), '暂无记录');
    groups++;

    const overview = page('overview');
    assert.equal(await overview.syncState(), true);
    assert.equal(overview.data.state.zones.length, 6);
    assert.equal(overview.data.state.wateringCount, 1);
    assert.equal(overview.data.state.chartHistory.length, 7);
    assert.equal(overview.data.state.onlineCount, 5);
    groups++;

    const irrigation = page('irrigation');
    await irrigation.syncState();
    irrigation.chooseFilter(event({filter: 'offline'}));
    assert.equal(irrigation.data.visibleZones.length, 1);
    irrigation.openStart(event({id: 'zone-6'}));
    assert.equal(irrigation.data.sheetOpen, false);
    irrigation.openStart(event({id: 'zone-1'}));
    irrigation.changeDuration({detail: {value: '0'}});
    const beforeInvalid = calls.length;
    await irrigation.startWatering();
    assert.equal(calls.length, beforeInvalid);
    assert.ok(irrigation.data.formError);
    irrigation.changeDuration({detail: {value: '12'}});
    await irrigation.startWatering();
    assert.equal(irrigation.data.state.zones.find(zone => zone.id === 'zone-1').status, 'watering');
    assert.equal(irrigation.data.sheetOpen, false);
    assert.ok(app.globalData.state.zones.find(zone => zone.id === 'zone-1').status === 'watering');
    await irrigation.stopWatering(event({id: 'zone-1'}));
    assert.equal(irrigation.data.state.zones.find(zone => zone.id === 'zone-1').status, 'idle');
    await irrigation.stopAll();
    assert.equal(irrigation.data.state.wateringCount, 0);
    groups++;

    irrigation.setData({'state.settings.maxDuration': 5});
    irrigation.openStart(event({id: 'zone-1'}));
    assert.equal(irrigation.data.duration, '5');
    assert.ok(irrigation.data.durationOptions.every(value => value <= 5));
    irrigation.closeSheet();
    await irrigation.syncState();
    groups++;

    const plans = page('plans');
    await plans.syncState();
    plans.openCreate();
    const beforeForm = calls.length;
    await plans.savePlan();
    assert.equal(calls.length, beforeForm);
    assert.ok(plans.data.formError);
    plans.changeName({detail: {value: '小程序联调计划'}});
    plans.changeZones({detail: {value: ['zone-1']}});
    plans.changeTime({detail: {value: '06:45'}});
    plans.changeDuration({detail: {value: '15'}});
    plans.toggleDay(event({value: 7}));
    assert.equal(plans.data.form.days.length, 6);
    await plans.savePlan();
    const created = plans.data.state.plans.find(plan => plan.name === '小程序联调计划');
    assert.ok(created && created.enabled);
    assert.equal(plans.data.sheetOpen, false);
    await plans.togglePlan(event({id: created.id}));
    assert.equal(plans.data.state.plans.find(plan => plan.id === created.id).enabled, false);
    assert.ok(calls.some(call => call.method === 'POST' && call.url.endsWith(`/api/plans/${created.id}/enabled`)));
    await plans.deletePlan(event({id: created.id}));
    assert.equal(plans.data.state.plans.some(plan => plan.id === created.id), false);
    groups++;

    const alerts = page('alerts');
    await alerts.syncState();
    const pendingBefore = alerts.data.state.unreadCount;
    const alertId = alerts.data.visibleAlerts[0].id;
    await alerts.acknowledge(event({id: alertId}));
    assert.equal(alerts.data.state.unreadCount, pendingBefore - 1);
    alerts.chooseFilter(event({filter: 'acknowledged'}));
    assert.ok(alerts.data.visibleAlerts.some(alert => alert.id === alertId));
    groups++;

    fault = 'network';
    const savedState = irrigation.data.state;
    assert.equal(await irrigation.syncState(), false);
    assert.equal(irrigation.data.state, savedState);
    assert.ok(irrigation.data.error.includes('无法连接'));
    fault = 'invalid-body';
    assert.equal(await irrigation.syncState(), false);
    assert.ok(irrigation.data.error.includes('不符合'));
    fault = '';
    assert.equal(await irrigation.syncState(), true);
    assert.equal(irrigation.data.error, '');
    await assert.rejects(api.request('/api/zones/zone-6/start', 'POST', {duration: 5}), /离线/);
    assert.equal(await irrigation.runAction('zone-6', '/api/zones/zone-6/start', 'POST', {duration: 5}), false);
    assert.equal(irrigation.data.error, '', 'An HTTP business rejection must not be mislabeled as a network outage');
    assert.ok(irrigation.data.formError.includes('离线'));
    groups++;

    holdNextGet = true;
    const staleFetch = irrigation.syncState(true);
    for (let attempt = 0; !releaseHeld && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(releaseHeld, 'Expected a held GET response');
    assert.equal(await irrigation.runAction('zone-1', '/api/zones/zone-1/start', 'POST', {duration: 5}), true);
    releaseHeld();
    await staleFetch;
    assert.equal(irrigation.data.state.zones.find(zone => zone.id === 'zone-1').status, 'watering', 'A stale GET must not overwrite mutation result');
    await irrigation.stopAll();
    groups++;

    const profile = page('profile');
    profile.changeUrl({detail: {value: 'not a URL'}});
    await profile.saveConnection();
    assert.ok(profile.data.connectionError);
    profile.changeUrl({detail: {value: url}});
    await profile.saveConnection();
    assert.equal(profile.data.error, '');
    assert.equal(profile.data.baseUrl, url);
    assert.equal(profile.data.connected, true);
    assert.ok(confirmations >= 6);
    groups++;

    holdNextGet = true;
    releaseHeld = null;
    const oldConnectionRequest = api.request('/api/state');
    for (let attempt = 0; !releaseHeld && attempt < 100; attempt++) await new Promise(resolve => setTimeout(resolve, 10));
    assert.ok(releaseHeld);
    api.setBaseUrl(url.replace('127.0.0.1', 'localhost'));
    const rejectsOldAddress = assert.rejects(oldConnectionRequest, /地址已切换/);
    releaseHeld();
    await rejectsOldAddress;
    assert.equal(app.globalData.state, null);
    api.setBaseUrl(url);
    groups++;
    process.stdout.write(`OK: ${groups} page/API integration groups; ${calls.length} requests through wx mock; real isolated API; supported WeChat HTTP methods only.\n`);
  } finally {
    await new Promise(resolve => server.close(resolve));
    server.app.close();
    const resolved = path.resolve(dataDir);
    assert(resolved.startsWith(workRoot + path.sep), 'Refusing cleanup outside the test workspace');
    fs.rmSync(resolved, {recursive: true, force: true});
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
