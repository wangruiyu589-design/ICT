const {createPage} = require('../../utils/page');
const api = require('../../utils/api');

Page(createPage({
  data: {urlInput: api.getBaseUrl(), connectionError: '', showDevices: false, connected: false},
  onShow() {
    this.setData({urlInput: api.getBaseUrl(), connected: false});
  },
  onState() {
    this.setData({connected: true});
  },
  changeUrl(event) {
    this.setData({urlInput: event.detail.value, connectionError: ''});
  },
  toggleDevices() {
    this.setData({showDevices: !this.data.showDevices});
  },
  async saveConnection() {
    if (this.data.busy) return;
    let url;
    try { url = api.normalizeUrl(this.data.urlInput); }
    catch (error) { this.setData({connectionError: error.message}); return; }
    this._requestVersion += 1;
    api.setBaseUrl(url);
    this.setData({baseUrl: url, urlInput: url, busy: 'connect', error: '', connectionError: '', state: null, loading: true, connected: false});
    try {
      const state = await api.request('/api/state');
      this.applyState(state);
      wx.showToast({title: '连接成功', icon: 'success'});
    } catch (error) {
      this.setData({error: error.message, connectionError: error.message, connected: false});
    } finally {
      this.setData({loading: false, busy: ''});
    }
  },
  resetUrl() {
    this.setData({urlInput: api.DEFAULT_URL, connectionError: ''});
  },
  copyAddress() {
    wx.setClipboardData({data: this.data.baseUrl});
  }
}));
