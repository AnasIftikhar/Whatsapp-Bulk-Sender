let phoneNumbers = [];
let allRows = [];
let workbookData = null;
let originalSheet = null;
let phoneColName = null;
let companyColName = null;  // Add this line
let statusColName = 'Status';
let isProcessing = false;
let currentIndex = 0;
let stats = { total: 0, sent: 0, failed: 0, remaining: 0, skipped: 0 };
let waitingForConfirmation = false;
let confirmationResolver = null;
let currentOpenTabId = null;
let pausedState = null;

// Template Variants - Will loop through for each company
const messageTemplates = [
    // Variant 1: Simple & Direct
    `Salam! 👋

Quick question for {COMPANY_NAME} - are you spending too much time finding new customers?

I can help. I give you ready-to-call leads with phone numbers and emails.

✅ Any business: Doctors, IT, Construction, Real Estate, Lawyers, Online Shops
✅ Any country: USA, UK, UAE, Canada, Australia + more
✅ Complete details: Phone, Email, Address, Website
✅ Excel file - easy to use

FREE TEST: Tell me [Your Business Type + Country] and I'll send you 20 leads to try.

Good prices for Pakistani businesses.

leads.leadoxify.online`,

    // Variant 2: Problem-Focused
    `Hi there! 👋

I noticed {COMPANY_NAME} and wanted to help you get more customers.

The problem? Finding good leads takes too much time.

The solution? I give you verified contact lists - people who actually need your service.

📞 Phone numbers that work
📧 Real email addresses
🌍 Any country you want
💼 Excel format - start calling today

Want to try first? Send me [Your Industry + Country] → Get 20 FREE leads right now.

Cheap packages. Fast delivery.

leads.leadoxify.online`,

    // Variant 3: Benefit-Driven
    `Assalam o Alaikum! 👋

{COMPANY_NAME} - imagine your sales team calling people who are already interested.

That's what I provide:

✔️ Real phone numbers and emails
✔️ Businesses in your industry
✔️ Any country: USA, UK, UAE, Canada, Australia
✔️ Ready to download and use

No more searching. Just calling and closing deals.

FREE SAMPLE: Reply with [What You Sell + Which Country] and get 20 leads free.

Easy prices for Pakistan.

leads.leadoxify.online`,

    // Variant 4: Conversational
    `Salam! 👋

Hope {COMPANY_NAME} is doing well!

I help businesses like yours find new customers faster.

Here's how: I give you contact lists with:
- Phone numbers
- Email addresses  
- Complete business details
- Any industry, any country

You just download the Excel file and start calling. Simple.

Try before you buy: Tell me [Your Business + Target Country] and I'll send 20 leads FREE.

Good prices. Fast service. Real results.

leads.leadoxify.online`,

    // Variant 5: Results-Focused
    `Hi! 👋

{COMPANY_NAME} - want more sales calls that actually work?

I provide qualified leads with complete contact info:

🎯 Medical, IT, Construction, Real Estate, Legal, Online Business
🌐 USA, UK, UAE, Canada, Australia + 50 countries
📋 Phone + Email + Address + Website
📊 Excel format - download and start today

More leads = More calls = More customers 📞

FREE PROOF: Send [Your Industry + Country] → Get 20 real prospects now.

Affordable for Pakistani budgets.

leads.leadoxify.online`
];

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
    resumeBtn: document.getElementById('resumeBtn'),
    confirmSentBtn: document.getElementById('confirmSentBtn'),
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

