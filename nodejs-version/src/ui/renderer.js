const { ipcRenderer } = require('electron');

// State management
let currentStatus = {
    isRunning: false,
    isPaused: false
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
    setupEventListeners();
    setupIpcListeners();
    loadSavedData();
});

function initializeApp() {
    // Set copyright year
    document.getElementById('copyrightYear').textContent = new Date().getFullYear();
    
    // Setup navigation
    setupNavigation();
}

function setupNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    const tabContents = document.querySelectorAll('.tab-content');
    
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabName = btn.dataset.tab;
            
            // Remove active class from all
            navButtons.forEach(b => b.classList.remove('active'));
            tabContents.forEach(t => t.classList.remove('active'));
            
            // Add active class to clicked
            btn.classList.add('active');
            document.getElementById(tabName).classList.add('active');
        });
    });
}

function setupEventListeners() {
    // Credentials Form
    document.getElementById('credentialsForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveCredentials();
    });
    
    document.getElementById('testLoginBtn').addEventListener('click', testLogin);
    
    // Posting Controls
    document.getElementById('startPostingBtn').addEventListener('click', startPosting);
    document.getElementById('pausePostingBtn').addEventListener('click', pausePosting);
    document.getElementById('resumePostingBtn').addEventListener('click', resumePosting);
    document.getElementById('stopPostingBtn').addEventListener('click', stopPosting);
    
    // Save Facebook cookies
    document.getElementById('saveFacebookCookiesBtn')?.addEventListener('click', async () => {
        const cookies = document.getElementById('facebookCookies').value.trim();
        
        if (cookies) {
            try {
                JSON.parse(cookies); // Waliduj JSON
                await ipcRenderer.invoke('save-facebook-cookies', cookies);
                showToast('Cookies zapisane', 'success');
            } catch (error) {
                showToast('Błąd: Nieprawidłowy format JSON', 'error');
            }
        } else {
            await ipcRenderer.invoke('save-facebook-cookies', '');
            showToast('Cookies wyczyszczone', 'success');
        }
    });
    
    // Proxy
    document.getElementById('proxyEnabled').addEventListener('change', (e) => {
        document.getElementById('proxyConfig').style.display = e.target.checked ? 'block' : 'none';
    });
    
    document.getElementById('saveProxyBtn').addEventListener('click', saveProxy);
    document.getElementById('testProxyBtn').addEventListener('click', testProxy);
    
    // Schedule
    document.getElementById('addScheduleBtn').addEventListener('click', () => {
        document.getElementById('scheduleModal').style.display = 'flex';
    });
    
    document.getElementById('closeScheduleModal').addEventListener('click', () => {
        document.getElementById('scheduleModal').style.display = 'none';
    });
    
    document.getElementById('cancelSchedule').addEventListener('click', () => {
        document.getElementById('scheduleModal').style.display = 'none';
    });
    
    document.getElementById('scheduleForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveSchedule();
    });
    
    // Logs
    document.getElementById('clearLogsBtn').addEventListener('click', clearLogs);
    document.getElementById('exportLogsBtn').addEventListener('click', exportLogs);
    
    // Settings
    document.getElementById('saveSettingsBtn').addEventListener('click', saveSettings);
}

function setupIpcListeners() {
    // Status updates
    ipcRenderer.on('status-update', (event, status) => {
        updateStatus(status);
    });
    
    // New log entry
    ipcRenderer.on('new-log', (event, log) => {
        addLogEntry(log);
    });
    
    // Notifications
    ipcRenderer.on('notification', (event, data) => {
        showToast(data.title, data.body);
    });
    
    // Verification required
    ipcRenderer.on('verification-required', (event, data) => {
        showToast('⚠️ WERYFIKACJA WYMAGANA!', data.message, 'warning');
    });
    
    // Facebook block detected
    ipcRenderer.on('facebook-block-detected', (event, data) => {
        showToast('🚫 FACEBOOK ZABLOKOWAŁ!', data.message, 'error');
        // Automatycznie zatrzymaj i pokaż ostrzeżenie
        const logsContainer = document.getElementById('logsContainer');
        if (logsContainer) {
            const warningDiv = document.createElement('div');
            warningDiv.className = 'log-entry log-error';
            warningDiv.innerHTML = `
                <strong>🚫 AUTOMATYZACJA ZATRZYMANA!</strong><br>
                Facebook wykrył spam/nadmierną aktywność.<br>
                Komunikat: ${data.message}<br>
                Poczekaj kilka godzin przed kolejną próbą.
            `;
            logsContainer.insertBefore(warningDiv, logsContainer.firstChild);
        }
    });
}

