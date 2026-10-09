const {createPage} = require('../../utils/page');
const api = require('../../utils/api');

Page(createPage({
  data: {filter: 'pending', visibleAlerts: []},
  onState(state) { this.updateAlerts(state); },
  updateAlerts(state = this.data.state) {
    if (!state) return;
    this.setData({visibleAlerts: state.alerts.filter(alert => this.data.filter === 'all' || (this.data.filter === 'pending' ? !alert.acknowledged : alert.acknowledged))});
  },
  chooseFilter(event) {
    this.setData({filter: event.currentTarget.dataset.filter});
    this.updateAlerts();
  },
  async acknowledge(event) {
    const alert = this.data.state.alerts.find(item => item.id === event.currentTarget.dataset.id);
    if (!alert || alert.acknowledged || this.data.busy) return;
    if (!await api.confirm('确认已知悉', `将「${alert.title}」标记为已知悉。此操作只确认告警，不会修复设备或改变灌溉状态。`, '已知悉')) return;
    await this.runAction(alert.id, `/api/alerts/${encodeURIComponent(alert.id)}/ack`, 'POST', {}, '告警已确认');
  }
}));
