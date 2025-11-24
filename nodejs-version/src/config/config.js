module.exports = {
  // Konfiguracja środowiska
  environment: process.env.NODE_ENV || 'development',
  
  // Ustawienia automatyzacji
  automation: {
    // Domyślne opóźnienia (w milisekundach)
    delays: {
      betweenActions: {
        min: 1000,
        max: 3000
      },
      betweenPosts: {
        min: 60000,  // 60 sekund
        max: 120000  // 120 sekund
      },
      typing: {
        min: 50,
        max: 150
      }
    },
    
    // Wzorce zachowania
    humanBehavior: {
      pauseChance: 0.05,  // 5% szans na pauzę
      scrollChance: 0.3,   // 30% szans na scroll
      moveMouseChance: 0.2 // 20% szans na ruch myszką
    },
    
    // Limity bezpieczeństwa
    limits: {
      maxPostsPerHour: 10,
      maxPostsPerDay: 50,
      minDelayBetweenPosts: 30  // sekundy
    }
  },
  
  // Ustawienia proxy
  proxy: {
    enabled: false,
    host: '',
    port: '',
    username: '',
    password: '',
    timeout: 10000,  // 10 sekund
    retries: 3
  },
  
  // Ustawienia Puppeteer
  puppeteer: {
    headless: false,
    defaultViewport: {
      width: 1366,
      height: 768
    },
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--disable-blink-features=AutomationControlled'
    ]
  },
  
  // Detekcja CAPTCHA
  captcha: {
    enabled: true,
    autoPause: true,
    notifyUser: true,
    checkSelectors: [
      'iframe[src*="captcha"]',
      'div[id*="captcha"]',
      '#recaptcha',
      '.g-recaptcha'
    ]
  },
  
  // Ustawienia logowania
  logging: {
    enabled: true,
    maxLogs: 100,
    levels: ['info', 'success', 'warning', 'error']
  },
  
  // Powiadomienia
  notifications: {
    desktop: true,
    sound: false,
    onSuccess: true,
    onError: true,
    onCaptcha: true
  },
  
  // Harmonogram
  schedule: {
    enabled: true,
    types: ['once', 'daily', 'weekly', 'interval']
  },
  
  // Szyfrowanie
  encryption: {
    algorithm: 'aes-256-gcm',
    keyDerivation: 'pbkdf2'
  },
  
  // User Agents
  userAgents: [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0'
  ]
};