async function loadSavedData() {
    // Load credentials
    const credentials = await ipcRenderer.invoke('get-credentials');
    if (credentials) {
        document.getElementById('email').value = credentials.email;
        document.getElementById('password').value = credentials.password;
    }
    
    // Load Facebook cookies
    const facebookCookies = await ipcRenderer.invoke('get-facebook-cookies');
    if (facebookCookies) {
        document.getElementById('facebookCookies').value = facebookCookies;
    }
    
    // Load proxy config
    const proxyConfig = await ipcRenderer.invoke('get-proxy');
    if (proxyConfig && proxyConfig.enabled) {
        document.getElementById('proxyEnabled').checked = true;
        document.getElementById('proxyConfig').style.display = 'block';
        document.getElementById('proxyHost').value = proxyConfig.host || '';
        document.getElementById('proxyPort').value = proxyConfig.port || '';
        document.getElementById('proxyUsername').value = proxyConfig.username || '';
        document.getElementById('proxyPassword').value = proxyConfig.password || '';
    }
    
    // Load logs
    const logs = await ipcRenderer.invoke('get-logs');
    logs.forEach(log => addLogEntry(log));
    
    // Load schedules
    await loadSchedules();
}

async function saveCredentials() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!email || !password) {
        showToast('Błąd', 'Wypełnij wszystkie pola', 'error');
        return;
    }
    
    const result = await ipcRenderer.invoke('save-credentials', { email, password });
    
    if (result.success) {
        showToast('Sukces', 'Dane logowania zapisane', 'success');
    } else {
        showToast('Błąd', result.error, 'error');
    }
}

async function testLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!email || !password) {
        showToast('Błąd', 'Wypełnij dane logowania', 'error');
        return;
    }
    
    showToast('Test logowania', 'Rozpoczynam test...', 'info');
    const btn = document.getElementById('testLoginBtn');
    btn.disabled = true;
    btn.textContent = '⏳ Testuję...';
    
    const result = await ipcRenderer.invoke('test-login', { email, password });
    
    btn.disabled = false;
    btn.textContent = '🔍 Testuj logowanie';
    
    if (result.success) {
        showToast('Sukces', 'Logowanie zakończone pomyślnie!', 'success');
    } else if (result.requiresCaptcha) {
        showToast('CAPTCHA', 'Wykryto CAPTCHA - wymagana weryfikacja', 'warning');
    } else {
        showToast('Błąd', 'Logowanie nie powiodło się: ' + result.error, 'error');
    }
}

async function startPosting() {
    const message = document.getElementById('postMessage').value;
    const groupsList = document.getElementById('groupsList').value;
    const delayBetweenPosts = parseInt(document.getElementById('delayBetweenPosts').value);
    const cookies = document.getElementById('facebookCookies').value.trim();
    
    if (!message || !groupsList) {
        showToast('Błąd', 'Wypełnij treść posta i listę grup', 'error');
        return;
    }
    
    const groups = groupsList.split('\n').filter(g => g.trim().length > 0);
    
    if (groups.length === 0) {
        showToast('Błąd', 'Dodaj przynajmniej jedną grupę', 'error');
        return;
    }
    
    const config = {
        message,
        groups,
        delayBetweenPosts,
        cookies: cookies || null
    };
    
    const result = await ipcRenderer.invoke('start-posting', config);
    
    if (result.success) {
        updateControlButtons(true, false);
        showToast('Rozpoczęto', 'Automatyzacja uruchomiona', 'success');
    } else {
        showToast('Błąd', result.error, 'error');
    }
}

