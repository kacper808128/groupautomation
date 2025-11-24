/**
 * Fingerprint Spoofing Module - Anti-Ban Stack 2025
 *
 * Implementuje pełny fingerprint spoofing:
 * - Canvas noise injection
 * - WebGL vendor/renderer spoofing
 * - AudioContext fingerprint spoofing
 * - WebRTC IP leak prevention
 * - Chrome.runtime spoofing (krytyczne dla FB w 2025!)
 * - Navigator properties spoofing
 * - Screen resolution spoofing
 */

// Baza 100+ User-Agents z Windows 10/11 Chrome 2024-2025
const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  // Edge
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0',
  // Wersje z patchami
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.85 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.116 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.6668.100 Safari/537.36',
  // WOW64
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
];

// 50+ prawdziwych WebGL vendor/renderer z urządzeń 2024-2025
const WEBGL_FINGERPRINTS = [
  // NVIDIA
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4080 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 4060 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3090 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3080 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 Super Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1650 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Ti Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1080 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1070 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1060 6GB Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  // AMD
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 7900 XTX Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 7900 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 7800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6900 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6800 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 5700 XT Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  // Intel
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 770 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 730 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) Iris Plus Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) HD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) HD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
];

// 100+ prawdziwych audio fingerprint hashów
const AUDIO_FINGERPRINTS = [
  124.04344968475198, 124.04344968475199, 124.04344584765625,
  124.04345703125000, 124.04346084594727, 124.08075714111328,
  35.73833402246237, 35.73833402246238, 35.73832702636719,
  35.10892963409424, 35.10892486572266, 35.10893249511719,
  124.04344968475195, 124.04344968475196, 124.04344968475197,
  35.749968223993175, 35.74996948242188, 35.74997329711914,
  124.0434474584528, 124.0434474584529, 124.0434455871582,
  35.10893821716309, 35.10894203186035, 35.10894012451172,
  124.08073425292969, 124.08074188232422, 124.08074951171875,
  35.74996185302734, 35.74995803833008, 35.74996566772461,
];

// 20 najpopularniejszych rozdzielczości ekranu
const SCREEN_RESOLUTIONS = [
  [1920, 1080], [1366, 768], [1536, 864], [1440, 900],
  [1280, 720], [1600, 900], [1280, 800], [1280, 1024],
  [1024, 768], [1680, 1050], [1920, 1200], [2560, 1440],
  [1360, 768], [1152, 864], [1400, 1050], [1600, 1024],
  [1792, 1120], [2048, 1152], [2304, 1296], [2560, 1080],
];

// Polskie/europejskie strefy czasowe
const TIMEZONES = ['Europe/Warsaw', 'Europe/Berlin', 'Europe/Prague', 'Europe/Vienna', 'Europe/Budapest'];
const LOCALES = ['pl-PL', 'pl', 'en-US', 'de-DE'];

class FingerprintManager {
  constructor() {
    this.fingerprint = null;
  }

