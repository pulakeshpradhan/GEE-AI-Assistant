/*
Copyright © 2025 Pulakesh Pradhan.
All rights reserved.

This file is part of the project: GEE AI Assistant.
For permissions or inquiries, contact: pulakeshpradhan@ravenshawuniversity.ac.in
*/

(function () {
    'use strict';

    const hostname = window.location.hostname;

    // --- Configuration for supported platforms ---
    const SITE_CONFIG = {
        'gemini.google.com': {
            codeBlock: ['pre', '.code-block'],
            inputArea: ['rich-textarea', 'div[role="textbox"]'],
            inputContainer: '.input-area, .toolbar, .speech_input_container',
            pasteMethod: 'execCommand'
        },
        'chatgpt.com': {
            codeBlock: ['pre', '.overflow-visible'],
            inputArea: ['#prompt-textarea'],
            inputContainer: '#prompt-textarea + div, form div:has(textarea)',
            pasteMethod: 'nativeValueSetter'
        },
        'claude.ai': {
            codeBlock: ['pre'],
            inputArea: ['div[contenteditable="true"]'],
            inputContainer: 'div[contenteditable="true"] + div',
            pasteMethod: 'execCommand'
        },
        'copilot.microsoft.com': {
            codeBlock: ['div.ac-textBlock', 'pre'],
            inputArea: ['textarea', 'div[contenteditable="true"]'],
            inputContainer: '.input-container',
            pasteMethod: 'execCommand'
        },
        'grok.com': {
            codeBlock: ['pre'],
            inputArea: ['textarea'],
            inputContainer: 'textarea + div',
            pasteMethod: 'execCommand'
        },
        'chat.deepseek.com': {
            codeBlock: ['pre.code-block', 'pre'],
            inputArea: ['textarea', 'div[contenteditable="true"]'],
            inputContainer: 'div.input-box',
            pasteMethod: 'execCommand'
        },
        'chat.qwen.ai': {
            codeBlock: ['pre'],
            inputArea: ['textarea'],
            inputContainer: 'textarea + div',
            pasteMethod: 'execCommand'
        },
        'www.kimi.com': {
            codeBlock: ['pre.code-block'],
            inputArea: ['div[contenteditable="true"]'],
            inputContainer: 'div.input-toolbar',
            pasteMethod: 'execCommand'
        }
    };

    // Determine current config
    let currentConfig = null;
    for (const site in SITE_CONFIG) {
        if (hostname.includes(site)) {
            currentConfig = SITE_CONFIG[site];
            break;
        }
    }

    // fallback if no config matches perfectly but we want to try generic support
    if (!currentConfig) {
        currentConfig = {
            codeBlock: ['pre'],
            inputArea: ['textarea', 'div[contenteditable="true"]'],
            inputContainer: 'body',
            pasteMethod: 'execCommand'
        };
    }

    console.log(`GEE AI Assistant: Injector active for ${hostname}`);


    /**
     * Creates and injects Transfer buttons (Insert/Replace) into code blocks.
     */
    function addTransferButtons(node) {
        if (!currentConfig.codeBlock) return;

        // Collect all potential code blocks
        const possibleBlocks = [];
        currentConfig.codeBlock.forEach(selector => {
            node.querySelectorAll(selector).forEach(el => possibleBlocks.push(el));
        });

        const uniqueBlocks = [...new Set(possibleBlocks)];

        uniqueBlocks.forEach(block => {
            // Check if already has buttons
            if (block.parentNode.querySelector('.gee-btn-container') || block.querySelector('.gee-btn-container')) return;

            // Create container
            const container = document.createElement('div');
            container.className = 'gee-btn-container';
            container.style.cssText = `
                display: flex;
                gap: 10px;
                margin-top: 5px;
                margin-bottom: 10px;
                position: relative;
                z-index: 10;
            `;

            // Button 1: Insert Code
            const insertIcon = '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>'; // Add icon
            const btnInsert = createPillBtn('add code', '#4285F4', insertIcon);
            btnInsert.onclick = (e) => {
                e.stopPropagation();
                sendCode(block, 'INSERT', btnInsert);
            };

            // Button 2: Replace Full Script
            const replaceIcon = '<path d="M19 8l-4 4h3c0 3.31-2.69 6-6 6-1.01 0-1.97-.25-2.8-.7l-1.46 1.46C8.97 19.54 10.43 20 12 20c4.42 0 8-3.58 8-8h3l-4-4zM6 12c0-3.31 2.69-6 6-6 1.01 0 1.97.25 2.8.7l1.46-1.46C15.03 4.46 13.57 4 12 4c-4.42 0-8 3.58-8 8H1l4 4 4-4H6z"/>'; // Sync/Replace
            const btnReplace = createPillBtn('replace', '#EA4335', replaceIcon);
            btnReplace.onclick = (e) => {
                e.stopPropagation();
                sendCode(block, 'REPLACE', btnReplace);
            };

            container.appendChild(btnInsert);
            container.appendChild(btnReplace);

            // Insert location logic
            // Usually append after the block
            if (block.nextSibling) {
                block.parentNode.insertBefore(container, block.nextSibling);
            } else {
                block.parentNode.appendChild(container);
            }
        });
    }

    /**
     * Creates and injects Input Controls (Get Code/Errors) into the chat input area.
     */
    function addInputControls() {
        if (!currentConfig.inputArea) return;

        // Try to find the input area
        let inputArea = null;
        for (const selector of currentConfig.inputArea) {
            inputArea = document.querySelector(selector);
            if (inputArea) break;
        }

        if (inputArea && !document.querySelector('#gee-input-controls')) {
            // Find a suitable parent to attach controls
            // Logic: Try to find a toolbar or container near the input
            const parent = inputArea.closest(currentConfig.inputContainer) || inputArea.parentElement;

            if (parent) {
                const container = document.createElement('div');
                container.id = 'gee-input-controls';
                container.style.cssText = `
                    display: flex;
                    gap: 8px;
                    padding: 5px;
                    margin-top: 5px;
                `;

                // Button: Import GEE Code (Blue Code Icon)
                const codeIconPath = '<path d="M9.4 16.6L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4zm5.2 0l4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4z"/>';
                const btnFetch = createPillBtn('Import Code', '#1a73e8', codeIconPath);

                btnFetch.onclick = () => {
                    chrome.runtime.sendMessage({ action: 'GET_GEE_CODE' });
                    updateBtnLabel(btnFetch, 'Importing...');
                    setTimeout(() => updateBtnLabel(btnFetch, 'Import Code'), 2000);
                };

                // Button: Import Errors (Red Warning Icon)
                const errorIconPath = '<path d="M11 15h2v2h-2zm0-8h2v6h-2zm.99-5C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8z"/>';
                const btnFetchErrors = createPillBtn('Import Errors', '#d93025', errorIconPath);

                btnFetchErrors.onclick = () => {
                    chrome.runtime.sendMessage({ action: 'GET_GEE_CONSOLE_ERRORS' });
                    updateBtnLabel(btnFetchErrors, 'Checking...');
                    setTimeout(() => updateBtnLabel(btnFetchErrors, 'Import Errors'), 2000);
                };

                container.appendChild(btnFetch);
                container.appendChild(btnFetchErrors);

                // Append to parent.
                parent.appendChild(container);
            }
        }
    }

    function createPillBtn(text, iconColor, svgPath) {
        const btn = document.createElement('button');

        // Icon SVG
        const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        icon.setAttribute('width', '14');
        icon.setAttribute('height', '14');
        icon.setAttribute('viewBox', '0 0 24 24');
        icon.setAttribute('fill', iconColor);
        icon.style.marginRight = '6px';
        icon.innerHTML = svgPath;

        const span = document.createElement('span');
        span.className = 'btn-text';
        span.innerText = text;

        btn.appendChild(icon);
        btn.appendChild(span);

        btn.style.cssText = `
            display: inline-flex;
            align-items: center;
            background-color: white;
            color: #3c4043;
            border: 1px solid #dadce0;
            padding: 4px 10px;
            border-radius: 12px;
            cursor: pointer;
            font-family: 'Roboto', 'Google Sans', sans-serif, system-ui;
            font-size: 12px;
            font-weight: 500;
            transition: all 0.2s;
            box-shadow: 0 1px 1px rgba(60,64,67,0.1);
            white-space: nowrap;
            height: 24px;
        `;

        btn.onmouseover = () => {
            btn.style.backgroundColor = '#f1f3f4';
            btn.style.borderColor = '#d2e3fc';
            btn.style.color = '#1a73e8';
        };
        btn.onmouseout = () => {
            btn.style.backgroundColor = 'white';
            btn.style.borderColor = '#dadce0';
            btn.style.color = '#3c4043';
        };

        return btn;
    }

    function updateBtnLabel(btn, newText) {
        const span = btn.querySelector('.btn-text');
        if (span) span.innerText = newText;
    }

    function sendCode(block, mode, btnElement) {
        // Extract text
        const codeEl = block.querySelector('code') || block;
        const code = codeEl.innerText.trim();

        if (!code) {
            alert("No code found in this block.");
            return;
        }

        // Get text from span
        const span = btnElement.querySelector('.btn-text');
        const originalText = span ? span.innerText : btnElement.innerText;

        updateBtnLabel(btnElement, 'Sending...');

        chrome.runtime.sendMessage({
            action: 'CODE_GENERATED',
            code: code,
            mode: mode
        }, (response) => {
            // Visual feedback
            updateBtnLabel(btnElement, mode === 'INSERT' ? 'Inserted!' : 'Replaced!');
            setTimeout(() => updateBtnLabel(btnElement, originalText), 2000);
        });
    }

    // --- Message Handling (Paste into Input) ---
    // 1. Listen for background messages (Tabs & Side Panel Broadcasts)
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'INSERT_INTO_GEMINI' || message.action === 'INSERT_CONSOLE_ERRORS') {
            insertTextIntoInput(message);
        }
    });

    // 2. Listen for window messages (Backup for Iframe bridge if needed)
    window.addEventListener("message", (event) => {
        const message = event.data;
        if (message && (message.action === 'INSERT_INTO_GEMINI' || message.action === 'INSERT_CONSOLE_ERRORS')) {
            insertTextIntoInput(message);
        }
    });

    function insertTextIntoInput(message) {
        let inputField = null;
        for (const selector of currentConfig.inputArea) {
            inputField = document.querySelector(selector);
            if (inputField) break;
        }

        if (!inputField) {
            console.error("GEE AI Assistant: Could not find input field to paste code.");
            alert("Could not find the chat input field.");
            return;
        }

        inputField.focus();

        let textToPaste = "";
        const code = message.code;

        if (message.action === 'INSERT_CONSOLE_ERRORS') {
            const errors = message.errors || "No errors detected.";
            textToPaste = "I am getting the following errors in Google Earth Engine:\n```\n" + errors + "\n```\nCan you please write the full corrected code?";
        } else {
            // Helper to determine source roughly
            const prefix = message.source === 'gitiles' ? "content of the Gitiles file I'm viewing" : "current GEE code";
            textToPaste = `Here is the ${prefix}:\n\`\`\`javascript\n${code}\n\`\`\`\n`;
        }

        // Execute Paste
        if (currentConfig.pasteMethod === 'nativeValueSetter') {
            // For React-controlled inputs (like ChatGPT)
            const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
            nativeTextAreaValueSetter.call(inputField, textToPaste);
            inputField.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            // Standard execCommand
            document.execCommand('insertText', false, textToPaste);
        }
    }


    // --- Observer for Dynamics ---
    const observer = new MutationObserver((mutations) => {
        // Debounce or just run? Running directly is usually fine for these lightweight checks
        addTransferButtons(document.body);
        addInputControls();
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Initial run
    setTimeout(() => {
        addTransferButtons(document.body);
        addInputControls();
    }, 1000);

})();