async function pausePosting() {
    const result = await ipcRenderer.invoke('pause-posting');
    if (result.success) {
        updateControlButtons(true, true);
    }
}

async function resumePosting() {
    const result = await ipcRenderer.invoke('resume-posting');
    if (result.success) {
        updateControlButtons(true, false);
    }
}

async function stopPosting() {
    const result = await ipcRenderer.invoke('stop-posting');
    if (result.success) {
        updateControlButtons(false, false);
    }
}

function updateControlButtons(isRunning, isPaused) {
    document.getElementById('startPostingBtn').disabled = isRunning;
    document.getElementById('pausePostingBtn').disabled = !isRunning || isPaused;
    document.getElementById('resumePostingBtn').disabled = !isRunning || !isPaused;
    document.getElementById('stopPostingBtn').disabled = !isRunning;
    
    currentStatus.isRunning = isRunning;
    currentStatus.isPaused = isPaused;
    
    updateStatusIndicator();
}

function updateStatusIndicator() {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');
    
    statusDot.className = 'status-dot';
    
    if (currentStatus.isRunning) {
        if (currentStatus.isPaused) {
            statusDot.classList.add('paused');
            statusText.textContent = 'Wstrzymany';
        } else {
            statusDot.classList.add('active');
            statusText.textContent = 'Aktywny';
        }
    } else {
        statusText.textContent = 'Nieaktywny';
    }
}

function updateStatus(status) {
    currentStatus = status;
    updateStatusIndicator();
    updateControlButtons(status.isRunning, status.isPaused);
}

async function saveProxy() {
    const proxyConfig = {
        enabled: document.getElementById('proxyEnabled').checked,
        host: document.getElementById('proxyHost').value,
        port: document.getElementById('proxyPort').value,
        username: document.getElementById('proxyUsername').value,
        password: document.getElementById('proxyPassword').value
    };
    
    const result = await ipcRenderer.invoke('save-proxy', proxyConfig);
    
    if (result.success) {
        showToast('Sukces', 'Konfiguracja proxy zapisana', 'success');
    } else {
        showToast('Błąd', result.error, 'error');
    }
}

async function testProxy() {
    showToast('Test proxy', 'Funkcja w przygotowaniu', 'info');
}

async function saveSchedule() {
    const schedule = {
        id: Date.now().toString(),
        name: document.getElementById('scheduleName').value,
        type: document.getElementById('scheduleType').value,
        time: document.getElementById('scheduleTime').value,
        message: document.getElementById('scheduleMessage').value,
        groups: document.getElementById('scheduleGroups').value.split('\n').filter(g => g.trim()),
        enabled: true
    };
    
    const result = await ipcRenderer.invoke('save-schedule', schedule);
    
    if (result.success) {
        showToast('Sukces', 'Harmonogram zapisany', 'success');
        document.getElementById('scheduleModal').style.display = 'none';
        document.getElementById('scheduleForm').reset();
        await loadSchedules();
    } else {
        showToast('Błąd', result.error, 'error');
    }
}

async function loadSchedules() {
    const schedules = await ipcRenderer.invoke('get-schedule');
    const container = document.getElementById('schedulesList');
    
    if (schedules.length === 0) {
        container.innerHTML = '<p style="color: var(--text-secondary);">Brak zaplanowanych zadań</p>';
        return;
    }
    
    container.innerHTML = schedules.map(schedule => `
        <div class="schedule-item">
            <div class="schedule-info">
                <h4>${schedule.name}</h4>
                <p>Typ: ${schedule.type} | Status: ${schedule.enabled ? 'Aktywny' : 'Nieaktywny'}</p>
            </div>
            <div class="schedule-actions">
                <button class="btn btn-sm btn-danger" onclick="deleteSchedule('${schedule.id}')">Usuń</button>
            </div>
        </div>
    `).join('');
}

async function deleteSchedule(scheduleId) {
    if (confirm('Czy na pewno chcesz usunąć ten harmonogram?')) {
        await ipcRenderer.invoke('delete-schedule', scheduleId);
        await loadSchedules();
        showToast('Usunięto', 'Harmonogram został usunięty', 'success');
    }
}

