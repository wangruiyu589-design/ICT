const {createPage} = require('../../utils/page');

Page(createPage({
  data: {greeting: '看见水，读懂田'},
  onShow() {
    const hour = new Date().getHours();
    this.setData({greeting: hour < 11 ? '早上好，让每一滴水恰到好处' : hour < 18 ? '午后好，田间的一切尽在掌握' : '晚上好，安心守护每一寸田'});
  },
  openIrrigation() {
    wx.switchTab({url: '/pages/irrigation/index'});
  },
  openPlans() {
    wx.switchTab({url: '/pages/plans/index'});
  },
  openAlerts() {
    wx.switchTab({url: '/pages/alerts/index'});
  }
}));
