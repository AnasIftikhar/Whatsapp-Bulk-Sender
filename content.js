// Listen for the initial setup message
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'monitorChat') {
        console.log('Content script: Starting chat monitoring for message send detection');

        let checkInterval = null;
        let messageSentNotified = false;

        // Function to check if message was sent (look for checkmarks)
        const checkMessageSent = () => {
            if (messageSentNotified) return;

            // Look for the double checkmark icon (delivered status)
            const deliveredIcon = document.querySelector('span[data-icon="msg-dblcheck"]');

            // Also check for single checkmark (sent but not delivered yet)
            const sentIcon = document.querySelector('span[data-icon="msg-check"]');

            // Check for the time display in sent message structure
            const lastMessageTime = document.querySelector('.x1n2onr6.x1n327nk .x13yyeie span[dir="auto"]');

            if (deliveredIcon || sentIcon || lastMessageTime) {
                console.log('Content script: Message sent/delivered detected!');
                messageSentNotified = true;

                if (checkInterval) {
                    clearInterval(checkInterval);
                }

                // Notify background script that message was sent
                chrome.runtime.sendMessage({
                    action: 'messageSent'
                }).catch(() => {
                    console.log('Message sent notification delivered');
                });
            }
        };

        // Wait for chat to load
        const waitForChat = setInterval(() => {
            const messageBox = document.querySelector('div[contenteditable="true"][data-lexical-editor="true"]') ||
                document.querySelector('div[role="textbox"][contenteditable="true"]');

            if (messageBox) {
                clearInterval(waitForChat);
                console.log('Content script: Chat loaded, monitoring for sent messages...');

                // Start checking for sent message every 500ms
                checkInterval = setInterval(checkMessageSent, 500);

                // Also listen for Enter key press in message box
                messageBox.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        console.log('Content script: Enter key detected, will check for sent status...');
                        // Start aggressive checking after Enter
                        setTimeout(() => {
                            const fastCheck = setInterval(() => {
                                checkMessageSent();
                                if (messageSentNotified) {
                                    clearInterval(fastCheck);
                                }
                            }, 200);

                            // Stop fast checking after 5 seconds
                            setTimeout(() => clearInterval(fastCheck), 5000);
                        }, 100);
                    }
                });

                // Listen for send button clicks
                document.addEventListener('click', (e) => {
                    const target = e.target.closest('button[aria-label*="Send"]') ||
                        e.target.closest('span[data-icon="send"]')?.closest('button') ||
                        e.target.closest('span[data-icon="wds-ic-send-filled"]')?.closest('button');

                    if (target) {
                        console.log('Content script: Send button clicked, will check for sent status...');
                        // Start aggressive checking after click
                        setTimeout(() => {
                            const fastCheck = setInterval(() => {
                                checkMessageSent();
                                if (messageSentNotified) {
                                    clearInterval(fastCheck);
                                }
                            }, 200);

                            // Stop fast checking after 5 seconds
                            setTimeout(() => clearInterval(fastCheck), 5000);
                        }, 100);
                    }
                }, true);

                sendResponse({ success: true });
            }
        }, 1000);

        // Timeout after 30 seconds
        setTimeout(() => {
            clearInterval(waitForChat);
        }, 30000);

        return true; // Keep channel open
    }
});