// === FUNCTION DEFINITIONS (MUST BE BEFORE EVENT LISTENERS) ===

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

            // Check for Company Name column (optional - for personalization)
            companyColName = columns.find(col =>
                col.toLowerCase() === 'name'  // lowercase 'name'
            );

            // Log which column was detected
            if (companyColName) {
                addLog(`✅ Company name column detected: "${companyColName}"`, 'success');
                console.log(`Company name column found: ${companyColName}`);
            } else {
                addLog(`⚠️ No company name column found. Using "there" as fallback.`, 'warning');
                console.log('No company name column detected');
            }
            if (!phoneColName) {
                throw new Error('No "PHONE" column found');
            }

            const hasStatus = columns.some(col => col.toLowerCase() === 'status');

            if (!hasStatus) {
                statusColName = 'Status';
                rows.forEach(row => row[statusColName] = '');
                addLog('Status column created after PHONE column', 'info');
            } else {
                statusColName = columns.find(col => col.toLowerCase() === 'status');
            }

            allRows = rows;

            phoneNumbers = [];
            allRows.forEach((row, idx) => {
                const phone = row[phoneColName];
                const status = row[statusColName] || '';

                if (phone && status.toLowerCase() !== 'sent') {
                    const cleanPhone = String(phone).replace(/\D/g, '');
                    if (cleanPhone) {
                        // Get company name for personalization (if column exists)
                        const companyName = companyColName ? (row[companyColName] || 'there') : 'there';

                        phoneNumbers.push({
                            phone: cleanPhone,
                            rowIndex: idx,
                            companyName: companyName  // Store company name
                        });
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
            console.error('File parsing error:', error);
            addLog(`Error: ${error.message}`, 'error');
        }
    };

    reader.onerror = (error) => {
        console.error('File reading error:', error);
        alert('Error reading file');
    };

    reader.readAsArrayBuffer(file);
}

async function startSending() {
    if (isProcessing || phoneNumbers.length === 0) return;

    pausedState = null;
    el.resumeBtn.classList.add('hidden');

    const minDelay = parseInt(el.minDelay.value) * 1000;
    const maxDelay = parseInt(el.maxDelay.value) * 1000;

    if (minDelay >= maxDelay) {
        alert('Min delay must be less than max delay');
        return;
    }

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
        const { phone, rowIndex, companyName } = numbersToSend[i];

        // Select template variant using modulo for looping
        const templateIndex = i % messageTemplates.length;  // Loop through templates
        const selectedTemplate = messageTemplates[templateIndex];

        // Personalize message with company name
        const personalizedMessage = selectedTemplate.replace(/{COMPANY_NAME}/g, companyName);

        addLog(`📤 Row ${rowIndex + 2} / queued ${i + 1} — Template ${templateIndex + 1} — sending to +${phone}...`, 'info');
        console.log(`Attempting to send to: +${phone} (row ${rowIndex + 2}) using Template ${templateIndex + 1}`);

        try {
            await sendMessage(phone, personalizedMessage);  // Use personalized message
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
    if (currentOpenTabId) {
        chrome.tabs.remove(currentOpenTabId).catch(() => { });
        currentOpenTabId = null;
    }

    if (waitingForConfirmation) {
        el.confirmSentBtn.classList.add('hidden');
        waitingForConfirmation = false;

        if (confirmationResolver) {
            confirmationResolver = null;
        }
    }

    pausedState = {
        currentIndex: currentIndex,
        stats: { ...stats },
        message: el.messageText.value.trim(),
        minDelay: parseInt(el.minDelay.value) * 1000,
        maxDelay: parseInt(el.maxDelay.value) * 1000
    };

    isProcessing = false;

    el.stopBtn.classList.add('hidden');
    el.resumeBtn.classList.remove('hidden');

    addLog('⏹️ Sending paused. Click "Resume Sending" to continue.', 'warning');
    console.log('Process paused by user. State saved for resume.');
}

async function resumeSending() {
    if (!pausedState) {
        alert('No paused session found. Please start a new sending process.');
        return;
    }

    if (isProcessing) return;

    const message = pausedState.message;
    const minDelay = pausedState.minDelay;
    const maxDelay = pausedState.maxDelay;

    const sendLimitValue = el.sendLimit.value.trim();
    const sendLimit = sendLimitValue ? parseInt(sendLimitValue) : phoneNumbers.length;
    const numbersToSend = phoneNumbers.slice(0, sendLimit);

    const startIndex = pausedState.currentIndex;

    if (startIndex >= numbersToSend.length) {
        alert('All messages in the queue have been processed.');
        pausedState = null;
        el.resumeBtn.classList.add('hidden');
        return;
    }

    isProcessing = true;
    currentIndex = startIndex;

    stats = { ...pausedState.stats };

    el.resumeBtn.classList.add('hidden');
    el.stopBtn.classList.remove('hidden');
    el.statsContainer.classList.remove('hidden');
    el.progressContainer.classList.remove('hidden');

    addLog(`▶️ Resuming from message ${startIndex + 1} of ${numbersToSend.length}...`, 'info');
    console.log(`Resuming bulk send from index ${startIndex}`);

    for (let i = startIndex; i < numbersToSend.length; i++) {
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
        pausedState = null;
    }

    isProcessing = false;
    el.stopBtn.classList.add('hidden');
    el.startBtn.classList.remove('hidden');
    el.resumeBtn.classList.add('hidden');
    el.downloadBtn.classList.remove('hidden');
}

function confirmMessageSent() {
    console.log('User confirmed message was sent');
    addLog('✅ User confirmed message sent manually', 'success');

    el.confirmSentBtn.classList.add('hidden');
    waitingForConfirmation = false;

    if (currentOpenTabId) {
        chrome.tabs.remove(currentOpenTabId).catch(() => { });
        currentOpenTabId = null;
    }

    if (confirmationResolver) {
        confirmationResolver({ success: true, manual: true });
        confirmationResolver = null;
    }
}

async function sendMessage(phone, message) {
    return new Promise((resolve, reject) => {
        const url = `https://web.whatsapp.com/send/?phone=${phone}&text=${encodeURIComponent(message)}&type=phone_number&app_absent=0`;

        console.log(`Opening WhatsApp tab for +${phone}`);

        chrome.tabs.create({ url: url, active: true }, (tab) => {
            const tabId = tab.id;
            currentOpenTabId = tabId;
            let resolved = false;
            let notificationInterval = null;

            const timeout = setTimeout(() => {
                if (!resolved && !waitingForConfirmation) {
                    resolved = true;
                    if (notificationInterval) clearInterval(notificationInterval);
                    chrome.tabs.remove(tabId).catch(() => { });
                    reject(new Error('Timeout waiting for WhatsApp'));
                }
            }, 300000);

            confirmationResolver = (result) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    if (notificationInterval) clearInterval(notificationInterval);
                    chrome.tabs.onRemoved.removeListener(tabClosedListener);
                    resolve(result);
                }
            };

            const tabClosedListener = (closedTabId) => {
                if (closedTabId === tabId) {
                    console.log(`Tab closed for +${phone}`);
                    currentOpenTabId = null;

                    if (notificationInterval) clearInterval(notificationInterval);

                    if (waitingForConfirmation) {
                        waitingForConfirmation = false;
                        el.confirmSentBtn.classList.add('hidden');

                        if (!resolved) {
                            resolved = true;
                            clearTimeout(timeout);
                            chrome.tabs.onRemoved.removeListener(tabClosedListener);
                            reject(new Error('Tab closed without confirmation'));
                        }
                    }
                }
            };

            chrome.tabs.onRemoved.addListener(tabClosedListener);

            chrome.tabs.onUpdated.addListener(function listener(updatedTabId, changeInfo) {
                if (updatedTabId === tabId && changeInfo.status === 'complete') {
                    console.log(`Tab loaded for +${phone}, waiting for manual confirmation...`);

                    setTimeout(() => {
                        const showNotification = () => {
                            if (resolved) return;

                            const currentTime = new Date().toLocaleString();

                            chrome.notifications.create({
                                type: 'basic',
                                iconUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%2325D366" width="100" height="100"/><text x="50" y="70" font-size="60" text-anchor="middle" fill="white">📱</text></svg>',
                                title: '⚠️ WhatsApp Reminder',
                                message: `Phone: +${phone}\nTime: ${currentTime}\n\n🔔 Send your message manually!\nThen click "I Sent the Message" button.`,
                                priority: 2,
                                requireInteraction: true
                            });

                            console.log(`Notification shown for +${phone} at ${currentTime}`);
                        };

                        showNotification();

                        waitingForConfirmation = true;
                        el.confirmSentBtn.classList.remove('hidden');
                        addLog(`⏸️ Waiting for you to send message to +${phone} and click confirmation...`, 'warning');

                        notificationInterval = setInterval(() => {
                            if (resolved) {
                                clearInterval(notificationInterval);
                                return;
                            }

                            chrome.tabs.get(tabId, (tab) => {
                                if (chrome.runtime.lastError || !tab) {
                                    console.log(`Tab no longer exists`);
                                    clearInterval(notificationInterval);
                                    if (!resolved) {
                                        resolved = true;
                                        clearTimeout(timeout);
                                        chrome.tabs.onUpdated.removeListener(listener);
                                        chrome.tabs.onRemoved.removeListener(tabClosedListener);
                                        reject(new Error('Tab closed'));
                                    }
                                } else {
                                    showNotification();
                                }
                            });
                        }, 10000);

                        chrome.tabs.onUpdated.removeListener(listener);

                    }, 3000);
                }
            });
        });
    });
}

