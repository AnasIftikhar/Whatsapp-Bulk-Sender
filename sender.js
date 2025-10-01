let phoneNumbers = [];
let allRows = [];
let workbookData = null;
let originalSheet = null;
let phoneColName = null;
let statusColName = 'Status';
let isProcessing = false;
let currentIndex = 0;
let stats = { total: 0, sent: 0, failed: 0, remaining: 0, skipped: 0 };

const el = {
    uploadArea: document.getElementById('uploadArea'),
    fileInput: document.getElementById('fileInput'),
    fileInfo: document.getElementById('fileInfo'),
    messageText: document.getElementById('messageText'),
    minDelay: document.getElementById('minDelay'),
    maxDelay: document.getElementById('maxDelay'),
    sendLimit: document.getElementById('sendLimit'),
    startBtn: document.getElementById('startBtn'),
    stopBtn: document.getElementById('stopBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
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
el.downloadBtn.addEventListener('click', downloadUpdatedFile);

function handleFile(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
        try {
            const data = new Uint8Array(e.target.result);
            workbookData = XLSX.read(data, { type: 'array', cellStyles: true });
            originalSheet = workbookData.Sheets[workbookData.SheetNames[0]];
            const rows = XLSX.utils.sheet_to_json(originalSheet, { defval: '' });

            if (rows.length === 0) {
                throw new Error('Excel file is empty');
            }

            const columns = Object.keys(rows[0]);
            phoneColName = columns.find(col => col.toLowerCase() === 'phone');

            if (!phoneColName) {
                throw new Error('No "PHONE" column found');
            }

            // Check if Status column exists
            const hasStatus = columns.some(col => col.toLowerCase() === 'status');

            // If no Status column, insert it after PHONE
            if (!hasStatus) {
                statusColName = 'Status';
                rows.forEach(row => row[statusColName] = '');
                addLog('Status column created after PHONE column', 'info');
            } else {
                statusColName = columns.find(col => col.toLowerCase() === 'status');
            }

            allRows = rows;

            // Build queue of unsent numbers
            phoneNumbers = [];
            allRows.forEach((row, idx) => {
                const phone = row[phoneColName];
                const status = row[statusColName] || '';

                if (phone && status.toLowerCase() !== 'sent') {
                    const cleanPhone = String(phone).replace(/\D/g, '');
                    if (cleanPhone) {
                        phoneNumbers.push({ phone: cleanPhone, rowIndex: idx });
                    }
                }
            });

            if (phoneNumbers.length === 0) {
                throw new Error('No unsent phone numbers found');
            }

            const totalRows = allRows.length;
            const alreadySent = totalRows - phoneNumbers.length;

            stats.total = phoneNumbers.length;
            stats.remaining = phoneNumbers.length;
            stats.skipped = alreadySent;

            el.uploadArea.classList.add('has-file');
            el.fileInfo.classList.remove('hidden');
            el.fileInfo.innerHTML = `<strong>✅ ${file.name}</strong><br>${phoneNumbers.length} unsent numbers (${alreadySent} already sent)`;
            el.startBtn.disabled = false;

            addLog(`File loaded: ${totalRows} total rows, ${phoneNumbers.length} unsent, ${alreadySent} already sent`, 'success');
            console.log('Loaded unsent phone numbers:', phoneNumbers);

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

    // Get send limit
    const sendLimitValue = el.sendLimit.value.trim();
    const sendLimit = sendLimitValue ? parseInt(sendLimitValue) : phoneNumbers.length;
    const numbersToSend = phoneNumbers.slice(0, sendLimit);

    isProcessing = true;
    currentIndex = 0;
    stats.sent = 0;
    stats.failed = 0;
    stats.remaining = numbersToSend.length;

    el.startBtn.classList.add('hidden');
    el.stopBtn.classList.remove('hidden');
    el.statsContainer.classList.remove('hidden');
    el.progressContainer.classList.remove('hidden');

    addLog(`🚀 Starting bulk send (limit: ${numbersToSend.length} of ${phoneNumbers.length} unsent)...`, 'info');
    console.log(`Starting bulk send: ${numbersToSend.length} numbers`);

    for (let i = 0; i < numbersToSend.length; i++) {
        if (!isProcessing) {
            addLog('⏹️ Sending stopped by user', 'warning');
            console.log('Process stopped by user');
            break;
        }

        currentIndex = i;
        const { phone, rowIndex } = numbersToSend[i];

        addLog(`📤 Checking row ${rowIndex + 2} / queued ${i + 1} — sending to +${phone}...`, 'info');
        console.log(`Attempting to send to: +${phone} (row ${rowIndex + 2})`);

        try {
            await sendMessage(phone, message);
            allRows[rowIndex][statusColName] = 'Sent';
            stats.sent++;
            addLog(`✅ Message sent — row ${rowIndex + 2} — Status set to Sent`, 'success');
            console.log(`Success: Message sent to +${phone} (row ${rowIndex + 2})`);
        } catch (error) {
            allRows[rowIndex][statusColName] = 'Failed';
            stats.failed++;
            addLog(`❌ Failed to send to +${phone} (row ${rowIndex + 2}): ${error.message}`, 'error');
            console.error(`Failed for +${phone}:`, error);
        }

        stats.remaining = numbersToSend.length - (i + 1);
        updateStats();
        updateProgress(numbersToSend.length);

        if (i < numbersToSend.length - 1 && isProcessing) {
            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
            const delaySec = Math.round(delay / 1000);
            addLog(`⏳ Waiting ${delaySec} seconds before next message...`, 'info');
            console.log(`Waiting ${delaySec} seconds...`);
            await sleep(delay);
        }
    }

    if (isProcessing) {
        addLog(`✅ Bulk sending completed! Sent: ${stats.sent}, Failed: ${stats.failed}`, 'success');
        console.log('Bulk sending completed');
    }

    isProcessing = false;
    el.stopBtn.classList.add('hidden');
    el.startBtn.classList.remove('hidden');
    el.downloadBtn.classList.remove('hidden');
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

function downloadUpdatedFile() {
    try {
        // Reorder columns: ensure Status comes after PHONE
        const columns = Object.keys(allRows[0]);
        const phoneIndex = columns.indexOf(phoneColName);
        const statusIndex = columns.indexOf(statusColName);

        let orderedColumns;
        if (statusIndex === -1 || statusIndex !== phoneIndex + 1) {
            // Rebuild column order
            orderedColumns = [...columns];
            if (statusIndex !== -1) {
                orderedColumns.splice(statusIndex, 1);
            }
            orderedColumns.splice(phoneIndex + 1, 0, statusColName);
        } else {
            orderedColumns = columns;
        }

        // Create ordered data
        const orderedData = allRows.map(row => {
            const orderedRow = {};
            orderedColumns.forEach(col => {
                orderedRow[col] = row[col] !== undefined ? row[col] : '';
            });
            return orderedRow;
        });

        // Create new worksheet
        const newSheet = XLSX.utils.json_to_sheet(orderedData, { header: orderedColumns });

        // Set column widths
        const colWidths = orderedColumns.map(col => ({ wch: Math.max(col.length + 2, 15) }));
        newSheet['!cols'] = colWidths;

        // Create new workbook
        const newWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWorkbook, newSheet, workbookData.SheetNames[0]);

        // Generate file
        const wbout = XLSX.write(newWorkbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `updated_${Date.now()}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);

        addLog('💾 Updated Excel file downloaded', 'success');
        console.log('File downloaded successfully');

    } catch (error) {
        addLog(`Error downloading file: ${error.message}`, 'error');
        console.error('Download error:', error);
    }
}

function updateStats() {
    el.statTotal.textContent = stats.total;
    el.statSent.textContent = stats.sent;
    el.statFailed.textContent = stats.failed;
    el.statRemaining.textContent = stats.remaining;
}

function updateProgress(total) {
    const progress = ((stats.sent + stats.failed) / total) * 100;
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