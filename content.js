chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'sendMessage') {
        console.log('Content script: Received sendMessage request');

        let responded = false;

        const interval = setInterval(() => {
            const messageBox = document.querySelector('div[contenteditable="true"][data-lexical-editor="true"][data-tab="10"]') ||
                document.querySelector('div[role="textbox"][contenteditable="true"][data-tab="10"]') ||
                document.querySelector('div.lexical-rich-text-input div[contenteditable="true"]');

            if (messageBox) {
                console.log('Content script: Message box found, typing message');
                clearInterval(interval);

                // Set the message
                messageBox.focus();

                // Insert text properly
                document.execCommand('insertText', false, request.message);

                // Trigger input event
                const inputEvent = new InputEvent('input', { bubbles: true });
                messageBox.dispatchEvent(inputEvent);

                console.log('Content script: Message typed, waiting 3 seconds before sending');

                // Wait 3 seconds then click send button
                setTimeout(() => {
                    console.log('Content script: Looking for send button');

                    // Find send button with multiple selectors
                    const sendBtn = document.querySelector('button[aria-label="Send"]') ||
                        document.querySelector('span[data-icon="wds-ic-send-filled"]')?.parentElement?.parentElement ||
                        Array.from(document.querySelectorAll('button')).find(btn =>
                            btn.querySelector('span[data-icon="wds-ic-send-filled"]')
                        );

                    if (sendBtn) {
                        console.log('Content script: Send button found, clicking');
                        sendBtn.click();
                        console.log('Content script: Send button clicked');
                    } else {
                        console.error('Content script: Send button not found, trying Enter key');
                        // Fallback to Enter key
                        const enterEvent = new KeyboardEvent('keydown', {
                            key: 'Enter',
                            keyCode: 13,
                            which: 13,
                            bubbles: true
                        });
                        messageBox.dispatchEvent(enterEvent);
                    }
                }, 3000);
            }
        }, 1000);

        // Timeout after 20 seconds
        setTimeout(() => {
            clearInterval(interval);
            if (!responded) {
                responded = true;
                console.error('Content script: Timeout - message box not found');
                sendResponse({ success: false, error: 'Timeout waiting for WhatsApp to load' });
            }
        }, 20000);

        return true; // Keep channel open for async response
    }
});