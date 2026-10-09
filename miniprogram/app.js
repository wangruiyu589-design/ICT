App({
  globalData: {
    state: null,
    connectedAt: null
  },
  onLaunch() {
    if (!wx.getStorageSync('lanshu_api_url')) {
      wx.setStorageSync('lanshu_api_url', 'http://127.0.0.1:8787');
    }
  }
});