function addLogEntry(log) {
    const logsContainer = document.getElementById('logsContainer');
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry ${log.type}`;
    
    const timestamp = new Date(log.timestamp).toLocaleString('pl-PL');
    
    logEntry.innerHTML = `
        <span class="log-timestamp">[${timestamp}]</span>
        <span>${log.message}</span>
    `;
    
    logsContainer.appendChild(logEntry);
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

function clearLogs() {
    if (confirm('Czy na pewno chcesz wyczyścić wszystkie logi?')) {
        document.getElementById('logsContainer').innerHTML = '';
        showToast('Wyczyszczono', 'Logi zostały usunięte', 'success');
    }
}

function exportLogs() {
    const logs = document.getElementById('logsContainer').innerText;
    const blob = new Blob([logs], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `logs-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Eksport', 'Logi zostały wyeksportowane', 'success');
}

function saveSettings() {
    showToast('Zapisano', 'Ustawienia zostały zapisane', 'success');
}

function showToast(title, message, type = 'info') {
    const toastContainer = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    toast.innerHTML = `
        <div class="toast-title">${title}</div>
        <div class="toast-message">${message}</div>
    `;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s';
        setTimeout(() => toast.remove(), 300);
    }, 5000);
}

// ===== PLAYGROUND =====

// Załaduj konfigurację
async function loadPlaygroundApiKey() {
    const config = await ipcRenderer.invoke('playground-get-config');
    if (config.apiKey) {
        document.getElementById('anthropicApiKey').value = config.apiKey;
    }
    if (config.modelName) {
        document.getElementById('geminiModel').value = config.modelName;
    }
}

// Zapisz konfigurację
document.getElementById('saveApiKeyBtn')?.addEventListener('click', async () => {
    const apiKey = document.getElementById('anthropicApiKey').value.trim();
    const modelName = document.getElementById('geminiModel').value.trim();
    
    if (!apiKey) {
        showToast('Wprowadź API Key', 'error');
        return;
    }
    
    if (!modelName) {
        showToast('Wprowadź nazwę modelu', 'error');
        return;
    }
    
    await ipcRenderer.invoke('playground-set-api-key', apiKey, modelName);
    showToast('Konfiguracja zapisana', 'success');
});

// Uruchom Playground
document.getElementById('runPlaygroundBtn')?.addEventListener('click', async () => {
    const url = document.getElementById('playgroundUrl').value.trim();
    const instructions = document.getElementById('playgroundInstructions').value.trim();
    const cookies = document.getElementById('playgroundCookies').value.trim();
    
    if (!url || !instructions) {
        showToast('Wypełnij URL i Instrukcje', 'error');
        return;
    }
    
    const apiKey = document.getElementById('anthropicApiKey').value.trim();
    if (!apiKey) {
        showToast('Ustaw Anthropic API Key', 'error');
        return;
    }
    
    // Disable buttons
    document.getElementById('runPlaygroundBtn').disabled = true;
    document.getElementById('stopPlaygroundBtn').disabled = false;
    
    // Clear logs
    const logsContainer = document.getElementById('playgroundLogs');
    logsContainer.innerHTML = '<p style="color: #888;">Uruchamiam...</p>';
    
    try {
        const result = await ipcRenderer.invoke('playground-run', {
            url,
            instructions,
            cookies
        });
        
        if (result.success) {
            displayPlaygroundLogs(result.logs);
            showToast('Wykonano pomyślnie!', 'success');
        } else {
            displayPlaygroundLogs(result.logs);
            showToast(`Błąd: ${result.error}`, 'error');
        }
        
    } catch (error) {
        logsContainer.innerHTML += `<p style="color: #ff4444;">Błąd: ${error.message}</p>`;
        showToast(`Błąd: ${error.message}`, 'error');
    } finally {
        document.getElementById('runPlaygroundBtn').disabled = false;
        document.getElementById('stopPlaygroundBtn').disabled = true;
    }
});

