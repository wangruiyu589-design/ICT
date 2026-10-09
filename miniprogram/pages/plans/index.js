const {createPage} = require('../../utils/page');
const api = require('../../utils/api');

function dayOptions(selected) {
  return [1, 2, 3, 4, 5, 6, 7].map(value => ({value, label: ['一', '二', '三', '四', '五', '六', '日'][value - 1], selected: selected.includes(value)}));
}

Page(createPage({
  data: {
    filter: 'all', visiblePlans: [], sheetOpen: false, formError: '',
    form: {name: '', zoneIds: [], startTime: '06:00', duration: '20', days: [1, 2, 3, 4, 5, 6, 7], enabled: true},
    dayOptions: dayOptions([1, 2, 3, 4, 5, 6, 7]), zoneOptions: []
  },
  onState(state) {
    this.updatePlans(state);
    this.updateZoneOptions(state);
  },
  updatePlans(state = this.data.state) {
    if (!state) return;
    this.setData({visiblePlans: state.plans.filter(plan => this.data.filter === 'all' || (this.data.filter === 'enabled' ? plan.enabled : !plan.enabled))});
  },
  updateZoneOptions(state = this.data.state) {
    if (!state) return;
    this.setData({zoneOptions: state.zones.map(zone => ({...zone, selected: this.data.form.zoneIds.includes(zone.id)}))});
  },
  chooseFilter(event) {
    this.setData({filter: event.currentTarget.dataset.filter});
    this.updatePlans();
  },
  openCreate() {
    if (!this.data.state || this.data.busy || this.data.error) return;
    this.setData({
      sheetOpen: true, formError: '',
      form: {name: '', zoneIds: [], startTime: '06:00', duration: String(Math.min(20, Number(this.data.state.settings.maxDuration) || 120)), days: [1, 2, 3, 4, 5, 6, 7], enabled: true},
      dayOptions: dayOptions([1, 2, 3, 4, 5, 6, 7])
    });
    this.updateZoneOptions();
  },
  closeSheet() {
    if (!this.data.busy) this.setData({sheetOpen: false, formError: ''});
  },
  changeName(event) { this.setData({'form.name': event.detail.value, formError: ''}); },
  changeDuration(event) { this.setData({'form.duration': event.detail.value, formError: ''}); },
  changeTime(event) { this.setData({'form.startTime': event.detail.value, formError: ''}); },
  changeZones(event) {
    this.setData({'form.zoneIds': event.detail.value, formError: ''});
    this.updateZoneOptions();
  },
  toggleDay(event) {
    const value = Number(event.currentTarget.dataset.value);
    const days = this.data.form.days.includes(value) ? this.data.form.days.filter(day => day !== value) : [...this.data.form.days, value].sort((a, b) => a - b);
    this.setData({'form.days': days, dayOptions: dayOptions(days), formError: ''});
  },
  changeEnabled(event) { this.setData({'form.enabled': event.detail.value}); },
  async savePlan() {
    const form = this.data.form;
    const duration = Number(form.duration);
    const maxDuration = Number(this.data.state.settings.maxDuration) || 120;
    let error = '';
    if (!form.name.trim()) error = '请填写计划名称';
    else if (!form.zoneIds.length) error = '请至少选择一个灌溉分区';
    else if (!form.days.length) error = '请至少选择一个执行日';
    else if (!Number.isInteger(duration) || duration < 1 || duration > maxDuration) error = `时长须为 1～${maxDuration} 分钟的整数`;
    else if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.startTime)) error = '请选择有效的开始时间';
    if (error) { this.setData({formError: error}); return; }
    const success = await this.runAction('create-plan', '/api/plans', 'POST', {...form, name: form.name.trim(), duration}, '计划已保存');
    if (success) this.setData({sheetOpen: false});
  },
  async togglePlan(event) {
    const plan = this.data.state.plans.find(item => item.id === event.currentTarget.dataset.id);
    if (!plan || this.data.busy) return;
    const enabled = !plan.enabled;
    if (!await api.confirm(enabled ? '启用灌溉计划' : '暂停灌溉计划', enabled ? `「${plan.name}」将在选定日期 ${plan.startTime} 自动执行。请保持本地服务运行。` : `暂停「${plan.name}」后将不再自动触发。已经开始的灌溉任务需在灌溉页单独停止。`, enabled ? '启用计划' : '暂停计划')) return;
    await this.runAction(plan.id, `/api/plans/${encodeURIComponent(plan.id)}/enabled`, 'POST', {enabled}, enabled ? '计划已启用' : '计划已暂停');
  },
  async deletePlan(event) {
    const plan = this.data.state.plans.find(item => item.id === event.currentTarget.dataset.id);
    if (!plan || this.data.busy) return;
    if (!await api.confirm('删除灌溉计划', `确定删除「${plan.name}」？此操作无法撤销，正在进行的灌溉不会因此停止。`, '删除计划')) return;
    await this.runAction(`delete-${plan.id}`, `/api/plans/${encodeURIComponent(plan.id)}`, 'DELETE', undefined, '计划已删除');
  }
}));
