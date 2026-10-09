const DEFAULT_URL = 'http://127.0.0.1:8787';

function getBaseUrl() {
  return wx.getStorageSync('lanshu_api_url') || DEFAULT_URL;
}

function normalizeUrl(value) {
  const url = String(value || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\/[a-zA-Z0-9.[\]:-]+(?:\/[a-zA-Z0-9._~!$&'()*+,;=:@%-]*)*$/.test(url)) {
    throw new Error('请输入完整的 HTTP 或 HTTPS 地址，例如 http://192.168.1.20:8787');
  }
  return url;
}

function setBaseUrl(value) {
  const url = normalizeUrl(value);
  wx.setStorageSync('lanshu_api_url', url);
  const app = getApp();
  app.globalData.state = null;
  app.globalData.connectedAt = null;
  return url;
}

function request(path, method = 'GET', data) {
  const requestBaseUrl = getBaseUrl();
  return new Promise((resolve, reject) => {
    wx.request({
      url: requestBaseUrl + path,
      method,
      data,
      timeout: 12000,
      header: {'content-type': 'application/json'},
      success(response) {
        if (getBaseUrl() !== requestBaseUrl) {
          reject(new Error('服务地址已切换，请重新同步'));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const body = response.data || {};
          const detail = typeof body.error === 'string' ? body.error : body.message;
          const error = new Error(detail || `服务响应异常（${response.statusCode}）`);
          error.statusCode = response.statusCode;
          reject(error);
          return;
        }
        const body = response.data;
        if (!body || !Array.isArray(body.zones) || !Array.isArray(body.plans) || !Array.isArray(body.alerts)) {
          reject(new Error('返回数据不符合灌溉服务格式，请检查 API 地址')); 
          return;
        }
        resolve(body);
      },
      fail(error) {
        const timeout = error.errMsg && error.errMsg.includes('timeout');
        reject(new Error(timeout ? '连接超时，请检查电脑服务和局域网连接' : '无法连接本地服务，请检查 API 地址、服务状态及域名校验设置'));
      }
    });
  });
}

function confirm(title, content, confirmText = '确认') {
  return new Promise(resolve => {
    wx.showModal({
      title,
      content,
      confirmText,
      confirmColor: '#1662e8',
      success: result => resolve(Boolean(result.confirm)),
      fail: () => resolve(false)
    });
  });
}

module.exports = {DEFAULT_URL, getBaseUrl, setBaseUrl, normalizeUrl, request, confirm};
