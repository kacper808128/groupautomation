const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const axios = require('axios');
const { getRandomUserAgent } = require('../utils/human-behavior');

puppeteer.use(StealthPlugin());

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class InstagramChecker {
  constructor(store) {
    this.store = store;
    this.browser = null;
    this.page = null;
    this.isRunning = false;
    this.results = [];
  }

  addLog(message, type = 'info') {
    const log = {
      timestamp: new Date().toISOString(),
      message,
      type
    };
    console.log(`[Instagram] ${message}`);
    return log;
  }

  async checkReel(url, webhookUrl, cookies = null) {
    try {
      this.addLog(`Sprawdzam: ${url}`, 'info');

      // Otwórz przeglądarkę jeśli nie jest otwarta
      if (!this.browser) {
        this.browser = await puppeteer.launch({
          headless: false,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            `--user-agent=${getRandomUserAgent()}`
          ]
        });

        this.page = await this.browser.newPage();
        await this.page.setViewport({ width: 1366, height: 768 });

        // Załaduj cookies jeśli podane
        if (cookies && cookies.length > 0) {
          this.addLog('Ładuję cookies...', 'info');
          
          const normalizedCookies = cookies.map(cookie => ({
            name: cookie.name,
            value: cookie.value,
            domain: cookie.domain,
            path: cookie.path || '/',
            secure: cookie.secure || false,
            httpOnly: cookie.httpOnly || false,
            sameSite: cookie.sameSite === 'no_restriction' ? 'None' : 
                     cookie.sameSite === 'lax' ? 'Lax' : 
                     cookie.sameSite === 'strict' ? 'Strict' : 'None',
            expires: cookie.expirationDate ? cookie.expirationDate : undefined
          }));

          await this.page.setCookie(...normalizedCookies);
          this.addLog(`Załadowano ${normalizedCookies.length} cookies`, 'success');
        }
      }

      // Przejdź na reel
      await this.page.goto(url, { waitUntil: 'networkidle2' });
      await delay(3000);

      // Kliknij "View insights"
      this.addLog('Szukam przycisku View insights...', 'info');
      
      const viewInsightsClicked = await this.page.evaluate(() => {
        // Metoda 1: Szukaj po tekście w różnych tagach
        const selectors = ['a', 'button', 'span', 'div[role="button"]', '[role="link"]'];
        
        for (const selector of selectors) {
          const elements = Array.from(document.querySelectorAll(selector));
          const viewInsightsBtn = elements.find(el => {
            const text = (el.textContent || el.innerText || '').toLowerCase();
            return text.includes('view insights') || 
                   text.includes('zobacz statystyki') ||
                   text.includes('wyświetl statystyki') ||
                   text === 'insights';
          });
          
          if (viewInsightsBtn) {
            viewInsightsBtn.click();
            return true;
          }
        }
        
        // Metoda 2: Szukaj po aria-label
        const ariaElements = Array.from(document.querySelectorAll('[aria-label]'));
        const ariaBtn = ariaElements.find(el => {
          const label = el.getAttribute('aria-label').toLowerCase();
          return label.includes('view insights') || label.includes('insights');
        });
        
        if (ariaBtn) {
          ariaBtn.click();
          return true;
        }
        
        return false;
      });

      if (!viewInsightsClicked) {
        // Spróbuj screenshot dla debugowania
        await this.page.screenshot({ 
          path: '/tmp/instagram-no-insights-btn.png',
          fullPage: false 
        });
        throw new Error('Nie znaleziono przycisku "View insights" - czy to Twój reel? Czy jesteś zalogowany?');
      }

      this.addLog('✅ Kliknięto View insights', 'success');
      await delay(4000); // Dłuższe oczekiwanie na załadowanie

      // Kliknij zakładkę "Ad"
      this.addLog('Szukam zakładki Ad...', 'info');
      
      const adTabClicked = await this.page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('button, div[role="button"], span, [role="tab"]'));
        const adTab = elements.find(el => {
          const text = (el.textContent || el.innerText || '').trim().toLowerCase();
          const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
          return text === 'ad' || 
                 text === 'reklama' || 
                 text === 'ads' ||
                 ariaLabel.includes('ad') ||
                 ariaLabel.includes('reklama');
        });
        
        if (adTab) {
          adTab.click();
          return true;
        }
        return false;
      });

      if (!adTabClicked) {
        this.addLog('⚠️ Nie znaleziono zakładki "Ad" - próbuję odczytać bez niej', 'warning');
      } else {
        this.addLog('✅ Kliknięto zakładkę Ad', 'success');
        await delay(3000);
      }

      // Odczytaj wyświetlenia (Views)
      this.addLog('Odczytuję Views...', 'info');
      
      const viewsData = await this.page.evaluate(() => {
        // Metoda 1: Szukaj "Views" i liczby obok
        const allText = document.body.innerText;
        
        // Pattern 1: "Views\n1,234" lub "Views 1,234"
        const pattern1 = /Views[\s\n]+?([\d,]+)/i;
        const match1 = allText.match(pattern1);
        if (match1) {
          const number = match1[1].replace(/,/g, '');
          return { views: parseInt(number), method: 'pattern1' };
        }
        
        // Pattern 2: "1,234 Views" lub "1234 wyświetleń"
        const pattern2 = /([\d,]+)[\s]+?(?:Views|wyświetleń|wyświetlenia)/i;
        const match2 = allText.match(pattern2);
        if (match2) {
          const number = match2[1].replace(/,/g, '');
          return { views: parseInt(number), method: 'pattern2' };
        }
        
        // Metoda 2: Szukaj elementów z tekstem "Views"
        const elements = Array.from(document.querySelectorAll('span, div, p, li, td, dt, dd'));
        
        for (let i = 0; i < elements.length; i++) {
          const el = elements[i];
          const text = (el.textContent || '').trim();
          
          if (text.toLowerCase() === 'views' || text.toLowerCase() === 'wyświetlenia') {
            // Sprawdź parent, siblings, next elements
            const parent = el.parentElement;
            if (parent) {
              // Check siblings
              const siblings = Array.from(parent.children);
              for (const sibling of siblings) {
                if (sibling === el) continue;
                const siblingText = sibling.textContent.trim();
                const match = siblingText.match(/^([\d,]+)$/);
                if (match) {
                  const number = match[1].replace(/,/g, '');
                  return { views: parseInt(number), method: 'siblings' };
                }
              }
              
              // Check parent text
              const parentText = parent.textContent.trim();
              const parentMatch = parentText.match(/([\d,]+)/);
              if (parentMatch) {
                const number = parentMatch[1].replace(/,/g, '');
                return { views: parseInt(number), method: 'parent' };
              }
            }
            
            // Check next element
            let next = el.nextElementSibling;
            let attempts = 0;
            while (next && attempts < 5) {
              const nextText = next.textContent.trim();
              const match = nextText.match(/^([\d,]+)$/);
              if (match) {
                const number = match[1].replace(/,/g, '');
                return { views: parseInt(number), method: 'nextSibling' };
              }
              next = next.nextElementSibling;
              attempts++;
            }
          }
        }
        
        // Metoda 3: Szukaj dowolnej dużej liczby w statystykach
        const statsElements = Array.from(document.querySelectorAll('[class*="stat"], [class*="metric"], [class*="insight"]'));
        for (const el of statsElements) {
          const text = el.textContent.trim();
          const match = text.match(/([\d,]+)/);
          if (match) {
            const number = match[1].replace(/,/g, '');
            const parsed = parseInt(number);
            if (parsed > 100) { // Prawdopodobnie views
              return { views: parsed, method: 'stats-element' };
            }
          }
        }
        
        return { views: null, method: 'none', html: document.body.innerHTML.substring(0, 500) };
      });

      if (viewsData.views === null) {
        // Screenshot dla debugowania
        await this.page.screenshot({ 
          path: '/tmp/instagram-no-views.png',
          fullPage: true 
        });
        this.addLog(`Debug: method=${viewsData.method}`, 'info');
        throw new Error('Nie znaleziono wartości Views - sprawdź /tmp/instagram-no-views.png');
      }

      const views = viewsData.views;
      this.addLog(`✅ Views: ${views.toLocaleString()} (metoda: ${viewsData.method})`, 'success');

      // Wyślij na webhook
      const result = { url, views };
      
      if (webhookUrl) {
        this.addLog(`Wysyłam na webhook: ${webhookUrl}`, 'info');
        
        try {
          await axios.post(webhookUrl, result, {
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000
          });
          this.addLog('✅ Wysłano na webhook', 'success');
        } catch (error) {
          this.addLog(`⚠️ Błąd wysyłania na webhook: ${error.message}`, 'warning');
        }
      }

      this.results.push({
        ...result,
        timestamp: new Date().toISOString(),
        success: true
      });

      return result;

    } catch (error) {
      this.addLog(`❌ Błąd: ${error.message}`, 'error');
      
      this.results.push({
        url,
        views: null,
        error: error.message,
        timestamp: new Date().toISOString(),
        success: false
      });

      throw error;
    }
  }

  async checkMultipleReels(urls, webhookUrl, cookies = null) {
    this.isRunning = true;
    this.results = [];

    try {
      for (let i = 0; i < urls.length; i++) {
        if (!this.isRunning) {
          this.addLog('Zatrzymano przez użytkownika', 'warning');
          break;
        }

        const url = urls[i].trim();
        if (!url) continue;

        this.addLog(`\n[${i + 1}/${urls.length}] Sprawdzam: ${url}`, 'info');

        try {
          await this.checkReel(url, webhookUrl, cookies);
          
          // Opóźnienie między reelsami
          if (i < urls.length - 1) {
            this.addLog('Czekam 5 sekund przed kolejnym...', 'info');
            await delay(5000);
          }
        } catch (error) {
          this.addLog(`Błąd dla ${url}: ${error.message}`, 'error');
          // Kontynuuj z kolejnym
        }
      }

      this.addLog('\n✅ Zakończono sprawdzanie wszystkich reels', 'success');
      this.addLog(`Sprawdzono: ${this.results.filter(r => r.success).length}/${urls.length}`, 'info');

      return this.results;

    } finally {
      this.isRunning = false;
    }
  }

  async stop() {
    this.isRunning = false;
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
    this.addLog('Zatrzymano', 'warning');
  }

  getResults() {
    return this.results;
  }
}

module.exports = InstagramChecker;