// Stop Playground
document.getElementById('stopPlaygroundBtn')?.addEventListener('click', async () => {
    await ipcRenderer.invoke('playground-stop');
    document.getElementById('runPlaygroundBtn').disabled = false;
    document.getElementById('stopPlaygroundBtn').disabled = true;
    showToast('Zatrzymano', 'warning');
});

// Wyświetl logi
function displayPlaygroundLogs(logs) {
    const logsContainer = document.getElementById('playgroundLogs');
    logsContainer.innerHTML = '';
    
    logs.forEach(log => {
        const logElement = document.createElement('div');
        logElement.style.marginBottom = '8px';
        
        const timestamp = new Date(log.timestamp).toLocaleTimeString('pl-PL');
        const color = {
            'info': '#4a9eff',
            'success': '#00ff88',
            'warning': '#ffaa00',
            'error': '#ff4444',
            'code': '#888',
            'result': '#00ff88'
        }[log.type] || '#888';
        
        logElement.innerHTML = `
            <span style="color: #666;">[${timestamp}]</span>
            <span style="color: ${color};">${log.message}</span>
        `;
        
        logsContainer.appendChild(logElement);
    });
    
    logsContainer.scrollTop = logsContainer.scrollHeight;
}

// Inicjalizacja Playground
if (document.getElementById('playground')) {
    loadPlaygroundApiKey();
}

// ===== CSV IMPORT =====

let csvData = null; // Przechowuje załadowane dane CSV
let accountsCount = 1; // Licznik kont

// Dodaj nowe konto
document.getElementById('addAccountBtn')?.addEventListener('click', () => {
    const accountsList = document.getElementById('accountsList');
    const accountDiv = document.createElement('div');
    accountDiv.className = 'account-item';
    accountDiv.style.cssText = 'background: #1a1a1a; padding: 15px; border-radius: 5px; margin-bottom: 10px;';
    
    accountDiv.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
            <strong style="color: #00ff88;">Konto #${accountsCount + 1}</strong>
            <button class="btn btn-danger btn-sm remove-account-btn" data-index="${accountsCount}" style="padding: 5px 10px; font-size: 12px;">
                🗑️ Usuń
            </button>
        </div>
        <textarea 
            id="account-${accountsCount}-cookies" 
            rows="4"
            class="form-control"
            style="font-size: 12px;"
            placeholder='[{"name":"c_user","value":"xxx","domain":".facebook.com"}]'
        ></textarea>
    `;
    
    accountsList.appendChild(accountDiv);
    accountsCount++;
    
    // Dodaj event listener do przycisku usuń
    accountDiv.querySelector('.remove-account-btn').addEventListener('click', function() {
        accountDiv.remove();
    });
});

// Zapisz wszystkie konta
document.getElementById('saveAllAccountsBtn')?.addEventListener('click', async () => {
    const accounts = [];
    
    for (let i = 0; i < accountsCount; i++) {
        const textarea = document.getElementById(`account-${i}-cookies`);
        if (textarea && textarea.value.trim()) {
            try {
                const cookies = JSON.parse(textarea.value.trim());
                accounts.push({ index: i, cookies: JSON.stringify(cookies) });
            } catch (error) {
                showToast(`Błąd w koncie #${i + 1}: Nieprawidłowy JSON`, 'error');
                return;
            }
        }
    }
    
    if (accounts.length === 0) {
        showToast('Dodaj przynajmniej jedno konto', 'error');
        return;
    }
    
    await ipcRenderer.invoke('save-all-accounts', accounts);
    showToast(`✅ Zapisano ${accounts.length} kont`, 'success');
});

// Załaduj zapisane konta przy starcie
async function loadSavedAccounts() {
    const accounts = await ipcRenderer.invoke('get-all-accounts');
    
    if (accounts && accounts.length > 0) {
        // Usuń domyślne konto jeśli jest puste
        const firstAccount = document.getElementById('account-0-cookies');
        if (firstAccount && !firstAccount.value.trim() && accounts.length > 1) {
            document.querySelector('.account-item')?.remove();
            accountsCount = 0;
        }
        
        // Załaduj każde konto
        for (const account of accounts) {
            if (account.index === 0 && firstAccount) {
                firstAccount.value = account.cookies;
            } else {
                // Dodaj nowe konto
                document.getElementById('addAccountBtn').click();
                const textarea = document.getElementById(`account-${account.index}-cookies`);
                if (textarea) {
                    textarea.value = account.cookies;
                }
            }
        }
    }
}

