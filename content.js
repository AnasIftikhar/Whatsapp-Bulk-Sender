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

                console.log('Content script: Message typed, waiting 5 seconds before sending');

                // Wait 5 seconds then press Enter to send
                setTimeout(() => {
                    console.log('Content script: Pressing Enter to send message');

                    // Try multiple Enter key event approaches
                    const enterKeyDown = new KeyboardEvent('keydown', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    });

                    const enterKeyPress = new KeyboardEvent('keypress', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    });

                    const enterKeyUp = new KeyboardEvent('keyup', {
                        key: 'Enter',
                        code: 'Enter',
                        keyCode: 13,
                        which: 13,
                        bubbles: true,
                        cancelable: true
                    });

                    messageBox.dispatchEvent(enterKeyDown);
                    messageBox.dispatchEvent(enterKeyPress);
                    messageBox.dispatchEvent(enterKeyUp);

                    console.log('Content script: Enter key events dispatched');

                    if (!responded) {
                        responded = true;
                        sendResponse({ success: true });
                    }
                }, 5000);
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