// gee_injector.js (Run in MAIN world)
console.log("GEE AI Assistant: Injector (Main World) loaded.");

// Visual Notification Helper
// Visual Notification Helper
function showNotification(message, type = 'info') {
    const box = document.createElement('div');
    const isError = type === 'error';
    const icon = isError ? '⚠️' : '✅';

    box.innerHTML = `<span style="margin-right:8px">${icon}</span>${message}`;

    box.style.cssText = `
        position: fixed;
        top: 20px;
        right: 50%;
        transform: translateX(50%);
        background-color: white;
        color: #3c4043;
        border: 1px solid #dadce0;
        padding: 10px 24px;
        border-radius: 100px;
        z-index: 99999;
        font-family: 'Google Sans', sans-serif;
        box-shadow: 0 4px 12px rgba(60,64,67,0.15);
        font-size: 14px;
        font-weight: 500;
        display: flex;
        align-items: center;
        opacity: 0;
        transition: opacity 0.3s;
    `;
    document.body.appendChild(box);

    // Fade in
    requestAnimationFrame(() => box.style.opacity = '1');

    // Fade out and remove
    setTimeout(() => {
        box.style.opacity = '0';
        setTimeout(() => box.remove(), 300);
    }, 4000);
}

window.addEventListener("message", (event) => {
    // Only accept messages from the same window (content script proxy)
    if (event.source !== window) return;

    if (event.data.type === "GEE_GEMINI_INSERT") {
        console.log("GEE Injector: Inserting code...");
        insertCode(event.data.code, event.data.mode);
    }

    if (event.data.type === "GEE_GEMINI_FETCH") {
        console.log("GEE Injector: Fetching code...");
        const code = getCode();
        if (code) {
            window.postMessage({
                type: "GEE_GEMINI_RETURN_CODE",
                code: code,
                source_id: event.data.source_id
            }, "*");
            showNotification("Code read successfully!");
        } else {
            showNotification("Failed to read code.", "error");
        }
    }

    if (event.data.type === "GEE_GEMINI_FETCH_ERRORS") {
        console.log("GEE Injector: Fetching errors...");
        const errors = getConsoleErrors();

        window.postMessage({
            type: "GEE_GEMINI_RETURN_ERRORS",
            errors: errors,
            source_id: event.data.source_id
        }, "*");
        showNotification("Console errors read!");
    }
});

function getAceEditor() {
    // Priority 1: Check if 'ace' is globally defined and we can access the editor via the DOM element
    const editorEl = document.querySelector('.ace_editor');
    if (!editorEl) return null;

    // Check if the element has an associated editor environement (common in Ace)
    if (editorEl.env && editorEl.env.editor) {
        return editorEl.env.editor;
    }

    // Check via global Ace object
    if (window.ace && window.ace.edit) {
        // Warning: ace.edit() might re-initialize if not careful, but usually safe to get instance
        try {
            return window.ace.edit(editorEl);
        } catch (e) {
            console.error("Ace edit access failed:", e);
        }
    }

    return null;
}

function insertCode(code, mode) {
    const editor = getAceEditor();

    if (editor) {
        if (mode === 'REPLACE') {
            editor.setValue(code, 1); // 1 = moves cursor to end, but we reset it
            editor.clearSelection();
            editor.scrollToLine(0);
            showNotification("Script replaced successfully.");
        } else {
            // INSERT at cursor
            editor.insert(code);
            showNotification("Code inserted successfully.");
        }
        editor.focus();
    } else {
        // Fallback: Clipboard API + Paste
        console.warn("Ace Editor API not found. Attempting fallback...");

        const input = document.querySelector('.ace_text-input');
        if (input) {
            input.focus();

            // Note: Use navigator.clipboard if available (requires focus/permission)
            // Or older execCommand
            const dt = new DataTransfer();
            dt.setData("text/plain", code);
            const evt = new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true });
            input.dispatchEvent(evt);

            if (!evt.defaultPrevented) {
                // If event wasn't handled by Ace, try raw insertion (risky)
                document.execCommand('insertText', false, code);
            }
            showNotification("Code pasted (Fallback mode).");
        } else {
            alert("Could not find GEE Code Editor. Please ensure you are on the Code Editor tab and it is fully loaded.");
        }
    }
}

function getCode() {
    const editor = getAceEditor();
    if (editor) {
        return editor.getValue();
    } else {
        const editorEl = document.querySelector('.ace_editor');
        if (editorEl) return editorEl.innerText; // Poor substitute but something
        return null;
    }
}

function getConsoleErrors() {
    // 1. Try formatted console messages in the main DOM
    const rightPanel = document.querySelector('.goog-splitpane-second-container') || document.body;
    let foundErrors = [];

    // --- Main DOM Selectors ---
    const mainSelectors = [
        '.goog-console-message-error',
        '.console-error',
        '.error-message',
        'div[style*="color: red"]',
        'span[style*="color: red"]',
        '.goog-console-message-text'
    ];

    // Check main DOM
    mainSelectors.forEach(selector => {
        rightPanel.querySelectorAll(selector).forEach(el => {
            if (el.innerText && el.innerText.trim().length > 0) {
                foundErrors.push(el.innerText.trim());
            }
        });
    });

    // 2. [NEW] Check inside Shadow DOMs (e.g. <ee-console>)
    // The user provided structure: <div class="message severity-error"> ... </div>
    // This is likely inside a web component like <ee-console-output> or similar.

    // Helper to traverse shadow roots
    function findErrorsInShadow(root) {
        if (!root) return;

        // Specific selector from user request
        const shadowErrors = root.querySelectorAll('.message.severity-error, .severity-error .summary');
        shadowErrors.forEach(el => {
            if (el.innerText && el.innerText.trim().length > 0) {
                foundErrors.push(el.innerText.trim());
            }
        });

        // Continue recursion if there are nested shadow hosts
        const allElements = root.querySelectorAll('*');
        allElements.forEach(el => {
            if (el.shadowRoot) {
                findErrorsInShadow(el.shadowRoot);
            }
        });
    }

    // Start looking for common shadow hosts in GEE
    const shadowHosts = document.querySelectorAll('*');
    shadowHosts.forEach(host => {
        if (host.shadowRoot) {
            findErrorsInShadow(host.shadowRoot);
        }
    });

    if (foundErrors.length > 0) {
        return [...new Set(foundErrors)].join('\n\n');
    }

    // 3. Fallback: If still nothing, try the old generic scrape of the whole panel text for "Error:"
    // (Use cautiously as it might grab code too)
    if (rightPanel.innerText.includes("Error:")) {
        // Simple heuristic line grabber
        const lines = rightPanel.innerText.split('\n');
        const errorLines = lines.filter(line => line.toLowerCase().includes('error'));
        if (errorLines.length > 0) return errorLines.join('\n');
    }

    return "No obvious errors found in the console. Please check the Console tab manually.";
}