// Załaduj konta przy starcie
setTimeout(loadSavedAccounts, 500);

// Załaduj CSV
document.getElementById('loadCsvBtn')?.addEventListener('click', async () => {
    const fileInput = document.getElementById('csvFileInput');
    const file = fileInput.files[0];
    
    if (!file) {
        showToast('Wybierz plik CSV', 'error');
        return;
    }
    
    const reader = new FileReader();
    
    reader.onload = (e) => {
        try {
            const text = e.target.result;
            const lines = text.split('\n').filter(line => line.trim());
            
            if (lines.length < 2) {
                showToast('CSV jest pusty', 'error');
                return;
            }
            
            // Wykryj separator (przecinek lub TAB)
            const firstLine = lines[0];
            const separator = firstLine.includes('\t') ? '\t' : ',';
            
            // Parse CSV z obsługą cudzysłowów dla wartości z przecinkami/enterami
            const parseCSVLine = (line) => {
                const result = [];
                let current = '';
                let inQuotes = false;
                
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === separator && !inQuotes) {
                        result.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                result.push(current.trim());
                return result;
            };
            
            // Parse headers
            const headers = parseCSVLine(lines[0]);
            const groupLinkIndex = headers.indexOf('group_link');
            const postCopyIndex = headers.indexOf('post_copy');
            
            if (groupLinkIndex === -1 || postCopyIndex === -1) {
                showToast('CSV musi zawierać kolumny: group_link i post_copy', 'error');
                console.log('Headers found:', headers);
                return;
            }
            
            // Parse wiersze (połącz linie w cudzysłowach)
            const posts = [];
            let currentLine = '';
            let inQuotes = false;
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                
                // Sprawdź czy jesteśmy w cudzysłowie
                for (let char of line) {
                    if (char === '"') inQuotes = !inQuotes;
                }
                
                currentLine += (currentLine ? '\n' : '') + line;
                
                // Jeśli nie jesteśmy w cudzysłowie, parsuj linię
                if (!inQuotes) {
                    const values = parseCSVLine(currentLine);
                    const groupLink = values[groupLinkIndex]?.trim().replace(/^"|"$/g, '');
                    const postCopy = values[postCopyIndex]?.trim().replace(/^"|"$/g, '');
                    
                    if (groupLink && postCopy) {
                        posts.push({ groupLink, postCopy });
                    }
                    
                    currentLine = '';
                }
            }
            
            if (posts.length === 0) {
                showToast('Nie znaleziono postów w CSV', 'error');
                return;
            }
            
            csvData = posts;
            
            // Pokaż preview
            document.getElementById('csvPreview').style.display = 'block';
            document.getElementById('csvStats').textContent = 
                `Załadowano ${posts.length} postów z ${new Set(posts.map(p => p.groupLink)).size} grup`;
            
            showToast(`✅ Załadowano ${posts.length} postów`, 'success');
            
        } catch (error) {
            showToast(`Błąd parsowania CSV: ${error.message}`, 'error');
            console.error('CSV parse error:', error);
        }
    };
    
    reader.readAsText(file);
});

// Modyfikuj startPosting żeby używał CSV i wiele kont
const originalStartPosting = startPosting;