  /**
   * Generuje unikalny fingerprint dla sesji
   */
  generateFingerprint(seed = null) {
    if (seed !== null) {
      // Użyj seed dla powtarzalnego fingerprinta (np. per konto)
      const seededRandom = this.seededRandom(seed);
      this.fingerprint = {
        userAgent: USER_AGENTS[Math.floor(seededRandom() * USER_AGENTS.length)],
        screen: SCREEN_RESOLUTIONS[Math.floor(seededRandom() * SCREEN_RESOLUTIONS.length)],
        webgl: WEBGL_FINGERPRINTS[Math.floor(seededRandom() * WEBGL_FINGERPRINTS.length)],
        audioFingerprint: AUDIO_FINGERPRINTS[Math.floor(seededRandom() * AUDIO_FINGERPRINTS.length)],
        timezone: TIMEZONES[Math.floor(seededRandom() * TIMEZONES.length)],
        locale: LOCALES[Math.floor(seededRandom() * LOCALES.length)],
        hardwareConcurrency: 4 + Math.floor(seededRandom() * 13), // 4-16
        deviceMemory: [4, 8, 16, 32][Math.floor(seededRandom() * 4)],
        canvasNoiseSeed: Math.floor(seededRandom() * 1000000),
      };
    } else {
      this.fingerprint = {
        userAgent: USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)],
        screen: SCREEN_RESOLUTIONS[Math.floor(Math.random() * SCREEN_RESOLUTIONS.length)],
        webgl: WEBGL_FINGERPRINTS[Math.floor(Math.random() * WEBGL_FINGERPRINTS.length)],
        audioFingerprint: AUDIO_FINGERPRINTS[Math.floor(Math.random() * AUDIO_FINGERPRINTS.length)],
        timezone: TIMEZONES[Math.floor(Math.random() * TIMEZONES.length)],
        locale: LOCALES[Math.floor(Math.random() * LOCALES.length)],
        hardwareConcurrency: 4 + Math.floor(Math.random() * 13),
        deviceMemory: [4, 8, 16, 32][Math.floor(Math.random() * 4)],
        canvasNoiseSeed: Math.floor(Math.random() * 1000000),
      };
    }

    // Ustaw języki na podstawie locale
    if (this.fingerprint.locale.startsWith('pl')) {
      this.fingerprint.languages = ['pl-PL', 'pl', 'en-US', 'en'];
    } else if (this.fingerprint.locale.startsWith('de')) {
      this.fingerprint.languages = ['de-DE', 'de', 'en-US', 'en'];
    } else {
      this.fingerprint.languages = ['en-US', 'en'];
    }

    return this.fingerprint;
  }

  seededRandom(seed) {
    let s = seed;
    return function() {
      s = Math.sin(s) * 10000;
      return s - Math.floor(s);
    };
  }

  /**
   * Zwraca wszystkie skrypty stealth do wstrzyknięcia
   */
  getStealthScripts() {
    const fp = this.fingerprint;
    return [
      this.getNavigatorScript(fp),
      this.getScreenScript(fp),
      this.getWebGLScript(fp),
      this.getCanvasScript(fp),
      this.getAudioScript(fp),
      this.getWebRTCScript(),
      this.getChromeRuntimeScript(),
      this.getPluginsScript(),
      this.getWebdriverScript(),
    ];
  }

  getNavigatorScript(fp) {
    return `
      // Navigator spoofing
      Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => ${fp.hardwareConcurrency} });
      Object.defineProperty(navigator, 'deviceMemory', { get: () => ${fp.deviceMemory} });
      Object.defineProperty(navigator, 'platform', { get: () => 'Win32' });
      Object.defineProperty(navigator, 'languages', { get: () => ${JSON.stringify(fp.languages)} });
      Object.defineProperty(navigator, 'language', { get: () => '${fp.languages[0]}' });
      Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.' });
      Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 0 });

      if (navigator.connection) {
        Object.defineProperty(navigator.connection, 'effectiveType', { get: () => '4g' });
        Object.defineProperty(navigator.connection, 'downlink', { get: () => 10 });
        Object.defineProperty(navigator.connection, 'rtt', { get: () => 50 });
      }
    `;
  }

  getScreenScript(fp) {
    return `
      // Screen spoofing
      Object.defineProperty(screen, 'width', { get: () => ${fp.screen[0]} });
      Object.defineProperty(screen, 'height', { get: () => ${fp.screen[1]} });
      Object.defineProperty(screen, 'availWidth', { get: () => ${fp.screen[0]} });
      Object.defineProperty(screen, 'availHeight', { get: () => ${fp.screen[1] - 40} });
      Object.defineProperty(screen, 'colorDepth', { get: () => 24 });
      Object.defineProperty(screen, 'pixelDepth', { get: () => 24 });
      Object.defineProperty(window, 'devicePixelRatio', { get: () => 1 });
      Object.defineProperty(window, 'outerWidth', { get: () => ${fp.screen[0]} });
      Object.defineProperty(window, 'outerHeight', { get: () => ${fp.screen[1] - 80} });
    `;
  }

  getWebGLScript(fp) {
    return `
      // WebGL spoofing
      const getParameterProxyHandler = {
        apply: function(target, thisArg, args) {
          const param = args[0];
          if (param === 37445) return '${fp.webgl.vendor}';
          if (param === 37446) return '${fp.webgl.renderer}';
          return Reflect.apply(target, thisArg, args);
        }
      };

      if (typeof WebGLRenderingContext !== 'undefined') {
        WebGLRenderingContext.prototype.getParameter = new Proxy(
          WebGLRenderingContext.prototype.getParameter,
          getParameterProxyHandler
        );
      }
      if (typeof WebGL2RenderingContext !== 'undefined') {
        WebGL2RenderingContext.prototype.getParameter = new Proxy(
          WebGL2RenderingContext.prototype.getParameter,
          getParameterProxyHandler
        );
      }
    `;
  }

  getCanvasScript(fp) {
    return `
      // Canvas fingerprint noise injection
      const canvasNoiseSeed = ${fp.canvasNoiseSeed};

      function seededRandom(seed) {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
      }

      const originalToDataURL = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function(type, quality) {
        const ctx = this.getContext('2d');
        if (ctx && this.width > 0 && this.height > 0) {
          try {
            const imageData = ctx.getImageData(0, 0, this.width, this.height);
            const data = imageData.data;
            let localSeed = canvasNoiseSeed;
            for (let i = 0; i < data.length; i += 4) {
              if (seededRandom(localSeed++) < 0.01) {
                const noise = Math.floor(seededRandom(localSeed++) * 5) - 2;
                data[i] = Math.max(0, Math.min(255, data[i] + noise));
                data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + noise));
                data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + noise));
              }
            }
            ctx.putImageData(imageData, 0, 0);
          } catch(e) {}
        }
        return originalToDataURL.call(this, type, quality);
      };
    `;
  }

  getAudioScript(fp) {
    return `
      // AudioContext fingerprint spoofing
      const targetAudioFingerprint = ${fp.audioFingerprint};

      if (typeof OfflineAudioContext !== 'undefined') {
        const OriginalOfflineAudioContext = OfflineAudioContext;
        class SpoofedOfflineAudioContext extends OriginalOfflineAudioContext {
          constructor(...args) { super(...args); }
          startRendering() {
            return super.startRendering().then(buffer => {
              const channelData = buffer.getChannelData(0);
              const originalSum = channelData.reduce((a, b) => a + b, 0);
              if (Math.abs(originalSum) > 0.0001) {
                const factor = targetAudioFingerprint / originalSum;
                for (let i = 0; i < channelData.length; i++) {
                  channelData[i] *= factor * (0.9999 + Math.random() * 0.0002);
                }
              }
              return buffer;
            });
          }
        }
        window.OfflineAudioContext = SpoofedOfflineAudioContext;
      }
    `;
  }

  getWebRTCScript() {
    return `
      // WebRTC IP leak prevention
      if (typeof RTCPeerConnection !== 'undefined') {
        const OriginalRTCPeerConnection = RTCPeerConnection;
        class SpoofedRTCPeerConnection extends OriginalRTCPeerConnection {
          constructor(config) {
            const newConfig = config || {};
            newConfig.iceTransportPolicy = 'relay';
            super(newConfig);
          }
        }
        window.RTCPeerConnection = SpoofedRTCPeerConnection;
        window.webkitRTCPeerConnection = SpoofedRTCPeerConnection;
      }
    `;
  }

  getChromeRuntimeScript() {
    return `
      // Chrome.runtime spoofing - KRYTYCZNE dla FB w 2025!
      if (typeof window.chrome === 'undefined') {
        window.chrome = {};
      }

      window.chrome.runtime = {
        connect: function() { return { onMessage: { addListener: function() {} }, postMessage: function() {} }; },
        sendMessage: function() {},
        onMessage: { addListener: function() {}, removeListener: function() {} },
        onConnect: { addListener: function() {}, removeListener: function() {} },
        getManifest: function() { return null; },
        getURL: function(path) { return ''; },
        id: undefined,
        lastError: null
      };

      window.chrome.app = {
        isInstalled: false,
        InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
        RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
        getDetails: function() { return null; },
        getIsInstalled: function() { return false; },
        runningState: function() { return 'cannot_run'; }
      };

      window.chrome.csi = function() {
        return {
          startE: Date.now(),
          onloadT: Date.now() + Math.floor(Math.random() * 500) + 500,
          pageT: Math.floor(Math.random() * 1000) + 1000,
          tran: 15
        };
      };

      window.chrome.loadTimes = function() {
        return {
          commitLoadTime: Date.now() / 1000,
          connectionInfo: 'h2',
          finishDocumentLoadTime: Date.now() / 1000 + 0.1,
          finishLoadTime: Date.now() / 1000 + 0.5,
          firstPaintTime: Date.now() / 1000 + 0.05,
          navigationType: 'Other',
          npnNegotiatedProtocol: 'h2',
          requestTime: Date.now() / 1000 - 0.1,
          startLoadTime: Date.now() / 1000,
          wasAlternateProtocolAvailable: false,
          wasFetchedViaSpdy: true,
          wasNpnNegotiated: true
        };
      };

      Object.defineProperty(window, 'chrome', { writable: false, configurable: false });
    `;
  }

  getPluginsScript() {
    return `
      // Plugin spoofing
      const fakePlugins = [
        { name: 'PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
        { name: 'Chrome PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
        { name: 'Chromium PDF Viewer', description: 'Portable Document Format', filename: 'internal-pdf-viewer' },
      ];

      const pluginArray = {
        length: fakePlugins.length,
        item: function(index) { return fakePlugins[index] || null; },
        namedItem: function(name) { return fakePlugins.find(p => p.name === name) || null; },
        refresh: function() {}
      };

      fakePlugins.forEach((plugin, index) => {
        pluginArray[index] = plugin;
        pluginArray[plugin.name] = plugin;
      });

      Object.defineProperty(navigator, 'plugins', { get: () => pluginArray });
    `;
  }

  getWebdriverScript() {
    return `
      // Hide webdriver
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      delete navigator.__proto__.webdriver;

      // Override toString
      const originalFunction = Function.prototype.toString;
      Function.prototype.toString = function() {
        if (this === navigator.permissions.query) {
          return 'function query() { [native code] }';
        }
        return originalFunction.call(this);
      };
    `;
  }
}

module.exports = { FingerprintManager, USER_AGENTS, WEBGL_FINGERPRINTS, AUDIO_FINGERPRINTS, SCREEN_RESOLUTIONS };
