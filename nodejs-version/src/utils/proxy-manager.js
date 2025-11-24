/**
 * Menedżer obsługi proxy
 */

class ProxyManager {
  constructor() {
    this.currentProxy = null;
    this.proxyList = [];
    this.failedProxies = new Set();
  }

  setProxy(host, port, username = null, password = null) {
    this.currentProxy = {
      host,
      port,
      username,
      password
    };
  }

  getProxyString() {
    if (!this.currentProxy) return null;
    
    const { host, port, username, password } = this.currentProxy;
    
    if (username && password) {
      return `http://${username}:${password}@${host}:${port}`;
    }
    
    return `http://${host}:${port}`;
  }

  addProxyToList(proxy) {
    this.proxyList.push(proxy);
  }

  getRandomProxy() {
    const availableProxies = this.proxyList.filter(
      proxy => !this.failedProxies.has(proxy)
    );
    
    if (availableProxies.length === 0) {
      return null;
    }
    
    const randomIndex = Math.floor(Math.random() * availableProxies.length);
    return availableProxies[randomIndex];
  }

  markProxyAsFailed(proxy) {
    this.failedProxies.add(proxy);
  }

  resetFailedProxies() {
    this.failedProxies.clear();
  }

  async testProxy(proxy) {
    // Implementacja testowania proxy
    // Można użyć axios lub innej biblioteki do testowania
    try {
      const axios = require('axios');
      const proxyConfig = {
        host: proxy.host,
        port: proxy.port
      };
      
      if (proxy.username && proxy.password) {
        proxyConfig.auth = {
          username: proxy.username,
          password: proxy.password
        };
      }
      
      const response = await axios.get('https://www.google.com', {
        proxy: proxyConfig,
        timeout: 10000
      });
      
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  rotateProxy() {
    const newProxy = this.getRandomProxy();
    if (newProxy) {
      this.setProxy(newProxy.host, newProxy.port, newProxy.username, newProxy.password);
      return true;
    }
    return false;
  }
}

module.exports = ProxyManager;