async function startPosting() {
    // Pobierz wszystkie konta
    const accounts = [];
    for (let i = 0; i < accountsCount; i++) {
        const textarea = document.getElementById(`account-${i}-cookies`);
        if (textarea && textarea.value.trim()) {
            try {
                const cookies = textarea.value.trim();
                JSON.parse(cookies); // Waliduj
                accounts.push({ index: i, cookies });
            } catch (error) {
                showToast(`Błąd w koncie #${i + 1}: Nieprawidłowy JSON`, 'error');
                return;
            }
        }
    }
    
    if (accounts.length === 0) {
        showToast('Dodaj przynajmniej jedno konto z cookies', 'error');
        return;
    }
    
    const delayBetweenPosts = parseInt(document.getElementById('delayBetweenPosts').value);
    
    // Jeśli mamy załadowane CSV, użyj tego
    if (csvData && csvData.length > 0) {
        // Disable/enable buttons
        document.getElementById('startPostingBtn').disabled = true;
        document.getElementById('stopPostingBtn').disabled = false;
        
        showToast(`🚀 Uruchamiam ${accounts.length} kont z ${csvData.length} postami`, 'info');
        
        // Rozpocznij postowanie z CSV i wieloma kontami
        const result = await ipcRenderer.invoke('start-posting-multi', {
            posts: csvData,
            accounts: accounts,
            delayBetweenPosts
        });
        
        if (result.success) {
            showToast(`✅ Rozpoczęto postowanie na ${accounts.length} kontach`, 'success');
        } else {
            showToast(`Błąd: ${result.error}`, 'error');
            document.getElementById('startPostingBtn').disabled = false;
            document.getElementById('stopPostingBtn').disabled = true;
        }
        
        return;
    }
    
    // Jeśli nie ma CSV, użyj ręcznego wpisywania
    const message = document.getElementById('postMessage').value;
    const groupsList = document.getElementById('groupsList').value;
    
    if (!message || !groupsList) {
        showToast('Wypełnij treść posta i listę grup (lub załaduj CSV)', 'error');
        return;
    }
    
    const groups = groupsList.split('\n').filter(g => g.trim().length > 0);
    
    if (groups.length === 0) {
        showToast('Dodaj przynajmniej jedną grupę', 'error');
        return;
    }
    
    // Utwórz posty z ręcznego wpisywania
    const manualPosts = groups.map(group => ({
        groupLink: group,
        postCopy: message
    }));
    
    document.getElementById('startPostingBtn').disabled = true;
    document.getElementById('stopPostingBtn').disabled = false;
    
    showToast(`🚀 Uruchamiam ${accounts.length} kont z ${manualPosts.length} postami`, 'info');
    
    const result = await ipcRenderer.invoke('start-posting-multi', {
        posts: manualPosts,
        accounts: accounts,
        delayBetweenPosts
    });
    
    if (result.success) {
        showToast(`✅ Rozpoczęto postowanie na ${accounts.length} kontach`, 'success');
    } else {
        showToast(`Błąd: ${result.error}`, 'error');
        document.getElementById('startPostingBtn').disabled = false;
        document.getElementById('stopPostingBtn').disabled = true;
    }
}

// ===== INSTAGRAM CHECKER =====

// Załaduj konfigurację
async function loadInstagramConfig() {
    const config = await ipcRenderer.invoke('instagram-get-config');
    if (config.webhookUrl) {
        document.getElementById('instagramWebhook').value = config.webhookUrl;
    }
    if (config.cookies) {
        document.getElementById('instagramCookies').value = config.cookies;
    }
}

// Zapisz konfigurację
document.getElementById('saveInstagramConfigBtn')?.addEventListener('click', async () => {
    const webhookUrl = document.getElementById('instagramWebhook').value.trim();
    const cookies = document.getElementById('instagramCookies').value.trim();
    
    await ipcRenderer.invoke('instagram-save-config', { webhookUrl, cookies });
    showToast('Konfiguracja zapisana', 'success');
});

