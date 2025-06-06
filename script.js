// --- KONFIGURACJA ---
// Zmień ten adres na adres swojego ESP w sieci lokalnej lub na adres DuckDNS
const espAddress = "192.168.1.63"; 
// Alternatywnie, jeśli nie używasz DuckDNS z zewnątrz: const espAddress = "http://192.168.X.X";

// --- GLOBALNE ZMIENNE ---
let ledTotalTime = 0, ledRemainingTime = 0, updateTimeout;

// --- GŁÓWNA LOGIKA ---
function updateUI(data) {
    if (data.error) {
        console.error('Otrzymano błąd z ESP:', data.error);
        document.getElementById('led-source').textContent = 'Błąd ESP: ' + data.error;
        return;
    }

    const ledVisual = document.getElementById('led-visual'), ledSourceEl = document.getElementById('led-source'), ledTimerEl = document.getElementById('led-timer'), progressContainer = document.getElementById('progress-container'), progressBar = document.getElementById('progress-bar');
    if (data.ledState) {
        ledVisual.className = 'led-indicator led-on'; ledSourceEl.textContent = `Włączony (${data.ledSource})`;
        if (data.timeRemaining > 0) {
            progressContainer.style.display = 'block'; const minutes = Math.floor(data.timeRemaining / 60), seconds = data.timeRemaining % 60;
            ledTimerEl.textContent = `Wyłączy się za: ${minutes}m ${seconds.toString().padStart(2, '0')}s`;
            if (!ledTotalTime || data.timeRemaining > ledRemainingTime) ledTotalTime = data.timeRemaining;
            ledRemainingTime = data.timeRemaining; const percent = (ledRemainingTime / ledTotalTime) * 100;
            progressBar.style.width = `${percent}%`
        } else {
            progressContainer.style.display = 'none'; ledTimerEl.textContent = 'Włączony bez limitu czasu'; ledTotalTime = 0
        }
    } else {
        ledVisual.className = 'led-indicator led-off'; ledSourceEl.textContent = 'Wyłączony'; ledTimerEl.textContent = 'Gotowy do użycia';
        progressContainer.style.display = 'none'; ledTotalTime = 0
    }
    document.getElementById('ldr-value').textContent = data.ldrValue;
    document.getElementById('ldr-bar').style.width = `${(data.ldrValue / 1023) * 100}%`;
    document.getElementById('pir-status').textContent = data.isPirActive ? 'AKTYWNY' : 'NIEAKTYWNY';
    document.getElementById('pir-status').style.color = data.isPirActive ? 'var(--success)' : 'var(--text-secondary)';
    const lowSlider = document.getElementById('ldr-range-low'), highSlider = document.getElementById('ldr-range-high');
    if (document.activeElement !== lowSlider) lowSlider.value = data.ldrThresholdLow;
    if (document.activeElement !== highSlider) highSlider.value = data.ldrThresholdHigh;
    document.getElementById('ldr-threshold-display').textContent = `${lowSlider.value} - ${highSlider.value}`;
    const modeOptions = document.querySelectorAll('.mode-option');
    modeOptions.forEach((option, index) => { if (index === data.controlMode) option.classList.add('active'); else option.classList.remove('active') });
    document.getElementById('sunrise-time').textContent = data.sunriseTime || '--:--';
    document.getElementById('sunset-time').textContent = data.sunsetTime || '--:--';
    const logsContainer = document.getElementById('logs-container');
    if (data.logs && data.logs.length > 0) {
        logsContainer.innerHTML = '';
        data.logs.slice(0, 50).forEach(log => {
            const logEntry = document.createElement('div'); logEntry.className = 'log-entry';
            let icon = 'fa-info-circle', color = 'var(--text-secondary)'; const lowerLog = log.toLowerCase();
            if (lowerLog.includes('on')) { icon = 'fa-toggle-on'; color = 'var(--success)' }
            if (lowerLog.includes('off')) { icon = 'fa-toggle-off'; color = 'var(--warning)' }
            if (lowerLog.includes('pir')) { icon = 'fa-running'; color = '#ffab00' }
            if (lowerLog.includes('ldr')) { icon = 'fa-sun'; color = '#ffd600' }
            if (lowerLog.includes('err') || lowerLog.includes('błąd')) { icon = 'fa-exclamation-triangle'; color = 'var(--error)' }
            if (lowerLog.includes('wifi')) { icon = 'fa-wifi'; color = 'var(--primary)' }
            if (lowerLog.includes('ok')) color = 'var(--success)';
            const timeMatch = log.match(/\[(.*?)\]/), time = timeMatch ? timeMatch[1] : '', message = log.replace(/\[.*?\]/, '').trim();
            logEntry.innerHTML = `<span class="log-time" style="color:${color};">${time}</span><i class="fas ${icon} log-icon" style="color:${color}"></i><span class="log-message">${message}</span>`;
            logsContainer.appendChild(logEntry)
        })
    } else logsContainer.innerHTML = '<div class="log-entry"><i class="fas fa-history log-icon"></i><span class="log-message">Brak logów.</span></div>'
}

function sendRequest(endpoint, options = {}, callback) {
    fetch(espAddress + endpoint, options)
        .then(response => {
            if (!response.ok) throw new Error('Network response was not ok');
            // Jeśli endpoint nie zwraca JSON, np. toggle, to nie próbuj go parsować
            if (response.headers.get("content-type")?.includes("application/json")) {
                return response.json();
            }
            return response.text();
        })
        .then(data => {
            if (callback) callback(data);
        })
        .catch(error => {
            console.error(`Błąd zapytania do ${endpoint}:`, error);
            document.getElementById('led-source').textContent = 'Błąd połączenia!';
        });
}


function toggleLed() { sendRequest('/toggle_www', { method: 'POST' }, () => setTimeout(fetchStatus, 200)) }
function setControlMode(mode) { sendRequest(`/set_control_mode?mode=${mode}`, {}, () => setTimeout(fetchStatus, 200)) }
function handleSliderInput() {
    const lowSlider = document.getElementById('ldr-range-low'), highSlider = document.getElementById('ldr-range-high');
    let low = parseInt(lowSlider.value), high = parseInt(highSlider.value);
    if (document.activeElement === lowSlider && low > high) highSlider.value = low;
    if (document.activeElement === highSlider && high < low) lowSlider.value = high;
    document.getElementById('ldr-threshold-display').textContent = `${lowSlider.value} - ${highSlider.value}`;
    clearTimeout(updateTimeout); updateTimeout = setTimeout(updateLdrThreshold, 500)
}
function updateLdrThreshold() {
    const low = document.getElementById('ldr-range-low').value, high = document.getElementById('ldr-range-high').value;
    sendRequest(`/set_ldr_threshold_range?low=${low}&high=${high}`, {}, () => setTimeout(fetchStatus, 200))
}
function forceRefresh() { fetchStatus() }

function fetchStatus() {
    // Dodajemy losowy parametr, aby uniknąć cache'owania przez przeglądarkę
    sendRequest('/status?t=' + Date.now(), {}, data => updateUI(data));
}

function updateSystemTime() { document.getElementById('system-time').textContent = new Date().toLocaleTimeString('pl-PL') }
setInterval(fetchStatus, 1500);
setInterval(updateSystemTime, 1000);
document.addEventListener('DOMContentLoaded', () => { fetchStatus(); updateSystemTime() });
