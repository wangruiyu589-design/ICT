const {createPage} = require('../../utils/page');
const api = require('../../utils/api');

Page(createPage({
  data: {filter: 'all', visibleZones: [], sheetOpen: false, selectedZone: null, duration: '20', durationOptions: [10, 20, 30, 60], formError: ''},
  onState(state) {
    this.updateZones(state);
    if (this.data.selectedZone) {
      const zone = state.zones.find(item => item.id === this.data.selectedZone.id);
      if (zone) this.setData({selectedZone: zone});
    }
  },
  updateZones(state = this.data.state) {
    if (!state) return;
    const filter = this.data.filter;
    this.setData({visibleZones: state.zones.filter(zone => filter === 'all' || (filter === 'dry' ? zone.needsWater : zone.status === filter))});
  },
  chooseFilter(event) {
    this.setData({filter: event.currentTarget.dataset.filter});
    this.updateZones();
  },
  openStart(event) {
    const zone = this.data.state.zones.find(item => item.id === event.currentTarget.dataset.id);
    if (!zone || zone.status !== 'idle' || this.data.busy) return;
    const maxDuration = Number(this.data.state.settings.maxDuration) || 120;
    const durationOptions = [...new Set([10, 20, 30, 60].map(value => Math.min(value, maxDuration)))];
    this.setData({sheetOpen: true, selectedZone: zone, duration: String(Math.min(20, maxDuration)), durationOptions, formError: ''});
  },
  closeSheet() {
    if (this.data.busy) return;
    this.setData({sheetOpen: false, formError: ''});
  },
  changeDuration(event) {
    this.setData({duration: event.detail.value, formError: ''});
  },
  quickDuration(event) {
    this.setData({duration: String(event.currentTarget.dataset.value), formError: ''});
  },
  async startWatering() {
    const duration = Number(this.data.duration);
    const maxDuration = Number(this.data.state.settings.maxDuration) || 120;
    if (!Number.isInteger(duration) || duration < 1 || duration > maxDuration) {
      this.setData({formError: `请输入 1～${maxDuration} 分钟的整数时长`});
      return;
    }
    const zone = this.data.selectedZone;
    if (!zone || zone.status !== 'idle') {
      this.setData({formError: '分区状态已变化，请刷新后重试'});
      return;
    }
    if (!await api.confirm('确认开启灌溉', `即将对「${zone.name}」灌溉 ${duration} 分钟。当前为本地模拟模式，指令将同步到网页端。`, '开启灌溉')) return;
    const success = await this.runAction(zone.id, `/api/zones/${encodeURIComponent(zone.id)}/start`, 'POST', {duration}, '灌溉已开启');
    if (success) this.setData({sheetOpen: false, selectedZone: null});
  },
  async stopWatering(event) {
    const zone = this.data.state.zones.find(item => item.id === event.currentTarget.dataset.id);
    if (!zone || this.data.busy) return;
    if (!await api.confirm('停止分区灌溉', `立即停止「${zone.name}」正在运行的灌溉任务？`, '停止灌溉')) return;
    await this.runAction(zone.id, `/api/zones/${encodeURIComponent(zone.id)}/stop`, 'POST', {}, '灌溉已停止');
  },
  async stopAll() {
    if (!this.data.state.wateringCount || this.data.busy) return;
    if (!await api.confirm('全部停止', `将停止所有 ${this.data.state.wateringCount} 个正在灌溉的分区。后续定时计划仍按设置运行。`, '全部停止')) return;
    await this.runAction('stop-all', '/api/stop-all', 'POST', {}, '全部灌溉已停止');
  }
}));