// Rozpocznij sprawdzanie
document.getElementById('startInstagramCheckBtn')?.addEventListener('click', async () => {
    const webhookUrl = document.getElementById('instagramWebhook').value.trim();
    const cookies = document.getElementById('instagramCookies').value.trim();
    const urls = document.getElementById('instagramReelsLinks').value.trim();
    
    if (!urls) {
        showToast('Dodaj linki do sprawdzenia', 'error');
        return;
    }
    
    if (!webhookUrl) {
        showToast('Ustaw Webhook URL', 'error');
        return;
    }
    
    // Disable/enable buttons
    document.getElementById('startInstagramCheckBtn').disabled = true;
    document.getElementById('stopInstagramCheckBtn').disabled = false;
    
    // Clear results
    const resultsContainer = document.getElementById('instagramResults');
    resultsContainer.innerHTML = '<p style="color: #888;">Sprawdzanie...</p>';
    
    try {
        const result = await ipcRenderer.invoke('instagram-start-check', {
            webhookUrl,
            cookies,
            urls
        });
        
        if (result.success) {
            showToast('Rozpoczęto sprawdzanie', 'success');
        } else {
            showToast(`Błąd: ${result.error}`, 'error');
            document.getElementById('startInstagramCheckBtn').disabled = false;
            document.getElementById('stopInstagramCheckBtn').disabled = true;
        }
        
    } catch (error) {
        showToast(`Błąd: ${error.message}`, 'error');
        document.getElementById('startInstagramCheckBtn').disabled = false;
        document.getElementById('stopInstagramCheckBtn').disabled = true;
    }
});

// Stop
document.getElementById('stopInstagramCheckBtn')?.addEventListener('click', async () => {
    await ipcRenderer.invoke('instagram-stop');
    document.getElementById('startInstagramCheckBtn').disabled = false;
    document.getElementById('stopInstagramCheckBtn').disabled = true;
    showToast('Zatrzymano', 'warning');
});

// Listen for completion
ipcRenderer.on('instagram-check-complete', (event, results) => {
    const resultsContainer = document.getElementById('instagramResults');
    resultsContainer.innerHTML = '<h4>Wyniki sprawdzania:</h4>';
    
    results.forEach(result => {
        const resultDiv = document.createElement('div');
        resultDiv.style.padding = '10px';
        resultDiv.style.marginBottom = '10px';
        resultDiv.style.background = result.success ? '#1a3a1a' : '#3a1a1a';
        resultDiv.style.borderRadius = '5px';
        
        if (result.success) {
            resultDiv.innerHTML = `
                <strong style="color: #00ff88;">✅ ${result.url}</strong><br>
                <span style="color: #fff;">Views: ${result.views.toLocaleString()}</span><br>
                <small style="color: #888;">${new Date(result.timestamp).toLocaleString('pl-PL')}</small>
            `;
        } else {
            resultDiv.innerHTML = `
                <strong style="color: #ff4444;">❌ ${result.url}</strong><br>
                <span style="color: #ff8888;">Błąd: ${result.error}</span><br>
                <small style="color: #888;">${new Date(result.timestamp).toLocaleString('pl-PL')}</small>
            `;
        }
        
        resultsContainer.appendChild(resultDiv);
    });
    
    document.getElementById('startInstagramCheckBtn').disabled = false;
    document.getElementById('stopInstagramCheckBtn').disabled = true;
    showToast('Sprawdzanie zakończone!', 'success');
});

ipcRenderer.on('instagram-check-error', (event, error) => {
    showToast(`Błąd: ${error}`, 'error');
    document.getElementById('startInstagramCheckBtn').disabled = false;
    document.getElementById('stopInstagramCheckBtn').disabled = true;
});

// Inicjalizacja Instagram Checker
if (document.getElementById('instagram')) {
    loadInstagramConfig();
}

// ===== API TOKEN MANAGEMENT =====

async function loadApiToken() {
    const token = await ipcRenderer.invoke('get-api-token');
    if (token) {
        document.getElementById('apiTokenDisplay').value = token;
    }
}

document.getElementById('copyTokenBtn')?.addEventListener('click', async () => {
    const token = document.getElementById('apiTokenDisplay').value;
    await navigator.clipboard.writeText(token);
    showToast('Token skopiowany!', 'success');
});

document.getElementById('regenerateTokenBtn')?.addEventListener('click', async () => {
    if (confirm('Czy na pewno chcesz wygenerować nowy token? Stary przestanie działać!')) {
        const newToken = await ipcRenderer.invoke('regenerate-api-token');
        document.getElementById('apiTokenDisplay').value = newToken;
        showToast('Nowy token wygenerowany!', 'success');
    }
});

// Załaduj token przy otwarciu Settings
if (document.getElementById('settings')) {
    loadApiToken();
}
