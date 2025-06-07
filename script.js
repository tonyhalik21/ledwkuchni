document.addEventListener('DOMContentLoaded', () => {
    // --- KONFIGURACJA ---
    // ZMIEŃ TEN ADRES NA SWÓJ ADRES DUCKDNS
    const espAddress = "http://sterowanieesp12.duckdns.org:50001";

    // --- ELEMENTY DOM ---
    const elements = {
        connectionStatus: document.getElementById('connection-status'),
        spinner: document.querySelector('.spinner'),
        ledIndicator: document.getElementById('led-indicator-icon'),
        ledStatusHeading: document.getElementById('led-status-heading'),
        ledSourceText: document.getElementById('led-source-text'),
        ledTimerText: document.getElementById('led-timer-text'),
        progressBarContainer: document.querySelector('.progress-bar-container'),
        progressBar: document.getElementById('led-progress-bar'),
        toggleButton: document.getElementById('toggle-button'),
        modeButtons: document.querySelectorAll('.mode-button'),
        pirStatusText: document.getElementById('pir-status-text'),
        sunriseTime: document.getElementById('sunrise-time'),
        sunsetTime: document.getElementById('sunset-time'),
        ldrValue: document.getElementById('ldr-value'),
        ldrMinSlider: document.getElementById('ldr-min-slider'),
        ldrMaxSlider: document.getElementById('ldr-max-slider'),
        rangeMinVal: document.getElementById('range-min-val'),
        rangeMaxVal: document.getElementById('range-max-val'),
        logsContainer: document.getElementById('logs-container')
    };

    // --- STAN APLIKACJI ---
    let state = {
        totalTime: 0,
        isUpdatingSliders: false,
    };
    
    // --- FUNKCJE API ---
    const api = {
        async getStatus() {
            const response = await fetch(`${espAddress}/status`);
            if (!response.ok) throw new Error('Nie udało się pobrać statusu');
            return response.json();
        },
        async toggleLed() {
            await fetch(`${espAddress}/toggle`, { method: 'POST' });
        },
        async setControlMode(mode) {
            await fetch(`${espAddress}/set_control_mode?mode=${mode}`);
        },
        async setLdrThreshold(low, high) {
            await fetch(`${espAddress}/set_ldr_threshold_range?low=${low}&high=${high}`);
        }
    };

    // --- FUNKCJE AKTUALIZACJI UI ---
    function updateConnectionStatus(status, message) {
        elements.connectionStatus.className = `connection-status-bar ${status}`;
        elements.connectionStatus.innerHTML = message;
        if (status === 'connecting') {
            const spinner = document.createElement('div');
            spinner.className = 'spinner';
            elements.connectionStatus.prepend(spinner);
        }
    }

    function updateUI(data) {
        // LED Status
        const isLedOn = data.ledState;
        elements.ledIndicator.classList.toggle('on', isLedOn);
        elements.ledStatusHeading.textContent = isLedOn ? 'Stan: Włączony' : 'Stan: Wyłączony';
        elements.ledSourceText.textContent = `Źródło: ${data.ledSource || 'Brak'}`;
        elements.toggleButton.innerHTML = `<i class="fas fa-power-off"></i> ${isLedOn ? 'Wyłącz Światło' : 'Włącz Światło'}`;

        // Timer i Progress Bar
        if (isLedOn && data.timeRemaining > 0) {
            const minutes = Math.floor(data.timeRemaining / 60);
            const seconds = String(data.timeRemaining % 60).padStart(2, '0');
            elements.ledTimerText.textContent = `Wyłączy się za: ${minutes}m ${seconds}s`;
            elements.progressBarContainer.style.opacity = '1';

            if (state.totalTime === 0 || data.timeRemaining > state.totalTime) {
                state.totalTime = data.timeRemaining;
            }
            const progressPercent = (data.timeRemaining / state.totalTime) * 100;
            elements.progressBar.style.width = `${progressPercent}%`;
        } else {
            elements.ledTimerText.textContent = '';
            elements.progressBarContainer.style.opacity = '0';
            elements.progressBar.style.width = '0%';
            state.totalTime = 0;
        }

        // Tryb sterowania i PIR
        elements.modeButtons.forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.mode) === data.controlMode);
        });
        elements.pirStatusText.textContent = data.isPirActive ? 'Aktywny' : 'Nieaktywny';
        elements.pirStatusText.className = `status-badge ${data.isPirActive ? 'active' : ''}`;

        // Info
        elements.sunriseTime.textContent = data.sunriseTime || 'N/A';
        elements.sunsetTime.textContent = data.sunsetTime || 'N/A';
        elements.ldrValue.textContent = data.ldrValue;

        // LDR Sliders (tylko jeśli użytkownik ich nie przesuwa)
        if (!state.isUpdatingSliders) {
            elements.ldrMinSlider.value = data.ldrThresholdLow;
            elements.ldrMaxSlider.value = data.ldrThresholdHigh;
        }
        elements.rangeMinVal.textContent = data.ldrThresholdLow;
        elements.rangeMaxVal.textContent = data.ldrThresholdHigh;
        
        // Logs
        const logsHtml = data.logs.map(log => `<div class="log-item">${log}</div>`).join('');
        elements.logsContainer.innerHTML = logsHtml || '<p>Brak logów.</p>';
    }

    // --- GŁÓWNA PĘTLA POBIERANIA DANYCH ---
    async function fetchDataLoop() {
        try {
            const data = await api.getStatus();
            updateUI(data);
            if (elements.connectionStatus.classList.contains('connecting') || elements.connectionStatus.classList.contains('error')) {
                updateConnectionStatus('connected', '<i class="fas fa-check-circle"></i> Połączono z ESP');
            }
        } catch (error) {
            console.error("Błąd komunikacji z ESP:", error);
            updateConnectionStatus('error', '<i class="fas fa-exclamation-triangle"></i> Błąd połączenia z ESP');
        }
    }

    // --- EVENT LISTENERS ---
    elements.toggleButton.addEventListener('click', async () => {
        try {
            await api.toggleLed();
            fetchDataLoop(); // Natychmiastowe odświeżenie
        } catch (e) {
            console.error("Błąd przełączania LED:", e);
        }
    });

    elements.modeButtons.forEach(btn => {
        btn.addEventListener('click', async () => {
            const mode = btn.dataset.mode;
            try {
                await api.setControlMode(mode);
                fetchDataLoop();
            } catch (e) {
                console.error("Błąd zmiany trybu:", e);
            }
        });
    });

    function handleSliderChange() {
        state.isUpdatingSliders = false;
        let minVal = parseInt(elements.ldrMinSlider.value);
        let maxVal = parseInt(elements.ldrMaxSlider.value);
        
        if (minVal > maxVal) { // Zapobiegaj krzyżowaniu się suwaków
            [minVal, maxVal] = [maxVal, minVal];
            elements.ldrMinSlider.value = minVal;
            elements.ldrMaxSlider.value = maxVal;
        }

        elements.rangeMinVal.textContent = minVal;
        elements.rangeMaxVal.textContent = maxVal;
        api.setLdrThreshold(minVal, maxVal).catch(e => console.error("Błąd ustawiania progu LDR:", e));
    }

    elements.ldrMinSlider.addEventListener('input', () => { state.isUpdatingSliders = true; });
    elements.ldrMaxSlider.addEventListener('input', () => { state.isUpdatingSliders = true; });
    elements.ldrMinSlider.addEventListener('change', handleSliderChange);
    elements.ldrMaxSlider.addEventListener('change', handleSliderChange);

    // --- Inicjalizacja ---
    updateConnectionStatus('connecting', 'Łączenie z ESP...');
    fetchDataLoop(); // Pierwsze pobranie
    setInterval(fetchDataLoop, 2000); // Odświeżaj co 2 sekundy
});
