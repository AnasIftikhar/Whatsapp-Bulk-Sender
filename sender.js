let phoneNumbers = [];
let isProcessing = false;
let currentIndex = 0;
let stats = { total: 0, sent: 0, failed: 0, remaining: 0 };

const el = {
    uploadArea: document.getElementById('uploadArea'),
    fileInput: document.getElementById('fileInput'),
    fileInfo: document.getElementById('fileInfo'),
    messageText: document.getElementById('messageText'),
    minDelay: document.getElementById('minDelay'),
    maxDelay: document.getElementById('maxDelay'),
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    statsContainer: document.getElementById('statsContainer'),
    statTotal: document.getElementById('statTotal'),
    statSent: document.getElementById('statSent'),
    statFailed: document.getElementById('statFailed'),
    statRemaining: document.getElementById('statRemaining'),
    progressContainer: document.getElementById('progressContainer'),
    progressFill: document.getElementById('progressFill'),
    logContainer: document.getElementById('logContainer')
};

// File Upload Handlers
el.uploadArea.addEventListener('click', () => el.fileInput.click());

el.uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    el.uploadArea.style.borderColor = '#25D366';
});

el.uploadArea.addEventListener('dragleave', () => {
    el.uploadArea.style.borderColor = '#ddd';
});

el.uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    el.uploadArea.style.borderColor = '#ddd';
    if (e.dataTransfer.files.length) {
        handleFile(e.dataTransfer.files[0]);
    }
});

el.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length) {
        handleFile(e.target.files[0]);
    }
});

el.startBtn.addEventListener('click', startSending);
el.stopBtn.addEventListener('click', stopSending);

function handleFile(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(sheet);

            if (rows.length === 0) {
                throw new Error('Excel file is empty');
            }

            const columns = Object.keys(rows[0]);
            const phoneCol = columns.find(col => col.toLowerCase() === 'phone');

            if (!phoneCol) {
                throw new Error('No "PHONE" column found');
            }

            phoneNumbers = rows
                .map(row => row[phoneCol])
                .filter(phone => phone)
                .map(phone => String(phone).replace(/\D/g, ''));

            if (phoneNumbers.length === 0) {
                throw new Error('No valid phone numbers found');
            }

            stats.total = phoneNumbers.length;
            stats.remaining = phoneNumbers.length;

            el.uploadArea.classList.add('has-file');
            el.fileInfo.classList.remove('hidden');
            el.fileInfo.innerHTML = `<strong>✅ ${file.name}</strong><br>${phoneNumbers.length} phone numbers loaded`;
            el.startBtn.disabled = false;

            addLog(`File loaded: ${phoneNumbers.length} numbers found`, 'success');
            console.log('Loaded phone numbers:', phoneNumbers);

        } catch (error) {
            alert(`Error: ${error.message}`);
            addLog(`Error: ${error.message}`, 'error');
            console.error('File parsing error:', error);
        }
    };

    reader.readAsArrayBuffer(file);
}

async function startSending() {
    if (isProcessing || phoneNumbers.length === 0) return;

    const message = el.messageText.value.trim();
    if (!message) {
        alert('Please enter a message to send');
        return;
    }

    const minDelay = parseInt(el.minDelay.value) * 1000;
    const maxDelay = parseInt(el.maxDelay.value) * 1000;

    if (minDelay >= maxDelay) {
        alert('Min delay must be less than max delay');
        return;
    }

    isProcessing = true;
    currentIndex = 0;
    stats.sent = 0;
    stats.failed = 0;
    stats.remaining = stats.total;

    el.startBtn.classList.add('hidden');
    el.stopBtn.classList.remove('hidden');
    el.statsContainer.classList.remove('hidden');
    el.progressContainer.classList.remove('hidden');

    addLog('🚀 Starting bulk send...', 'info');
    console.log('Starting bulk send with message:', message);

    for (let i = 0; i < phoneNumbers.length; i++) {
        if (!isProcessing) {
            addLog('⏹️ Sending stopped by user', 'warning');
            console.log('Process stopped by user');
            break;
        }

        currentIndex = i;
        const phone = phoneNumbers[i];

        addLog(`📤 Sending to +${phone}...`, 'info');
        console.log(`Attempting to send to: +${phone}`);

        try {
            await sendMessage(phone, message);
            stats.sent++;
            addLog(`✅ Message sent to +${phone}`, 'success');
            console.log(`Success: Message sent to +${phone}`);
        } catch (error) {
            stats.failed++;
            addLog(`❌ Failed to send to +${phone}: ${error.message}`, 'error');
            console.error(`Failed for +${phone}:`, error);
        }

        stats.remaining = stats.total - (i + 1);
        updateStats();
        updateProgress();

        if (i < phoneNumbers.length - 1 && isProcessing) {
            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
            const delaySec = Math.round(delay / 1000);
            addLog(`⏳ Waiting ${delaySec} seconds before next message...`, 'info');
            console.log(`Waiting ${delaySec} seconds...`);
            await sleep(delay);
        }
    }

    if (isProcessing) {
        addLog('✅ Bulk sending completed!', 'success');
        console.log('Bulk sending completed');
    }

    isProcessing = false;
    el.stopBtn.classList.add('hidden');
    el.startBtn.classList.remove('hidden');
}

function stopSending() {
    isProcessing = false;
    addLog('⏹️ Stopping process...', 'warning');
    console.log('Stop requested by user');
}

async function sendMessage(phone, message) {
    return new Promise((resolve, reject) => {
        const url = `https://web.whatsapp.com/send/?phone=${phone}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`;

        console.log(`Opening WhatsApp tab for +${phone}`);

        chrome.tabs.create({ url: url, active: false }, (tab) => {
            const tabId = tab.id;
            let resolved = false;

            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    chrome.tabs.remove(tabId).catch(() => { });
                    reject(new Error('Timeout waiting for WhatsApp'));
                }
            }, 35000);

            chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    console.log(`Tab loaded for +${phone}, waiting for page to stabilize...`);

                    setTimeout(() => {
                        console.log(`Sending message command for +${phone}`);

                        chrome.tabs.sendMessage(tabId, {
                            action: 'sendMessage',
                            message: message
                        }).catch(err => {
                            console.log('Message command sent (channel may close naturally)');
                        });

                        // Wait 12 seconds total for message to send in background
                        setTimeout(() => {
                            if (!resolved) {
                                resolved = true;
                                clearTimeout(timeout);
                                chrome.tabs.onUpdated.removeListener(listener);
                                chrome.tabs.remove(tabId).catch(() => { });
                                console.log(`Message process completed for +${phone}`);
                                resolve();
                            }
                        }, 12000);

                    }, 6000);
                }
            });
        });
    });
}

function updateStats() {
    el.statTotal.textContent = stats.total;
    el.statSent.textContent = stats.sent;
    el.statFailed.textContent = stats.failed;
    el.statRemaining.textContent = stats.remaining;
}

function updateProgress() {
    const progress = ((stats.sent + stats.failed) / stats.total) * 100;
    el.progressFill.style.width = `${progress}%`;
}

function addLog(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString();
    const log = document.createElement('div');
    log.className = `log-entry log-${type}`;
    log.textContent = `[${timestamp}] ${message}`;
    el.logContainer.appendChild(log);
    el.logContainer.scrollTop = el.logContainer.scrollHeight;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}