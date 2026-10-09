const api = require('./api');
const {prepareState} = require('./state');

function createPage(options) {
  const page = {
    ...options,
    data: {
      state: null,
      loading: true,
      error: '',
      busy: '',
      baseUrl: api.getBaseUrl(),
      ...options.data
    },
    onShow() {
      this._visible = true;
      this._requestVersion = this._requestVersion || 0;
      this.setData({baseUrl: api.getBaseUrl()});
      const cached = getApp().globalData.state;
      if (cached) this.applyState(cached);
      else this.setData({state: null, loading: true});
      this.syncState();
      this._pollTimer = setInterval(() => this.syncState(true), 15000);
      if (options.onShow) options.onShow.call(this);
    },
    onHide() {
      this._visible = false;
      clearInterval(this._pollTimer);
      if (options.onHide) options.onHide.call(this);
    },
    onUnload() {
      this._visible = false;
      clearInterval(this._pollTimer);
      if (options.onUnload) options.onUnload.call(this);
    },
    async onPullDownRefresh() {
      await this.syncState();
      wx.stopPullDownRefresh();
    },
    applyState(raw) {
      const cached = getApp().globalData.state;
      if (cached && new Date(cached.updatedAt).getTime() > new Date(raw.updatedAt).getTime()) raw = cached;
      getApp().globalData.state = raw;
      getApp().globalData.connectedAt = new Date().toISOString();
      const state = prepareState(raw);
      this.setData({state, loading: false, error: ''});
      if (options.onState) options.onState.call(this, state);
    },
    async syncState(silent = false) {
      if (this._fetching || this.data.busy) return false;
      this._fetching = true;
      const version = ++this._requestVersion;
      if (!silent && !this.data.state) this.setData({loading: true});
      try {
        const state = await api.request('/api/state');
        if (version === this._requestVersion) this.applyState(state);
        return true;
      } catch (error) {
        if (version === this._requestVersion) this.setData({error: error.message, loading: false});
        return false;
      } finally {
        this._fetching = false;
      }
    },
    async runAction(key, path, method, data, successMessage) {
      if (this.data.busy) return false;
      this._requestVersion += 1;
      this.setData({busy: key});
      try {
        const state = await api.request(path, method, data);
        this.applyState(state);
        if (successMessage) wx.showToast({title: successMessage, icon: 'success'});
        return true;
      } catch (error) {
        if (!error.statusCode) this.setData({error: error.message});
        if (Object.prototype.hasOwnProperty.call(this.data, 'formError')) this.setData({formError: error.message});
        wx.showToast({title: error.message, icon: 'none', duration: 3000});
        return false;
      } finally {
        this.setData({busy: ''});
      }
    },
    retryConnection() {
      this.syncState();
    },
    openConnectionSettings() {
      wx.switchTab({url: '/pages/profile/index'});
    },
    noop() {}
  };
  return page;
}

module.exports = {createPage};