function downloadUpdatedFile() {
    try {
        const columns = Object.keys(allRows[0]);
        const phoneIndex = columns.indexOf(phoneColName);
        const statusIndex = columns.indexOf(statusColName);

        let orderedColumns;
        if (statusIndex === -1 || statusIndex !== phoneIndex + 1) {
            orderedColumns = [...columns];
            if (statusIndex !== -1) {
                orderedColumns.splice(statusIndex, 1);
            }
            orderedColumns.splice(phoneIndex + 1, 0, statusColName);
        } else {
            orderedColumns = columns;
        }

        const orderedData = allRows.map(row => {
            const orderedRow = {};
            orderedColumns.forEach(col => {
                orderedRow[col] = row[col] !== undefined ? row[col] : '';
            });
            return orderedRow;
        });

        const newSheet = XLSX.utils.json_to_sheet(orderedData, { header: orderedColumns });

        const colWidths = orderedColumns.map(col => ({ wch: Math.max(col.length + 2, 15) }));
        newSheet['!cols'] = colWidths;

        const newWorkbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(newWorkbook, newSheet, workbookData.SheetNames[0]);

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

// === EVENT LISTENERS (MUST BE AFTER FUNCTION DEFINITIONS) ===

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
el.resumeBtn.addEventListener('click', resumeSending);
el.confirmSentBtn.addEventListener('click', confirmMessageSent);
el.downloadBtn.addEventListener('click', downloadUpdatedFile);