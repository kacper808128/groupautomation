/**
 * Automation Manager - Anti-Ban Stack 2025
 *
 * ZMIANY W TEJ WERSJI:
 * - Pełny fingerprint spoofing (Canvas, WebGL, Audio, WebRTC, Chrome.runtime)
 * - Bezier curves dla ruchu myszki
 * - Delaye 4-18 minut między grupami (nie 60-90 sekund!)
 * - Limity aktywności i tryb warming
 * - Auto-pauza przy zbyt wielu banach
 */

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const CryptoJS = require('crypto-js');
const EventEmitter = require('events');
const {
  randomDelay,
  randomTyping,
  getRandomUserAgent,
  HumanMouse,
  HumanTyping,
  HumanScroll,
  boundedGaussian,
  engageWithGroup,
  postPublishEngagement,
  performHumanError,
} = require('../utils/human-behavior');
const ProxyManager = require('../utils/proxy-manager');
const { FingerprintManager } = require('../utils/fingerprint-manager');
const { ActivityLimiter, LIMITS } = require('../utils/activity-limiter');

puppeteer.use(StealthPlugin());

class AutomationManager extends EventEmitter {
  constructor(store) {
    super();
    this.store = store;
    this.browser = null;
    this.page = null;
    this.isRunning = false;
    this.isPaused = false;
    this.currentTask = null;
    this.logs = [];
    this.proxyManager = new ProxyManager();
    this.encryptionKey = 'fb-automation-secret-key-2024';

    // Anti-Ban Stack 2025
    this.fingerprintManager = new FingerprintManager();
    this.activityLimiter = new ActivityLimiter(store);
    this.postsSinceHumanError = 0;
    this.currentFingerprint = null;
  }

  findChromePath() {
    const fs = require('fs');
    const os = require('os');
    const path = require('path');
    
    // Możliwe ścieżki Chrome/Chromium na różnych systemach
    const possiblePaths = [];
    
    if (os.platform() === 'darwin') { // macOS
      possiblePaths.push(
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
        '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
        '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'
      );
    } else if (os.platform() === 'win32') { // Windows
      const programFiles = process.env['PROGRAMFILES'];
      const programFilesX86 = process.env['PROGRAMFILES(X86)'];
      const localAppData = process.env['LOCALAPPDATA'];
      
      possiblePaths.push(
        `${programFiles}\\Google\\Chrome\\Application\\chrome.exe`,
        `${programFilesX86}\\Google\\Chrome\\Application\\chrome.exe`,
        `${localAppData}\\Google\\Chrome\\Application\\chrome.exe`,
        `${programFiles}\\BraveSoftware\\Brave-Browser\\Application\\brave.exe`
      );
    } else { // Linux
      possiblePaths.push(
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/brave-browser',
        '/snap/bin/chromium'
      );
    }
    
    // Sprawdź która ścieżka istnieje
    for (const chromePath of possiblePaths) {
      if (fs.existsSync(chromePath)) {
        this.addLog(`Znaleziono przeglądarkę: ${chromePath}`, 'success');
        return chromePath;
      }
    }
    
    // Jeśli nie znaleziono, zwróć undefined (Puppeteer użyje swojego Chromium)
    this.addLog('Nie znaleziono lokalnej przeglądarki, używam Puppeteer Chromium', 'info');
    return undefined;
  }

  async saveCredentials(credentials) {
    const encrypted = {
      email: CryptoJS.AES.encrypt(credentials.email, this.encryptionKey).toString(),
      password: CryptoJS.AES.encrypt(credentials.password, this.encryptionKey).toString()
    };
    this.store.set('credentials', encrypted);
    this.addLog('Dane logowania zapisane bezpiecznie', 'success');
  }

  async getCredentials() {
    const encrypted = this.store.get('credentials');
    if (!encrypted) return null;

    try {
      const email = CryptoJS.AES.decrypt(encrypted.email, this.encryptionKey).toString(CryptoJS.enc.Utf8);
      const password = CryptoJS.AES.decrypt(encrypted.password, this.encryptionKey).toString(CryptoJS.enc.Utf8);
      return { email, password };
    } catch (error) {
      this.addLog('Błąd odszyfrowywania danych logowania', 'error');
      return null;
    }
  }

  async initBrowser() {
    const proxyConfig = this.store.get('proxy', { enabled: false });

    const executablePath = this.findChromePath();

    // Wygeneruj unikalny fingerprint dla tej sesji
    this.currentFingerprint = this.fingerprintManager.generateFingerprint();
    this.addLog(`🔐 Wygenerowano fingerprint: ${this.currentFingerprint.screen.width}x${this.currentFingerprint.screen.height}, GPU: ${this.currentFingerprint.webgl.renderer.substring(0, 30)}...`, 'info');

    const launchOptions = {
      headless: false,
      executablePath: executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled',
        `--window-size=${this.currentFingerprint.screen.width},${this.currentFingerprint.screen.height}`,
        '--start-maximized',
        '--disable-infobars',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
        `--user-agent=${this.currentFingerprint.userAgent}`,
        // WebRTC leak prevention
        '--disable-webrtc-encryption',
        '--disable-webrtc-hw-encoding',
        '--disable-webrtc-hw-decoding',
        '--enforce-webrtc-ip-permission-check'
      ]
    };

    if (proxyConfig.enabled && proxyConfig.host && proxyConfig.port) {
      launchOptions.args.push(`--proxy-server=http://${proxyConfig.host}:${proxyConfig.port}`);
      this.addLog(`Używam proxy: ${proxyConfig.host}:${proxyConfig.port}`, 'info');
    }

    this.browser = await puppeteer.launch(launchOptions);
    this.page = await this.browser.newPage();

    // Wstrzyknij skrypty stealth PRZED jakąkolwiek nawigacją
    await this.injectStealthScripts();

    if (proxyConfig.enabled && proxyConfig.username && proxyConfig.password) {
      await this.page.authenticate({
        username: proxyConfig.username,
        password: proxyConfig.password
      });
      this.addLog('Autoryzacja proxy skonfigurowana', 'info');
    }

    await this.page.setViewport({
      width: this.currentFingerprint.screen.width,
      height: this.currentFingerprint.screen.height
    });

    // Załaduj zapisane cookies jeśli istnieją
    await this.loadCookies();

