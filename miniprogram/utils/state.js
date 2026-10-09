function number(value, digits = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(digits) : '—';
}

function dateTime(value) {
  if (!value) return '暂无记录';
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return '暂无记录';
  const date = new Date(timestamp + 8 * 3600000);
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}.${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}`;
}

function prepareState(raw) {
  const zoneNames = new Map(raw.zones.map(zone => [zone.id, zone.name]));
  const zones = raw.zones.map(zone => ({
    ...zone,
    moistureText: number(zone.moisture, 1),
    moistureWidth: `${Math.max(0, Math.min(100, Number(zone.moisture) || 0))}%`,
    targetText: number(zone.targetMoisture),
    flowText: number(zone.flow, 1),
    pressureText: number(zone.pressure, 2),
    batteryText: number(zone.battery),
    statusText: {watering: '灌溉中', idle: '待机', offline: '离线'}[zone.status] || '未知',
    needsWater: zone.status !== 'offline' && Number(zone.moisture) < Number(zone.targetMoisture),
    lastSeenText: dateTime(zone.lastSeen)
  }));
  const devices = (raw.devices || []).map(device => ({
    ...device,
    zoneName: zoneNames.get(device.zoneId) || '公共设施',
    statusText: device.status === 'online' ? '在线' : '离线',
    lastSeenText: dateTime(device.lastSeen)
  }));
  const plans = raw.plans.map(plan => ({
    ...plan,
    zoneNames: (plan.zoneIds || []).map(id => zoneNames.get(id) || id).join('、'),
    daysText: (plan.days || []).length === 7 ? '每天' : (plan.days || []).map(day => `周${['', '一', '二', '三', '四', '五', '六', '日'][day]}`).join(' / ')
  }));
  const alerts = raw.alerts.map(alert => ({
    ...alert,
    zoneName: zoneNames.get(alert.zoneId) || '系统',
    timeText: dateTime(alert.createdAt),
    levelText: {critical: '紧急', warning: '注意', info: '通知'}[alert.level] || '通知'
  })).sort((left, right) => Number(left.acknowledged) - Number(right.acknowledged) || new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
  const history = raw.history || [];
  const maxWater = Math.max(1, ...history.map(point => Number(point.water) || 0));
  const chartHistory = history.slice(-7).map(point => ({
    ...point,
    waterText: number(point.water, 1),
    dateLabel: String(point.date).slice(5),
    height: `${Math.max(4, ((Number(point.water) || 0) / maxWater) * 100)}%`
  }));
  const validMoisture = zones.filter(zone => zone.status !== 'offline' && Number.isFinite(Number(zone.moisture)));
  return {
    ...raw,
    zones,
    devices,
    plans,
    alerts,
    chartHistory,
    recentLogs: (raw.logs || []).slice().sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()).slice(0, 5).map(log => ({...log, timeText: dateTime(log.createdAt)})),
    wateringCount: zones.filter(zone => zone.status === 'watering').length,
    dryCount: zones.filter(zone => zone.needsWater).length,
    onlineCount: devices.filter(device => device.status === 'online').length,
    unreadCount: alerts.filter(alert => !alert.acknowledged).length,
    enabledPlanCount: plans.filter(plan => plan.enabled).length,
    avgMoisture: validMoisture.length ? number(validMoisture.reduce((sum, zone) => sum + Number(zone.moisture), 0) / validMoisture.length, 1) : '—',
    todayWater: history.length ? number(history[history.length - 1].water, 1) : '—',
    updatedText: dateTime(raw.updatedAt)
  };
}

module.exports = {prepareState, dateTime};
