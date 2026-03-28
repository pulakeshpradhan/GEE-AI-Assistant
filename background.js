/*
Copyright © 2025 Pulakesh Pradhan.  
All rights reserved.

This file is part of the project: **GEE AI Assistant**.  
Unauthorized copying, distribution, modification, or use of this code, in whole or in part, is strictly prohibited without the express written permission of the copyright holder.

For permissions or inquiries, contact: pulakesh.mid@gmail.com
*/

// Set the side panel to open when the extension icon is clicked.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error('Error setting side panel behavior:', error));

// --- Declarative Net Request Rules ---
const RULE_DEFINITIONS = [
  { id: 1, urlFilter: 'https://gemini.google.com/' },
  { id: 2, urlFilter: 'https://chatgpt.com/' },
  { id: 3, urlFilter: 'https://copilot.microsoft.com/' },
  { id: 4, urlFilter: 'https://claude.ai/' },
  { id: 5, urlFilter: 'https://grok.com/' },
  { id: 6, urlFilter: 'https://chat.deepseek.com/' },
  { id: 7, urlFilter: 'https://chat.qwen.ai/' },
  { id: 8, urlFilter: 'https://www.kimi.com/' }
];

const RULES = RULE_DEFINITIONS.map(def => ({
  id: def.id,
  priority: 1,
  action: {
    type: 'modifyHeaders',
    responseHeaders: [
      { header: 'X-Frame-Options', operation: 'remove' },
      { header: 'Content-Security-Policy', operation: 'remove' },
    ],
  },
  condition: {
    urlFilter: def.urlFilter,
    resourceTypes: ['sub_frame'],
  },
}));

chrome.runtime.onInstalled.addListener(() => {
  const ruleIds = RULES.map(rule => rule.id);
  chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: ruleIds,
    addRules: RULES,
  });
});

// --- Message Handling ---

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {

  // 1. Code Generated (LLM -> GEE)
  if (message.action === 'CODE_GENERATED') {
    const code = message.code;
    const mode = message.mode || 'INSERT';

    chrome.tabs.query({
      url: [
        "https://code.earthengine.google.com/*",
        "https://code.earthengine.google.co.in/*"
      ]
    }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'INSERT_CODE',
          code: code,
          mode: mode
        });
      }
    });
  }

  // 2. Request Code (LLM -> GEE)
  if (message.action === 'GET_GEE_CODE') {
    const sourceTabId = sender.tab ? sender.tab.id : null;
    console.log("LLM requested code. Source Tab ID:", sourceTabId);

    chrome.tabs.query({
      url: [
        "https://code.earthengine.google.com/*",
        "https://code.earthengine.google.co.in/*"
      ]
    }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'REQUEST_CODE',
          source_id: sourceTabId
        });
      } else {
        console.warn("No GEE tab found.");
      }
    });
  }

  // 3. Request Console Errors (LLM -> GEE)
  if (message.action === 'GET_GEE_CONSOLE_ERRORS') {
    const sourceTabId = sender.tab ? sender.tab.id : null;
    console.log("LLM requested errors. Source Tab ID:", sourceTabId);

    chrome.tabs.query({
      url: [
        "https://code.earthengine.google.com/*",
        "https://code.earthengine.google.co.in/*"
      ]
    }, (tabs) => {
      if (tabs && tabs.length > 0) {
        chrome.tabs.sendMessage(tabs[0].id, {
          action: 'REQUEST_ERRORS',
          source_id: sourceTabId
        });
      } else {
        console.warn("No GEE tab found.");
      }
    });
  }

  // 4. Return Code (GEE -> LLM)
  if (message.action === 'GEE_CODE_RETURNED') {
    // Always broadcast. The relevant tab or side panel script will pick it up.
    // This is safer for Side Panel interaction where Tab ID might be tricky.
    chrome.runtime.sendMessage({
      action: 'INSERT_INTO_GEMINI',
      code: message.code
    });
  }

  // 5. Return Errors (GEE -> LLM)
  if (message.action === 'GEE_ERRORS_RETURNED') {
    // Always broadcast.
    chrome.runtime.sendMessage({
      action: 'INSERT_CONSOLE_ERRORS',
      errors: message.errors
    });
  }

});