    this.addLog('✅ Przeglądarka zainicjalizowana z fingerprint spoofing', 'success');
  }

  // Wstrzykuje skrypty stealth do strony
  async injectStealthScripts() {
    const stealthScripts = this.fingerprintManager.getStealthScripts(this.currentFingerprint);

    // Wstrzyknij wszystkie skrypty przed nawigacją
    for (const script of stealthScripts) {
      await this.page.evaluateOnNewDocument(script);
    }

    this.addLog('🛡️ Wstrzyknięto skrypty stealth (Canvas, WebGL, Audio, WebRTC, Chrome.runtime)', 'info');
  }

  async saveCookies() {
    try {
      const cookies = await this.page.cookies();
      this.store.set('cookies', cookies);
      this.addLog('Sesja zapisana (cookies)', 'success');
    } catch (error) {
      this.addLog(`Błąd zapisu sesji: ${error.message}`, 'warning');
    }
  }

  async loadCookies() {
    try {
      const cookies = this.store.get('cookies');
      if (cookies && cookies.length > 0) {
        await this.page.setCookie(...cookies);
        this.addLog('Załadowano zapisaną sesję', 'success');
        return true;
      }
      return false;
    } catch (error) {
      this.addLog(`Nie można załadować sesji: ${error.message}`, 'info');
      return false;
    }
  }

  async clearCookies() {
    this.store.delete('cookies');
    this.addLog('Sesja wyczyszczona', 'info');
  }

  async testLogin(credentials) {
    try {
      this.addLog('Rozpoczynam test logowania...', 'info');
      
      await this.initBrowser();
      await this.page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2' });
      await randomDelay(2000, 4000);

      // Wpisywanie emaila
      const emailSelector = '#email';
      await this.page.waitForSelector(emailSelector, { timeout: 10000 });
      await randomTyping(this.page, emailSelector, credentials.email);
      await randomDelay(1000, 2000);

      // Wpisywanie hasła
      const passwordSelector = '#pass';
      await randomTyping(this.page, passwordSelector, credentials.password);
      await randomDelay(1000, 2000);

      // Kliknięcie przycisku logowania
      const loginButton = 'button[name="login"]';
      await this.page.click(loginButton);
      await randomDelay(3000, 5000);

      // Sprawdzenie czy zalogowano
      await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      
      const currentUrl = this.page.url();
      
      // Sprawdzenie CAPTCHA
      if (currentUrl.includes('checkpoint') || currentUrl.includes('captcha')) {
        this.emit('captcha-detected');
        this.addLog('Wykryto CAPTCHA - wymagana weryfikacja', 'warning');
        await this.closeBrowser();
        return { success: false, error: 'CAPTCHA detected', requiresCaptcha: true };
      }

      // Sprawdzenie czy jesteśmy zalogowani
      if (currentUrl.includes('facebook.com') && !currentUrl.includes('login')) {
        this.addLog('Logowanie zakończone sukcesem!', 'success');
        await this.closeBrowser();
        return { success: true };
      }

      this.addLog('Logowanie nie powiodło się', 'error');
      await this.closeBrowser();
      return { success: false, error: 'Login failed' };

    } catch (error) {
      this.addLog(`Błąd podczas testu logowania: ${error.message}`, 'error');
      await this.closeBrowser();
      return { success: false, error: error.message };
    }
  }

  async startPosting(config) {
    if (this.isRunning) {
      throw new Error('Automatyzacja jest już uruchomiona');
    }

    try {
      this.isRunning = true;
      this.isPaused = false;
      this.currentTask = config;
      this.emit('status-change', this.getStatus());
      
      this.addLog('Rozpoczynam automatyzację postowania...', 'info');
      
      // Inicjalizuj przeglądarkę
      await this.initBrowser();
      
      // Załaduj cookies jeśli są podane
      if (config.cookies) {
        try {
          const cookies = JSON.parse(config.cookies);
          this.addLog(`Ładuję ${cookies.length} cookies...`, 'info');
          
          // Normalizuj cookies
          const normalizedCookies = cookies.map(cookie => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path || '/',
            secure: cookie.secure !== undefined ? cookie.secure : false,
            httpOnly: cookie.httpOnly !== undefined ? cookie.httpOnly : false,
            sameSite: cookie.sameSite === 'no_restriction' ? 'None' : 
                     cookie.sameSite === 'lax' ? 'Lax' : 
                     cookie.sameSite === 'strict' ? 'Strict' : 'None',
            expires: cookie.expirationDate ? cookie.expirationDate : undefined
          }));
          
          await this.page.setCookie(...normalizedCookies);
          this.addLog('✅ Cookies załadowane', 'success');
          
          // Przejdź na Facebook żeby cookies zadziałały
          await this.page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2' });
          await randomDelay(3000, 5000);
          
          const currentUrl = this.page.url();
          if (currentUrl.includes('facebook.com') && !currentUrl.includes('login')) {
            this.addLog('✅ Zalogowano przez cookies!', 'success');
          } else {
            throw new Error('Cookies nie zadziałały - zaloguj się ręcznie w przeglądarce');
          }
          
        } catch (cookieError) {
          this.addLog(`⚠️ Błąd cookies: ${cookieError.message}`, 'warning');
          this.addLog('Spróbuj zalogować się ręcznie w przeglądarce...', 'info');
          throw new Error(`Błąd cookies: ${cookieError.message}`);
        }
      } else {
        // Tradycyjne logowanie
        const credentials = await this.getCredentials();
        if (!credentials) {
          throw new Error('Brak zapisanych danych logowania ani cookies');
        }
        await this.login(credentials);
      }
      
      // Pobierz accountId z cookies lub użyj domyślnego
      const accountId = config.accountId || 'default';

      // Główna pętla postowania
      for (let i = 0; i < config.groups.length; i++) {
        const group = config.groups[i];
        if (!this.isRunning) break;

        while (this.isPaused) {
          await randomDelay(1000, 2000);
        }

        // ANTY-BAN: Sprawdź czy powinniśmy zatrzymać automatyzację
        const pauseCheck = this.activityLimiter.shouldPauseAutomation();
        if (pauseCheck.shouldPause) {
          this.addLog(`🛑 AUTO-PAUZA: ${pauseCheck.reason}`, 'error');
          this.emit('auto-pause', pauseCheck);
          this.isRunning = false;
          break;
        }

        // ANTY-BAN: Sprawdź limity aktywności
        const canPostResult = this.activityLimiter.canPost(accountId);
        if (!canPostResult.allowed) {
          this.addLog(`⏸️ Limit osiągnięty: ${canPostResult.reason}`, 'warning');
          break;
        }

        // Wyświetl statystyki przed postem
        const stats = this.activityLimiter.getStats(accountId);
        this.addLog(`📊 Posty dziś: ${stats.today.posts}/${stats.today.maxPosts}, Akcje: ${stats.today.totalActions}/${stats.today.maxActions}`, 'info');

        await this.postToGroup(group, config.message);

        // Zapisz akcję postu
        this.activityLimiter.recordAction(accountId, 'post');

        // ANTY-BAN: Delay 4-18 minut między grupami (zamiast 60-90 sekund!)
        if (i < config.groups.length - 1) {
          const delayMs = this.activityLimiter.getDelayBetweenGroups();
          const delayMinutes = Math.round(delayMs / 60000 * 10) / 10;
          this.addLog(`⏳ Czekam ${delayMinutes} minut przed następną grupą...`, 'info');
          await randomDelay(delayMs * 0.9, delayMs * 1.1); // +/- 10% variacja
        }
      }

      this.addLog('Automatyzacja zakończona pomyślnie!', 'success');
      await this.closeBrowser();
      this.isRunning = false;
      this.emit('status-change', this.getStatus());
      
      return { success: true };

    } catch (error) {
      this.addLog(`Błąd podczas postowania: ${error.message}`, 'error');
      this.emit('error', error);
      await this.closeBrowser();
      this.isRunning = false;
      this.emit('status-change', this.getStatus());
      throw error;
    }
  }

  async startPostingFromCSV(config) {
    if (this.isRunning) {
      throw new Error('Automatyzacja jest już uruchomiona');
    }

    try {
      this.isRunning = true;
      this.isPaused = false;
      this.currentTask = config;
      this.emit('status-change', this.getStatus());
      
      this.addLog(`Rozpoczynam automatyzację z CSV (${config.posts.length} postów)...`, 'info');
      
      // Inicjalizuj przeglądarkę
      await this.initBrowser();
      
      // Załaduj cookies jeśli są podane
      if (config.cookies) {
        try {
          const cookies = JSON.parse(config.cookies);
          this.addLog(`Ładuję ${cookies.length} cookies...`, 'info');
          
          const normalizedCookies = cookies.map(cookie => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path || '/',
            secure: cookie.secure !== undefined ? cookie.secure : false,
            httpOnly: cookie.httpOnly !== undefined ? cookie.httpOnly : false,
            sameSite: cookie.sameSite === 'no_restriction' ? 'None' : 
                     cookie.sameSite === 'lax' ? 'Lax' : 
                     cookie.sameSite === 'strict' ? 'Strict' : 'None',
            expires: cookie.expirationDate ? cookie.expirationDate : undefined
          }));
          
          await this.page.setCookie(...normalizedCookies);
          this.addLog('✅ Cookies załadowane', 'success');
          
          await this.page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2' });
          await randomDelay(3000, 5000);
          
          const currentUrl = this.page.url();
          if (currentUrl.includes('facebook.com') && !currentUrl.includes('login')) {
            this.addLog('✅ Zalogowano przez cookies!', 'success');
          } else {
            throw new Error('Cookies nie zadziałały');
          }
          
        } catch (cookieError) {
          this.addLog(`⚠️ Błąd cookies: ${cookieError.message}`, 'warning');
          throw new Error(`Błąd cookies: ${cookieError.message}`);
        }
      } else {
        const credentials = await this.getCredentials();
        if (!credentials) {
          throw new Error('Brak zapisanych danych logowania ani cookies');
        }
        await this.login(credentials);
      }
      
      // Pobierz accountId z cookies lub użyj domyślnego
      const accountId = config.accountId || 'default';

      // Główna pętla postowania z CSV
      for (let i = 0; i < config.posts.length; i++) {
        if (!this.isRunning) break;

        while (this.isPaused) {
          await randomDelay(1000, 2000);
        }

        // ANTY-BAN: Sprawdź czy powinniśmy zatrzymać automatyzację
        const pauseCheck = this.activityLimiter.shouldPauseAutomation();
        if (pauseCheck.shouldPause) {
          this.addLog(`🛑 AUTO-PAUZA: ${pauseCheck.reason}`, 'error');
          this.emit('auto-pause', pauseCheck);
          this.isRunning = false;
          break;
        }

        // ANTY-BAN: Sprawdź limity aktywności
        const canPostResult = this.activityLimiter.canPost(accountId);
        if (!canPostResult.allowed) {
          this.addLog(`⏸️ Limit osiągnięty: ${canPostResult.reason}`, 'warning');
          break;
        }

        // Wyświetl statystyki przed postem
        const stats = this.activityLimiter.getStats(accountId);
        this.addLog(`📊 Posty dziś: ${stats.today.posts}/${stats.today.maxPosts}, Akcje: ${stats.today.totalActions}/${stats.today.maxActions}`, 'info');

        const post = config.posts[i];
        this.addLog(`\n[${i + 1}/${config.posts.length}] Postuję do: ${post.groupLink}`, 'info');

        await this.postToGroup(post.groupLink, post.postCopy);

        // Zapisz akcję postu
        this.activityLimiter.recordAction(accountId, 'post');

        // ANTY-BAN: Delay 4-18 minut między grupami (zamiast 60-90 sekund!)
        if (i < config.posts.length - 1) {
          const delayMs = this.activityLimiter.getDelayBetweenGroups();
          const delayMinutes = Math.round(delayMs / 60000 * 10) / 10;
          this.addLog(`⏳ Czekam ${delayMinutes} minut przed następną grupą...`, 'info');
          await randomDelay(delayMs * 0.9, delayMs * 1.1);
        }
      }

      this.addLog(`\n✅ Zakończono postowanie z CSV! (${config.posts.length} postów)`, 'success');
      await this.closeBrowser();
      this.isRunning = false;
      this.emit('status-change', this.getStatus());
      
      return { success: true };

    } catch (error) {
      this.addLog(`❌ Błąd podczas postowania z CSV: ${error.message}`, 'error');
      this.emit('error', error);
      await this.closeBrowser();
      this.isRunning = false;
      this.emit('status-change', this.getStatus());
      throw error;
    }
  }

  async startPostingMultiAccount(config) {
    const { posts, accounts, delayBetweenPosts } = config;
    
    this.addLog(`🚀 Rozpoczynam postowanie wielokontowe`, 'info');
    this.addLog(`📊 Konta: ${accounts.length}`, 'info');
    this.addLog(`📝 Posty: ${posts.length}`, 'info');
    
    // Podziel posty równomiernie między konta
    const postsPerAccount = Math.ceil(posts.length / accounts.length);
    const accountTasks = [];
    
    for (let i = 0; i < accounts.length; i++) {
      const startIndex = i * postsPerAccount;
      const endIndex = Math.min(startIndex + postsPerAccount, posts.length);
      const accountPosts = posts.slice(startIndex, endIndex);
      
      if (accountPosts.length > 0) {
        accountTasks.push({
          accountIndex: i + 1,
          cookies: accounts[i].cookies,
          posts: accountPosts
        });
        
        this.addLog(`🔹 Konto #${i + 1}: ${accountPosts.length} postów (${startIndex + 1}-${endIndex})`, 'info');
      }
    }
    
    this.addLog(`\n✅ Podział zakończony, uruchamiam ${accountTasks.length} instancji...`, 'success');
    
    // WAŻNE: Każde konto uruchamia się w osobnym procesie (nie współdzieli this)
    const promises = accountTasks.map(task => 
      this.runAccountTaskIsolated(task, delayBetweenPosts)
    );
    
    try {
      await Promise.all(promises);
      this.addLog(`\n🎉 Wszystkie konta zakończyły postowanie!`, 'success');
      return { success: true };
    } catch (error) {
      this.addLog(`\n❌ Błąd w jednym z kont: ${error.message}`, 'error');
      throw error;
    }
  }

  async runAccountTaskIsolated(task, delayBetweenPosts) {
    const { accountIndex, cookies, posts } = task;
    const puppeteer = require('puppeteer');
    
    this.addLog(`\n[Konto #${accountIndex}] Inicjalizuję przeglądarkę...`, 'info');
    
    // Znajdź Chrome
    const executablePath = this.findChromePath();
    
    // Uruchom osobną instancję przeglądarki dla tego konta
    const browser = await puppeteer.launch({
      headless: false,
      executablePath: executablePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1366,768',
        '--start-maximized',
        `--window-position=${(accountIndex - 1) * 50},${(accountIndex - 1) * 50}`, // Przesuń okna
        '--disable-infobars',
        '--disable-dev-shm-usage',
        '--no-first-run',
        '--no-zygote',
        `--user-agent=${this.getRandomUserAgent()}`
      ]
    });
    
    const page = await browser.newPage();
    await page.setViewport({ width: 1366, height: 768 });
    
    try {
      // Załaduj cookies
      const parsedCookies = JSON.parse(cookies);
      const normalizedCookies = parsedCookies.map(cookie => ({
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path || '/',
        secure: cookie.secure !== undefined ? cookie.secure : false,
        httpOnly: cookie.httpOnly !== undefined ? cookie.httpOnly : false,
        sameSite: cookie.sameSite === 'no_restriction' ? 'None' : 
                 cookie.sameSite === 'lax' ? 'Lax' : 
                 cookie.sameSite === 'strict' ? 'Strict' : 'None',
        expires: cookie.expirationDate ? cookie.expirationDate : undefined
      }));
      
      await page.setCookie(...normalizedCookies);
      this.addLog(`[Konto #${accountIndex}] ✅ Cookies załadowane`, 'success');
      
      // Przejdź na Facebook
      await page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2' });
      await randomDelay(3000, 5000);
      
      const currentUrl = page.url();
      if (currentUrl.includes('facebook.com') && !currentUrl.includes('login')) {
        this.addLog(`[Konto #${accountIndex}] ✅ Zalogowano!`, 'success');
      } else {
        throw new Error(`Konto #${accountIndex}: Cookies nie zadziałały`);
      }
      
      // Postuj do każdej grupy - INLINE kod z postToGroup (bez współdzielenia this.page)
      for (let i = 0; i < posts.length; i++) {
        const post = posts[i];
        this.addLog(`[Konto #${accountIndex}] [${i + 1}/${posts.length}] Postuję do: ${post.groupLink}`, 'info');
        
        // INLINE kod postowania (nie używa this.page)
        await this.postToGroupInline(page, post.groupLink, post.postCopy, accountIndex);
        
        if (i < posts.length - 1) {
          await randomDelay(delayBetweenPosts * 1000, (delayBetweenPosts + 30) * 1000);
        }
      }
      
      this.addLog(`[Konto #${accountIndex}] ✅ Zakończono postowanie (${posts.length} postów)`, 'success');
      
    } catch (error) {
      this.addLog(`[Konto #${accountIndex}] ❌ Błąd: ${error.message}`, 'error');
      throw error;
    } finally {
      await browser.close();
    }
  }

  async postToGroupInline(page, groupUrl, message, accountIndex) {
    // KOPIA postToGroup ale używa page zamiast this.page i dodaje [Konto #X] do logów
    
    try {
      this.addLog(`[Konto #${accountIndex}] Postuję do grupy: ${groupUrl}`, 'info');
      
      await page.goto(groupUrl, { waitUntil: 'networkidle2' });
      await randomDelay(5000, 7000);
      
      const currentUrl = page.url();
      if (!currentUrl.includes('facebook.com/groups')) {
        throw new Error('Nie udało się przejść do grupy');
      }

      // Scrolluj na górę
      await page.evaluate(() => window.scrollTo(0, 0));
      await randomDelay(2000, 3000);

      this.addLog(`[Konto #${accountIndex}] Szukam przycisku do tworzenia posta...`, 'info');

      // METODA 1: Znajdź przycisk "Napisz coś..."
      const createPostButton = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
        
        for (const button of buttons) {
          const text = button.innerText || '';
          const ariaLabel = button.getAttribute('aria-label') || '';
          
          const hasCreateText = 
            text.toLowerCase().includes('napisz coś') ||
            text.toLowerCase().includes('write something') ||
            text.toLowerCase().includes('what\'s on your mind') ||
            text.toLowerCase().includes('co słychać') ||
            ariaLabel.toLowerCase().includes('napisz') ||
            ariaLabel.toLowerCase().includes('write');
          
          const isNotComment = 
            !text.toLowerCase().includes('komentarz') &&
            !text.toLowerCase().includes('comment') &&
            !ariaLabel.toLowerCase().includes('komentarz') &&
            !ariaLabel.toLowerCase().includes('comment');
          
          if (hasCreateText && isNotComment) {
            const rect = button.getBoundingClientRect();
            if (rect.top < window.innerHeight / 2) {
              button.setAttribute('data-post-create-button', 'true');
              return true;
            }
          }
        }
        return false;
      });

      if (createPostButton) {
        await page.evaluate(() => {
          const button = document.querySelector('[data-post-create-button="true"]');
          if (button) button.click();
        });
        this.addLog(`[Konto #${accountIndex}] ✅ Kliknięto przycisk tworzenia posta`, 'success');
      } else {
        this.addLog(`[Konto #${accountIndex}] Próbuję alternatywnej metody (XPath)...`, 'info');
        
        const clicked = await page.evaluate(() => {
          const getElementByXpath = (xpath) => {
            return document.evaluate(
              xpath, 
              document, 
              null, 
              XPathResult.FIRST_ORDERED_NODE_TYPE, 
              null
            ).singleNodeValue;
          };
          
          const xpaths = [
            "//span[contains(text(), 'Napisz coś')]",
            "//span[contains(text(), 'Write something')]",
            "//div[contains(text(), 'Napisz coś')]",
            "//div[contains(text(), 'Write something')]"
          ];
          
          for (const xpath of xpaths) {
            const element = getElementByXpath(xpath);
            if (element) {
              let parent = element.parentElement;
              let depth = 0;
              while (parent && depth < 10) {
                if (parent.getAttribute('role') === 'button') {
                  parent.click();
                  return true;
                }
                parent = parent.parentElement;
                depth++;
              }
            }
          }
          return false;
        });
        
        if (clicked) {
          this.addLog(`[Konto #${accountIndex}] ✅ Kliknięto przycisk (XPath)`, 'success');
        } else {
          this.addLog(`[Konto #${accountIndex}] Nie znaleziono przycisku, próbuję klawiaturą...`, 'warning');
          await page.keyboard.press('Tab');
          await randomDelay(500, 1000);
          await page.keyboard.press('Enter');
        }
      }

      // Poczekaj na modal
      this.addLog(`[Konto #${accountIndex}] Czekam na otwarcie okna...`, 'info');
      await randomDelay(4000, 6000);

      // Znajdź pole tekstowe
      this.addLog(`[Konto #${accountIndex}] Szukam pola tekstowego...`, 'info');
      
      const textAreaSelector = 'div[contenteditable="true"][role="textbox"]';
      await page.waitForSelector(textAreaSelector, { timeout: 15000 });
      
      // Znajdź widoczne pole w modalu
      const textAreaFound = await page.evaluate(() => {
        const textAreas = Array.from(document.querySelectorAll('div[contenteditable="true"][role="textbox"]'));
        
        for (const area of textAreas) {
          const rect = area.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0 && 
                          rect.top >= 0 && rect.top < window.innerHeight;
          
          if (isVisible) {
            area.setAttribute('data-post-textarea', 'true');
            return true;
          }
        }
        return false;
      });
      
      if (!textAreaFound) {
        throw new Error('Nie znaleziono pola tekstowego');
      }
      
      // Kliknij w pole i upewnij się że jest aktywne
      this.addLog(`[Konto #${accountIndex}] Aktywuję pole tekstowe...`, 'info');
      
      const fieldActivated = await page.evaluate(() => {
        const area = document.querySelector('[data-post-textarea="true"]');
        if (!area) return false;
        
        area.click();
        area.focus();
        
        const rect = area.getBoundingClientRect();
        const computedStyle = window.getComputedStyle(area);
        
        return {
          visible: rect.width > 0 && rect.height > 0,
          focused: document.activeElement === area,
          editable: area.getAttribute('contenteditable') === 'true'
        };
      });
      
      this.addLog(`[Konto #${accountIndex}] Pole: widoczne=${fieldActivated.visible}, focus=${fieldActivated.focused}, editable=${fieldActivated.editable}`, 'info');
      
      await randomDelay(1000, 1500);
      
      this.addLog(`[Konto #${accountIndex}] Wklejam treść posta...`, 'info');
      
      // keyboard.type() z Shift+Enter dla wieloliniowego tekstu
      try {
        await page.evaluate(() => {
          const area = document.querySelector('[data-post-textarea="true"]');
          if (area) {
            area.focus();
            area.click();
          }
        });
        
        await randomDelay(500, 1000);
        
        // Wpisz tekst używając keyboard - po linii
        const lines = message.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          if (line.length > 0) {
            await page.keyboard.type(line, { delay: 50 });
          }
          
          // Jeśli nie ostatnia linia, dodaj nową linię (Shift+Enter)
          if (i < lines.length - 1) {
            await page.keyboard.down('Shift');
            await page.keyboard.press('Enter');
            await page.keyboard.up('Shift');
            await randomDelay(100, 200);
          }
        }
        
        this.addLog(`[Konto #${accountIndex}] ✅ Wpisano ${message.length} znaków`, 'success');
        
        // Weryfikuj że tekst jest w polu
        await randomDelay(1000, 1500);
        
        const verifyText = await page.evaluate(() => {
          const area = document.querySelector('[data-post-textarea="true"]');
          if (!area) return '';
          return (area.textContent || area.innerText || '').trim();
        });
        
        if (verifyText.length < 10) {
          throw new Error(`Tekst nie pojawił się w polu - tylko ${verifyText.length} znaków`);
        }
        
        this.addLog(`[Konto #${accountIndex}] ✅ Weryfikacja OK: ${verifyText.length} znaków w polu`, 'success');
        
      } catch (error) {
        this.addLog(`[Konto #${accountIndex}] ❌ Błąd wpisywania: ${error.message}`, 'error');
        throw new Error(`Nie udało się wpisać treści: ${error.message}`);
      }
      
      // Czekaj 10 sekund
      this.addLog(`[Konto #${accountIndex}] Czekam 10 sekund...`, 'info');
      await randomDelay(10000, 10500);

      // Znajdź przycisk Opublikuj
      this.addLog(`[Konto #${accountIndex}] Szukam przycisku publikacji...`, 'info');
      
      const publishClicked = await page.evaluate(() => {
        const getElementByXpath = (xpath) => {
          return document.evaluate(
            xpath, 
            document, 
            null, 
            XPathResult.FIRST_ORDERED_NODE_TYPE, 
            null
          ).singleNodeValue;
        };
        
        // Spróbuj XPath najpierw
        const xpaths = [
          "//span[text()='Opublikuj']",
          "//span[text()='Post']",
          "//div[text()='Opublikuj']",
          "//div[text()='Post']"
        ];
        
        for (const xpath of xpaths) {
          const element = getElementByXpath(xpath);
          if (element) {
            let parent = element.parentElement;
            let depth = 0;
            while (parent && depth < 10) {
              if (parent.getAttribute('role') === 'button') {
                parent.click();
                return true;
              }
              parent = parent.parentElement;
              depth++;
            }
          }
        }
        
        // Fallback - znajdź przycisk w modalu
        const modal = document.querySelector('[role="dialog"]');
        if (modal) {
          const buttons = Array.from(modal.querySelectorAll('div[role="button"]'));
          for (const btn of buttons) {
            const text = btn.innerText || '';
            const ariaLabel = btn.getAttribute('aria-label') || '';
            
            if (text.includes('Opublikuj') || text.includes('Post') ||
                ariaLabel.includes('Opublikuj') || ariaLabel.includes('Post')) {
              btn.click();
              return true;
            }
          }
        }
        
        return false;
      });
      
      if (!publishClicked) {
        throw new Error('Nie znaleziono przycisku Opublikuj');
      }
      
      this.addLog(`[Konto #${accountIndex}] ✅ Kliknięto publikuj`, 'success');
      
      await randomDelay(3000, 4000);
      
      this.addLog(`[Konto #${accountIndex}] ✅ Post opublikowany pomyślnie!`, 'success');
      
    } catch (error) {
      this.addLog(`[Konto #${accountIndex}] ❌ Błąd postowania: ${error.message}`, 'error');
      throw error;
    }
  }

  getRandomUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  async startPostingFromCSV(config) {
    if (this.isRunning) {
      throw new Error('Automatyzacja jest już uruchomiona');
    }

    try {
      this.isRunning = true;
      this.isPaused = false;
      this.currentTask = config;
      this.emit('status-change', this.getStatus());
      
      this.addLog(`Rozpoczynam automatyzację z CSV (${config.posts.length} postów)...`, 'info');
      
      // Inicjalizuj przeglądarkę
      await this.initBrowser();
      
      // Załaduj cookies jeśli są podane
      if (config.cookies) {
        try {
          const cookies = JSON.parse(config.cookies);
          this.addLog(`Ładuję ${cookies.length} cookies...`, 'info');
          
          const normalizedCookies = cookies.map(cookie => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path || '/',
            secure: cookie.secure !== undefined ? cookie.secure : false,
            httpOnly: cookie.httpOnly !== undefined ? cookie.httpOnly : false,
            sameSite: cookie.sameSite === 'no_restriction' ? 'None' : 
                     cookie.sameSite === 'lax' ? 'Lax' : 
                     cookie.sameSite === 'strict' ? 'Strict' : 'None',
            expires: cookie.expirationDate ? cookie.expirationDate : undefined
          }));
          
          await this.page.setCookie(...normalizedCookies);
          this.addLog('✅ Cookies załadowane', 'success');
          
          await this.page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2' });
          await randomDelay(3000, 5000);
          
          const currentUrl = this.page.url();
          if (currentUrl.includes('facebook.com') && !currentUrl.includes('login')) {
            this.addLog('✅ Zalogowano przez cookies!', 'success');
          } else {
            throw new Error('Cookies nie zadziałały');
          }
          
        } catch (cookieError) {
          this.addLog(`⚠️ Błąd cookies: ${cookieError.message}`, 'warning');
          throw new Error(`Błąd cookies: ${cookieError.message}`);
        }
      } else {
        const credentials = await this.getCredentials();
        if (!credentials) {
          throw new Error('Brak zapisanych danych logowania ani cookies');
        }
        await this.login(credentials);
      }
      
      // Pobierz accountId z cookies lub użyj domyślnego
      const accountId = config.accountId || 'default';

      // Główna pętla postowania z CSV
      for (let i = 0; i < config.posts.length; i++) {
        if (!this.isRunning) break;

        while (this.isPaused) {
          await randomDelay(1000, 2000);
        }

        // ANTY-BAN: Sprawdź czy powinniśmy zatrzymać automatyzację
        const pauseCheck = this.activityLimiter.shouldPauseAutomation();
        if (pauseCheck.shouldPause) {
          this.addLog(`🛑 AUTO-PAUZA: ${pauseCheck.reason}`, 'error');
          this.emit('auto-pause', pauseCheck);
          this.isRunning = false;
          break;
        }

        // ANTY-BAN: Sprawdź limity aktywności
        const canPostResult = this.activityLimiter.canPost(accountId);
        if (!canPostResult.allowed) {
          this.addLog(`⏸️ Limit osiągnięty: ${canPostResult.reason}`, 'warning');
          break;
        }

        // Wyświetl statystyki przed postem
        const stats = this.activityLimiter.getStats(accountId);
        this.addLog(`📊 Posty dziś: ${stats.today.posts}/${stats.today.maxPosts}, Akcje: ${stats.today.totalActions}/${stats.today.maxActions}`, 'info');

        const post = config.posts[i];
        this.addLog(`\n[${i + 1}/${config.posts.length}] Postuję do: ${post.groupLink}`, 'info');

        await this.postToGroup(post.groupLink, post.postCopy);

        // Zapisz akcję postu
        this.activityLimiter.recordAction(accountId, 'post');

        // ANTY-BAN: Delay 4-18 minut między grupami (zamiast 60-90 sekund!)
        if (i < config.posts.length - 1) {
          const delayMs = this.activityLimiter.getDelayBetweenGroups();
          const delayMinutes = Math.round(delayMs / 60000 * 10) / 10;
          this.addLog(`⏳ Czekam ${delayMinutes} minut przed następną grupą...`, 'info');
          await randomDelay(delayMs * 0.9, delayMs * 1.1);
        }
      }

      this.addLog(`\n✅ Zakończono postowanie z CSV! (${config.posts.length} postów)`, 'success');
      await this.closeBrowser();
      this.isRunning = false;
      this.emit('status-change', this.getStatus());
      
      return { success: true };

    } catch (error) {
      this.addLog(`❌ Błąd podczas postowania z CSV: ${error.message}`, 'error');
      this.emit('error', error);
      await this.closeBrowser();
      this.isRunning = false;
      this.emit('status-change', this.getStatus());
      throw error;
    }
  }

  async login(credentials) {
    this.addLog('Loguję się do Facebooka...', 'info');
    
    const hasCookies = this.store.get('cookies');
    
    if (hasCookies) {
      this.addLog('Sprawdzam zapisaną sesję...', 'info');
      await this.page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2' });
      await randomDelay(3000, 5000);
      
      // Sprawdź URL - jeśli nie przekierowuje na login, prawdopodobnie jesteśmy zalogowani
      const currentUrl = this.page.url();
      const notOnLoginPage = !currentUrl.includes('/login') && 
                            !currentUrl.includes('login.php');
      
      // Sprawdź czy są pola logowania
      const loginFieldsExist = await this.page.evaluate(() => {
        return document.querySelector('#email') !== null &&
               document.querySelector('#pass') !== null;
      });
      
      // Jeśli NIE MA pól logowania i NIE jesteśmy na stronie login = zalogowani
      if (notOnLoginPage && !loginFieldsExist) {
        this.addLog('✅ Zalogowano używając zapisanej sesji!', 'success');
        return;
      } else {
        this.addLog('Zapisana sesja wygasła, loguję od nowa...', 'info');
        await this.clearCookies();
      }
    }
    
    // Standardowe logowanie
    const currentUrl = this.page.url();
    
    // Jeśli już jesteśmy na Facebooku, sprawdź czy są pola logowania
    if (!currentUrl.includes('facebook.com')) {
      await this.page.goto('https://www.facebook.com/', { waitUntil: 'networkidle2' });
      await randomDelay(2000, 4000);
    }
    
    // Sprawdź czy pola logowania istnieją
    try {
      await this.page.waitForSelector('#email', { timeout: 5000 });
    } catch (e) {
      // Brak pól logowania = jesteśmy już zalogowani
      this.addLog('✅ Już zalogowany!', 'success');
      await this.saveCookies();
      return;
    }

    await randomTyping(this.page, '#email', credentials.email);
    await randomDelay(800, 1500);
    
    await randomTyping(this.page, '#pass', credentials.password);
    await randomDelay(800, 1500);
    
    await this.page.click('button[name="login"]');
    await this.page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
    
    await this.checkForVerification();
    
    await this.saveCookies();
    
    this.addLog('Zalogowano pomyślnie!', 'success');
  }

  async checkForVerification() {
    const currentUrl = this.page.url();
    
    // Lista możliwych checkpointów Facebook (TYLKO URL)
    const checkpointPatterns = [
      'checkpoint',
      'captcha',
      'two_step_verification',
      'auth/2fa',
      'secure_account',
      'login/device-based',
      'login/identify',
      'checkpoint/block'
    ];
    
    // Sprawdź URL - to najbardziej pewny wskaźnik
    const hasCheckpoint = checkpointPatterns.some(pattern => currentUrl.includes(pattern));
    
    if (hasCheckpoint) {
      this.addLog('⚠️  WYKRYTO WERYFIKACJĘ FACEBOOK (URL)!', 'warning');
      this.addLog(`URL: ${currentUrl}`, 'info');
      await this.handleVerificationScreen();
      return;
    }
    
    // Sprawdź TYLKO specyficzne kombinacje tekstu (false positive prevention)
    try {
      const needsVerification = await this.page.evaluate(() => {
        const pageText = document.body.innerText.toLowerCase();
        
        // KLUCZOWE frazy które NAPRAWDĘ oznaczają weryfikację
        const criticalPhrases = [
          'potwierdź swoją tożsamość',
          'confirm your identity',
          'nietypowa aktywność została wykryta',
          'unusual activity detected',
          'zabezpiecz swoje konto',
          'secure your account now',
          'wprowadź kod z sms',
          'enter the code we sent',
          'dwuetapowa weryfikacja jest włączona',
          'two-factor authentication is on',
          'zatwierdź logowanie',
          'approve this login',
          'captcha verification'
        ];
        
        // Sprawdź czy któraś z kluczowych fraz występuje
        for (const phrase of criticalPhrases) {
          if (pageText.includes(phrase)) {
            return { detected: true, phrase };
          }
        }
        
        // Sprawdź czy jest input na kod weryfikacyjny (6 cyfr)
        const codeInputs = Array.from(document.querySelectorAll('input[type="text"], input[type="tel"]'));
        const hasVerificationCodeInput = codeInputs.some(input => {
          const placeholder = (input.placeholder || '').toLowerCase();
          const ariaLabel = (input.getAttribute('aria-label') || '').toLowerCase();
          return placeholder.includes('kod') || 
                 placeholder.includes('code') ||
                 ariaLabel.includes('verification') ||
                 ariaLabel.includes('weryfikacj');
        });
        
        if (hasVerificationCodeInput) {
          // Dodatkowo sprawdź czy jest tekst o weryfikacji w pobliżu
          const hasVerifyText = pageText.includes('weryfikacj') || 
                               pageText.includes('verification') ||
                               pageText.includes('2fa');
          
          if (hasVerifyText) {
            return { detected: true, phrase: 'input weryfikacyjny wykryty' };
          }
        }
        
        return { detected: false };
      });
      
      if (needsVerification.detected) {
        this.addLog('⚠️  WYKRYTO PROŚBĘ O WERYFIKACJĘ!', 'warning');
        this.addLog(`Fraza: ${needsVerification.phrase}`, 'info');
        await this.handleVerificationScreen();
        return;
      }
      
    } catch (error) {
      // Kontynuuj jeśli nie można sprawdzić tekstu
    }
    
    // WYŁĄCZONE: Zbyt czułe selektory powodują false positive
    // Sprawdzanie URL i tekstu jest wystarczające
    //
    // // Sprawdź selektory weryfikacyjne
    // const verificationSelectors = [
    //   'div[role="dialog"]', // ❌ Modalne okna - WSZĘDZIE na FB!
    //   'input[name="approvals_code"]', // Kod 2FA
    //   'button[value="dont_save"]', // Nie zapisuj przeglądarki
    //   'button[value="OK"]', // ❌ Przyciski OK - WSZĘDZIE!
    //   'div[data-testid="sec_ac_button"]' // Przyciski bezpieczeństwa
    // ];
    //
    // for (const selector of verificationSelectors) {
    //   try {
    //     const element = await this.page.$(selector);
    //     if (element) {
    //       const elementText = await this.page.evaluate(el => el.innerText, element);
    //       if (elementText && elementText.length > 0) {
    //         this.addLog('⚠️  WYKRYTO ELEMENT WERYFIKACYJNY!', 'warning');
    //         await this.handleVerificationScreen();
    //         return;
    //       }
    //     }
    //   } catch (e) {
    //     // Kontynuuj sprawdzanie
    //   }
    // }
  }

  async handleVerificationScreen() {
    this.addLog('═════════════════════════════════════', 'warning');
    this.addLog('🛑 WYMAGANA JEST TWOJA INTERWENCJA!', 'warning');
    this.addLog('═════════════════════════════════════', 'warning');
    this.addLog('', 'info');
    this.addLog('Facebook wymaga weryfikacji:', 'warning');
    this.addLog('• Potwierdź logowanie na innym urządzeniu', 'info');
    this.addLog('• Wprowadź kod 2FA (jeśli masz)', 'info');
    this.addLog('• Rozwiąż CAPTCHA', 'info');
    this.addLog('• Zatwierdź nietypową aktywność', 'info');
    this.addLog('', 'info');
    this.addLog('🖱️  INSTRUKCJA:', 'warning');
    this.addLog('1. Przejdź do okna przeglądarki', 'info');
    this.addLog('2. Wykonaj wymaganą weryfikację', 'info');
    this.addLog('3. Poczekaj aż Facebook Cię wpuści', 'info');
    this.addLog('4. Automatyzacja wznowi się automatycznie', 'info');
    this.addLog('', 'info');
    this.addLog('⏰ Czekam na Ciebie... (max 5 minut)', 'warning');
    this.addLog('═════════════════════════════════════', 'warning');
    
    // Powiadomienie systemowe
    this.emit('verification-required', {
      message: 'Facebook wymaga weryfikacji!',
      details: 'Przejdź do przeglądarki i potwierdź logowanie'
    });
    
    // Wstrzymaj automatyzację
    this.isPaused = true;
    this.emit('status-change', this.getStatus());
    
    // Czekaj aż użytkownik przejdzie weryfikację (max 5 minut)
    const maxWaitTime = 5 * 60 * 1000; // 5 minut
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitTime) {
      await randomDelay(8000, 12000); // Zwiększone opóźnienie między sprawdzeniami
      
      const currentUrl = this.page.url();
      
      // Sprawdź czy użytkownik przeszedł weryfikację
      const isOnFacebook = currentUrl.includes('facebook.com') && 
                          !currentUrl.includes('checkpoint') &&
                          !currentUrl.includes('captcha') &&
                          !currentUrl.includes('verify');
      
      if (isOnFacebook) {
        // DOKŁADNA WERYFIKACJA - czy faktycznie jesteśmy zalogowani
        try {
          // Sprawdzenie 1: Czy mamy element nawigacyjny Facebooka
          const hasNavigation = await this.page.evaluate(() => {
            return document.querySelector('[aria-label="Facebook"]') !== null ||
                   document.querySelector('div[role="navigation"]') !== null ||
                   document.querySelector('a[href*="/profile"]') !== null;
          });
          
          if (!hasNavigation) {
            this.addLog('⏳ Strona się ładuje, czekam dalej...', 'info');
            continue;
          }
          
          // Sprawdzenie 2: Czy możemy znaleźć typowe elementy zalogowanego użytkownika
          const isLoggedIn = await this.page.evaluate(() => {
            // Szukamy elementów charakterystycznych dla zalogowanej sesji
            const indicators = [
              document.querySelector('div[role="feed"]'), // News feed
              document.querySelector('[data-pagelet="LeftRail"]'), // Lewa kolumna
              document.querySelector('[aria-label*="Profil"]'), // Link do profilu
              document.querySelector('[aria-label*="Profile"]'),
              document.querySelector('a[href*="/friends"]'), // Znajomi
              document.querySelector('svg[aria-label="Twój profil"]'),
              document.querySelector('svg[aria-label="Your profile"]')
            ];
            
            // Musimy mieć przynajmniej 2 z tych elementów
            const foundIndicators = indicators.filter(el => el !== null).length;
            return foundIndicators >= 2;
          });
          
          if (isLoggedIn) {
            this.addLog('✅ Weryfikacja zakończona pomyślnie!', 'success');
            this.addLog('Potwierdzono, że jesteś zalogowany', 'success');
            this.addLog('Czekam jeszcze 10 sekund na pełne załadowanie strony...', 'info');
            
            // WAŻNE: Poczekaj dodatkowe 10 sekund na pełne załadowanie
            await randomDelay(10000, 12000);
            
            this.addLog('Wznawianie automatyzacji...', 'info');
            this.isPaused = false;
            this.emit('status-change', this.getStatus());
            
            // Jeszcze jedna krótka przerwa przed kontynuacją
            await randomDelay(3000, 5000);
            return;
          } else {
            this.addLog('⏳ Strona Facebooka załadowana, ale nie potwierdzono logowania. Czekam dalej...', 'info');
          }
        } catch (e) {
          this.addLog(`⏳ Błąd sprawdzania: ${e.message}. Kontynuuję czekanie...`, 'info');
          // Kontynuuj czekanie
        }
      }
      
      const remainingSeconds = Math.floor((maxWaitTime - (Date.now() - startTime)) / 1000);
      this.addLog(`⏳ Nadal czekam... (${remainingSeconds}s pozostało)`, 'info');
    }
    
    // Timeout
    this.addLog('⏰ Upłynął czas oczekiwania (5 minut)', 'error');
    this.addLog('Przerywam automatyzację - spróbuj ponownie', 'error');
    throw new Error('Timeout oczekiwania na weryfikację użytkownika');
  }

  async postToGroup(groupUrl, message) {
    try {
      this.addLog(`Postuję do grupy: ${groupUrl}`, 'info');

      await this.page.goto(groupUrl, { waitUntil: 'networkidle2' });
      await randomDelay(3000, 5000);

      await this.checkForVerification();

      const currentUrl = this.page.url();
      if (!currentUrl.includes('facebook.com/groups')) {
        throw new Error('Nie udało się przejść do grupy');
      }

      // ANTY-BAN: Engagement przed postem (15-60 sekund scroll + ewentualne lajki)
      this.addLog('🔄 Wykonuję engagement przed postem (15-60s scroll)...', 'info');
      await engageWithGroup(this.page);

      // Scrolluj na górę przed postem
      await this.page.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' }));
      await randomDelay(2000, 3000);

      this.addLog('Szukam przycisku do tworzenia posta...', 'info');

      // METODA 1: Znajdź przycisk "Napisz coś..." używając evaluate
      const createPostButton = await this.page.evaluate(() => {
        // Znajdź wszystkie div z role="button"
        const buttons = Array.from(document.querySelectorAll('div[role="button"]'));
        
        for (const button of buttons) {
          const text = button.innerText || '';
          const ariaLabel = button.getAttribute('aria-label') || '';
          
          // Szukamy tekstu "Napisz coś" lub podobnego
          const hasCreateText = 
            text.toLowerCase().includes('napisz coś') ||
            text.toLowerCase().includes('write something') ||
            text.toLowerCase().includes('what\'s on your mind') ||
            text.toLowerCase().includes('co słychać') ||
            ariaLabel.toLowerCase().includes('napisz') ||
            ariaLabel.toLowerCase().includes('write');
          
          // Upewnij się że to NIE komentarz
          const isNotComment = 
            !text.toLowerCase().includes('komentarz') &&
            !text.toLowerCase().includes('comment') &&
            !ariaLabel.toLowerCase().includes('komentarz') &&
            !ariaLabel.toLowerCase().includes('comment');
          
          if (hasCreateText && isNotComment) {
            // Sprawdź pozycję na stronie - przycisk do posta jest na górze
            const rect = button.getBoundingClientRect();
            if (rect.top < window.innerHeight / 2) { // Górna połowa ekranu
              button.setAttribute('data-post-create-button', 'true');
              return true;
            }
          }
        }
        return false;
      });

      if (createPostButton) {
        // Kliknij przycisk używając JavaScript (pewniejsze niż .click())
        await this.page.evaluate(() => {
          const button = document.querySelector('[data-post-create-button="true"]');
          if (button) button.click();
        });
        this.addLog('✅ Kliknięto przycisk tworzenia posta', 'success');
      } else {
        // METODA 2: Fallback - użyj XPath do znalezienia tekstu
        this.addLog('Próbuję alternatywnej metody (XPath)...', 'info');
        
        const clicked = await this.page.evaluate(() => {
          // Funkcja pomocnicza XPath
          const getElementByXpath = (xpath) => {
            return document.evaluate(
              xpath, 
              document, 
              null, 
              XPathResult.FIRST_ORDERED_NODE_TYPE, 
              null
            ).singleNodeValue;
          };
          
          // Spróbuj różne XPath queries
          const xpaths = [
            "//span[contains(text(), 'Napisz coś')]",
            "//span[contains(text(), 'Write something')]",
            "//div[contains(text(), 'Napisz coś')]",
            "//div[contains(text(), 'Write something')]"
          ];
          
          for (const xpath of xpaths) {
            const element = getElementByXpath(xpath);
            if (element) {
              // Znajdź najbliższy przycisk (parent z role="button")
              let parent = element.parentElement;
              let depth = 0;
              while (parent && depth < 10) {
                if (parent.getAttribute('role') === 'button') {
                  parent.click();
                  return true;
                }
                parent = parent.parentElement;
                depth++;
              }
            }
          }
          return false;
        });
        
        if (clicked) {
          this.addLog('✅ Kliknięto przycisk (XPath)', 'success');
        } else {
          this.addLog('Nie znaleziono przycisku, próbuję klawiaturą...', 'warning');
          // METODA 3: Ostatnia deska ratunku - Tab + Enter
          await this.page.keyboard.press('Tab');
          await randomDelay(500, 1000);
          await this.page.keyboard.press('Enter');
        }
      }

      // Poczekaj na modal
      this.addLog('Czekam na otwarcie okna...', 'info');
      await randomDelay(4000, 6000);

      // Znajdź pole tekstowe
      this.addLog('Szukam pola tekstowego...', 'info');
      
      const textAreaSelector = 'div[contenteditable="true"][role="textbox"]';
      await this.page.waitForSelector(textAreaSelector, { timeout: 15000 });
      
      // Znajdź widoczne pole w modalu
      const textAreaFound = await this.page.evaluate(() => {
        const textAreas = Array.from(document.querySelectorAll('div[contenteditable="true"][role="textbox"]'));
        
        for (const area of textAreas) {
          const rect = area.getBoundingClientRect();
          const isVisible = rect.width > 0 && rect.height > 0 && 
                          rect.top >= 0 && rect.top < window.innerHeight;
          
          if (isVisible) {
            area.setAttribute('data-post-textarea', 'true');
            return true;
          }
        }
        return false;
      });
      
      if (!textAreaFound) {
        throw new Error('Nie znaleziono pola tekstowego');
      }
      
      // Kliknij w pole i upewnij się że jest aktywne
      this.addLog('Aktywuję pole tekstowe...', 'info');
      
      const fieldActivated = await this.page.evaluate(() => {
        const area = document.querySelector('[data-post-textarea="true"]');
        if (!area) return false;
        
        // Kliknij kilka razy żeby być pewnym
        area.click();
        area.focus();
        
        // Sprawdź czy pole jest widoczne i aktywne
        const rect = area.getBoundingClientRect();
        const isVisible = rect.width > 0 && rect.height > 0;
        const isFocused = document.activeElement === area;
        
        return { 
          found: true, 
          visible: isVisible, 
          focused: isFocused,
          hasAttribute: area.hasAttribute('contenteditable'),
          contenteditable: area.getAttribute('contenteditable')
        };
      });
      
      if (!fieldActivated || !fieldActivated.found) {
        throw new Error('Nie znaleziono pola tekstowego');
      }
      
      this.addLog(`Pole: widoczne=${fieldActivated.visible}, focus=${fieldActivated.focused}, editable=${fieldActivated.contenteditable}`, 'info');
      
      if (!fieldActivated.visible) {
        throw new Error('Pole tekstowe nie jest widoczne');
      }
      
      await randomDelay(1000, 1500);
      
      this.addLog('Wklejam treść posta...', 'info');
      
      // Po wielu próbach okazało się że JEDYNA metoda która działa to keyboard.type()
      // Facebook blokuje:
      // - textContent/innerHTML - wykrywa manipulację DOM
      // - clipboard + Ctrl+V - nie działa w automation
      // 
      // keyboard.type() z delay=0 jest wystarczająco szybkie i Facebook tego nie blokuje
      
      try {
        await this.page.evaluate(() => {
          const area = document.querySelector('[data-post-textarea="true"]');
          if (area) {
            area.focus();
            area.click();
          }
        });
        
        await randomDelay(500, 1000);
        
        // Wpisz tekst używając keyboard - szybko ale bezpiecznie
        const lines = message.split('\n');
        
        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          
          if (line.length > 0) {
            // Wpisz linię - delay=50 to dobry kompromis (nie za szybko, nie za wolno)
            await this.page.keyboard.type(line, { delay: 50 });
          }
          
          // Jeśli nie ostatnia linia, dodaj nową linię (Shift+Enter)
          if (i < lines.length - 1) {
            await this.page.keyboard.down('Shift');
            await this.page.keyboard.press('Enter');
            await this.page.keyboard.up('Shift');
            await randomDelay(100, 200);
          }
        }
        
        this.addLog(`✅ Wpisano ${message.length} znaków`, 'success');
        
        // Weryfikuj że tekst jest w polu
        await randomDelay(1000, 1500);
        
        const verifyText = await this.page.evaluate(() => {
          const area = document.querySelector('[data-post-textarea="true"]');
          if (!area) return '';
          return (area.textContent || area.innerText || '').trim();
        });
        
        if (verifyText.length < 10) {
          throw new Error(`Tekst nie pojawił się w polu - tylko ${verifyText.length} znaków`);
        }
        
        this.addLog(`✅ Weryfikacja OK: ${verifyText.length} znaków w polu`, 'success');
        
      } catch (error) {
        this.addLog(`❌ Błąd wpisywania: ${error.message}`, 'error');
        throw new Error(`Nie udało się wpisać treści: ${error.message}`);
      }
      
      // ZMIANA: Czekaj 10 sekund po wklejeniu
      this.addLog('Czekam 10 sekund...', 'info');
      await randomDelay(10000, 10500);

      // Znajdź przycisk "Opublikuj"
      this.addLog('Szukam przycisku publikacji...', 'info');
      
      // ZMIANA: Uproszczona funkcja klikania - tylko .click(), bez multiple attempts
      const publishClicked = await this.page.evaluate(() => {
        // Funkcja pomocnicza XPath
        const getElementByXpath = (xpath) => {
          return document.evaluate(
            xpath, 
            document, 
            null, 
            XPathResult.FIRST_ORDERED_NODE_TYPE, 
            null
          ).singleNodeValue;
        };
        
        // METODA 1: Szukaj w modalu
        const modal = document.querySelector('[role="dialog"]');
        if (modal) {
          const buttons = Array.from(modal.querySelectorAll('div[role="button"]'));
          
          for (const button of buttons) {
            const text = button.innerText || '';
            const ariaLabel = button.getAttribute('aria-label') || '';
            
            if (text.includes('Opublikuj') || text.includes('Post') ||
                ariaLabel.includes('Opublikuj') || ariaLabel.includes('Post')) {
              button.click(); // ZMIANA: Tylko .click(), bez wielokrotnych prób
              return true;
            }
          }
        }
        
        // METODA 2: XPath - szukaj tekstu "Opublikuj" lub "Post"
        const xpaths = [
          "//span[text()='Opublikuj']",
          "//span[text()='Post']",
          "//div[text()='Opublikuj']",
          "//div[text()='Post']",
          "//span[contains(text(), 'Opublikuj')]",
          "//span[contains(text(), 'Post')]"
        ];
        
        for (const xpath of xpaths) {
          const element = getElementByXpath(xpath);
          if (element) {
            // Znajdź najbliższy przycisk
            let parent = element.parentElement;
            let depth = 0;
            while (parent && depth < 10) {
              if (parent.getAttribute('role') === 'button') {
                parent.click(); // ZMIANA: Tylko .click()
                return true;
              }
              parent = parent.parentElement;
              depth++;
            }
            // Jeśli nie znaleziono przycisku, kliknij sam element
            element.click(); // ZMIANA: Tylko .click()
            return true;
          }
        }
        
        // METODA 3: Znajdź WSZYSTKIE przyciski i szukaj po tekście
        const allButtons = Array.from(document.querySelectorAll('div[role="button"], span[role="button"]'));
        for (const button of allButtons) {
          const text = button.innerText || button.textContent || '';
          if (text.trim() === 'Opublikuj' || text.trim() === 'Post') {
            button.click(); // ZMIANA: Tylko .click()
            return true;
          }
        }
        
        return false;
      });

      if (!publishClicked) {
        this.addLog('Nie znaleziono przycisku publikacji', 'warning');
        throw new Error('Nie znaleziono przycisku Opublikuj');
      }
      
      this.addLog('✅ Kliknięto publikuj', 'success');
      
      // ZMIANA: Czekaj na publikację i sprawdź czy nie ma błędu
      this.addLog('Czekam na publikację...', 'info');
      await randomDelay(3000, 4000);
      
      // Sprawdź czy nie pojawił się komunikat o błędzie
      const errorDetected = await this.page.evaluate(() => {
        // KLUCZOWE frazy błędów (muszą występować razem lub w specyficznym kontekście)
        const criticalErrorPhrases = [
          'Ograniczamy liczbę publikowanych postów',
          'We\'re limiting how often you can post',
          'chronić społeczność przed spamem',
          'reducing spam',
          'nie jest to sprzeczne z naszymi Standardami',
          'against our Community Standards'
        ];
        
        // Sprawdź cały dokument
        const bodyText = document.body.innerText || document.body.textContent;
        
        // Sprawdź kluczowe frazy (te wystarczą same w sobie)
        for (const phrase of criticalErrorPhrases) {
          if (bodyText.toLowerCase().includes(phrase.toLowerCase())) {
            return {
              detected: true,
              message: phrase
            };
          }
        }
        
        // Sprawdź dialogi i alerty (mogą zawierać błąd)
        const alertSelectors = [
          '[role="dialog"]',
          '[role="alert"]',
          '[role="alertdialog"]'
        ];
        
        for (const selector of alertSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = (el.innerText || el.textContent || '').toLowerCase();
            
            // Sprawdź czy dialog zawiera kombinację słów wskazujących na błąd
            const hasSpam = text.includes('spam');
            const hasLimit = text.includes('limit') || text.includes('ogranicza');
            const hasBlock = text.includes('block') || text.includes('blok');
            const hasStandards = text.includes('standard') || text.includes('społeczność');
            
            // Jeśli dialog ma min. 2 z tych słów - to prawdopodobnie błąd
            const errorIndicators = [hasSpam, hasLimit, hasBlock, hasStandards].filter(x => x).length;
            
            if (errorIndicators >= 2) {
              return {
                detected: true,
                message: text.substring(0, 150)
              };
            }
          }
        }
        
        return { detected: false };
      });
      
      if (errorDetected.detected) {
        const errorMsg = `⚠️ Facebook zablokował publikację: "${errorDetected.message}"`;
        this.addLog(errorMsg, 'error');

        // ANTY-BAN: Zapisz event bana do śledzenia (dla auto-pauzy)
        const accountId = this.currentTask?.accountId || 'default';
        this.activityLimiter.markAsBanned(accountId, 'posting_limit');
        this.addLog(`🚨 Konto ${accountId} oznaczone jako zbanowane`, 'error');

        this.emit('facebook-block-detected', {
          groupUrl,
          message: errorDetected.message,
          timestamp: new Date().toISOString(),
          accountId
        });

        // Zatrzymaj automatyzację
        this.isRunning = false;
        this.isPaused = false;

        throw new Error(`Facebook zablokował publikację: ${errorDetected.message}`);
      }
      
      // ANTY-BAN: Post-publish engagement (45-240 sekund)
      // Zostań na stronie i scrolluj - wygląda bardziej naturalnie
      this.addLog('🔄 Wykonuję post-publish engagement (45-240s)...', 'info');
      await postPublishEngagement(this.page);

      this.addLog(`✅ Post opublikowany: ${groupUrl}`, 'success');

      // ANTY-BAN: Losowo wykonaj "ludzki błąd" (raz na 10-15 postów)
      this.postsSinceHumanError++;
      if (this.activityLimiter.shouldMakeHumanError(this.postsSinceHumanError)) {
        this.addLog('🤷 Wykonuję losowy "ludzki błąd"...', 'info');
        await performHumanError(this.page);
        this.postsSinceHumanError = 0;
      }

    } catch (error) {
      this.addLog(`❌ Błąd: ${error.message}`, 'error');
      throw error;
    }
  }

  async stopPosting() {
    this.isRunning = false;
    this.isPaused = false;
    this.currentTask = null;
    await this.closeBrowser();
    this.addLog('Automatyzacja zatrzymana', 'warning');
    this.emit('status-change', this.getStatus());
  }

  async pausePosting() {
    if (!this.isRunning) {
      throw new Error('Automatyzacja nie jest uruchomiona');
    }
    this.isPaused = true;
    this.addLog('Automatyzacja wstrzymana', 'warning');
    this.emit('status-change', this.getStatus());
  }

  async resumePosting() {
    if (!this.isRunning) {
      throw new Error('Automatyzacja nie jest uruchomiona');
    }
    this.isPaused = false;
    this.addLog('Automatyzacja wznowiona', 'info');
    this.emit('status-change', this.getStatus());
  }

  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      isPaused: this.isPaused,
      currentTask: this.currentTask,
      timestamp: new Date().toISOString()
    };
  }

  getLogs() {
    return this.logs;
  }

  addLog(message, type = 'info') {
    const log = {
      timestamp: new Date().toISOString(),
      message,
      type
    };
    this.logs.push(log);
    
    // Ogranicz logi do ostatnich 100
    if (this.logs.length > 100) {
      this.logs.shift();
    }
    
    this.emit('log', log);
  }
}

module.exports = AutomationManager;
