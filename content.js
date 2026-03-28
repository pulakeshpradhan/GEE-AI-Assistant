// content.js
/*
Copyright © 2025 Pulakesh Pradhan.  
All rights reserved.

This file is part of the project: **GEE AI Assistant**.  
Unauthorized copying, distribution, modification, or use of this code, in whole or in part, is strictly prohibited without the express written permission of the copyright holder.

For permissions or inquiries, contact: pulakesh.mid@gmail.com
*/

// This script acts as a bridge between the main page and the extension's side panel/background script.
console.log("GEE AI Assistant Content Script Loaded.");

// --- Part 1: GEE Injector Integration (Gemini/LLM Bridge) ---

// Inject the MAIN world script (gee_injector.js)
const s = document.createElement('script');
s.src = chrome.runtime.getURL('gee_injector.js');
s.onload = function () {
    this.remove();
};
(document.head || document.documentElement).appendChild(s);

// Listen for messages from Background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "INSERT_CODE") {
        console.log("Received code from LLM, dispatching to page...");
        // Send to MAIN world via window.postMessage
        window.postMessage({
            type: "GEE_GEMINI_INSERT",
            code: request.code,
            mode: request.mode
        }, "*");
    }

    if (request.action === "REQUEST_CODE") {
        console.log("Bg requesting code...");
        window.postMessage({
            type: "GEE_GEMINI_FETCH",
            source_id: request.source_id
        }, "*");
    }

    if (request.action === "REQUEST_ERRORS") {
        console.log("Bg requesting errors...");
        window.postMessage({
            type: "GEE_GEMINI_FETCH_ERRORS",
            source_id: request.source_id
        }, "*");
    }
});

// Listen for code from MAIN world (gee_injector.js)
window.addEventListener("message", (event) => {
    if (event.source !== window) return;

    if (event.data.type === "GEE_GEMINI_RETURN_CODE") {
        console.log("Received code from Main world, sending to Bg...");
        chrome.runtime.sendMessage({
            action: "GEE_CODE_RETURNED",
            code: event.data.code,
            source_id: event.data.source_id
        });
    }

    if (event.data.type === "GEE_GEMINI_RETURN_ERRORS") {
        console.log("Received errors from Main world, sending to Bg...");
        chrome.runtime.sendMessage({
            action: "GEE_ERRORS_RETURNED",
            errors: event.data.errors,
            source_id: event.data.source_id
        });
    }
});

// --- Part 2: Existing Side Panel Bridge ---

try {
    // 1. Listen for a custom event sent from the script we injected into the page.
    window.addEventListener('CorrectCode', (event) => {
        if (event.detail && event.detail.code) {
            // 2. When the event is received, forward the selected code to our side panel.
            chrome.runtime.sendMessage({
                action: 'correctCode',
                code: event.detail.code,
            }, (response) => {
                if (chrome.runtime.lastError) {
                    console.error('GEE Corrector Bridge Error:', chrome.runtime.lastError.message);
                }
            });
        }
    }, false);
} catch (e) {
    console.error("GEE Corrector Bridge: Failed to set up listener.", e);
}