// sidepanel.js
/*
Copyright © 2025 Pulakesh Pradhan.  
All rights reserved.

This file is part of the project: **GEE AI Assistant**.  
Unauthorized copying, distribution, modification, or use of this code, in whole or in part, is strictly prohibited without the express written permission of the copyright holder.

For permissions or inquiries: contact: pulakesh.mid@gmail.com
*/

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const modelSelector = document.getElementById('modelSelector');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const apiKeyHelpText = document.getElementById('apiKeyHelpText');
    const datasetSearchInput = document.getElementById('datasetSearchInput');
    const datasetOptionsContainer = document.getElementById('datasetOptionsContainer');
    const unifiedPrompt = document.getElementById('unifiedPrompt');
    const analysisSearchInput = document.getElementById('analysisSearchInput');
    const analysisOptionsContainer = document.getElementById('analysisOptionsContainer');
    const selectedAnalysisIndexInput = document.getElementById('selectedAnalysisIndex');
    const statusDiv = document.getElementById('status');
    const aiServiceSelector = document.getElementById('ai-service-selector');
    const aiChatIframe = document.getElementById('ai-chat-iframe');
    const autoAgentToggle = document.getElementById('autoAgentToggle');

    // Popup Elements

    // --- Global variables ---
    let geeDatasets = [];
    let geeAnalyses = [];
    let apiKeys = {};
    let mediaRecorder;
    let audioChunks = [];
    let isRecording = false;
    let activeTextarea = null;
    let promoInterval;
    let currentPromoIndex = 0;
    let currentMode = 'auto';

    // Auto-Agent Variables
    let autoAgentInterval = null;
    let isAutoAgentActive = false;
    let lastAutoFixErrorSignature = "";

    const allButtons = Array.from(document.querySelectorAll('.btn, .mic-button, .mode-btn'));

    // --- Constants ---
    const GEMINI_URL = 'https://gemini.google.com/';
    const MAX_FIX_ATTEMPTS = 3;
    const EXECUTION_DELAY_MS = 4000;
    const API_CALL_DELAY_MS = 10000;

    const promotionalMessages = [
        `<a href="https://www.youtube.com/@SpatialGeography" target="_blank">Spatial Geography YouTube Channel</a>.`,
        `Contact me at <a href="mailto:pulakesh.mid@gmail.com" target="_blank">pulakesh.mid@gmail.com</a>`
    ];

    // --- Helpers for Dataset Chips ---
    function getUnifiedPromptWithChips(baseText = unifiedPrompt.value) {
        let text = baseText ? baseText.trim() : '';
        const chipsContainer = document.getElementById('datasetChipsContainer');
        if (chipsContainer) {
            const chips = Array.from(chipsContainer.querySelectorAll('.dataset-chip')).map(chip => chip.dataset.id);
            if (chips.length > 0) {
                text = chips.join(' ') + ' ' + text;
            }
        }
        return text.trim();
    }

    function clearUnifiedPromptWithChips() {
        unifiedPrompt.value = '';
        const chipsContainer = document.getElementById('datasetChipsContainer');
        if (chipsContainer) chipsContainer.innerHTML = '';
        if (unifiedPrompt) unifiedPrompt.style.height = "auto";
    }

    // --- Main Event Listener ---
    document.body.addEventListener('click', (event) => {
        const target = event.target.closest('button, .tab-button');
        if (!target) return;

        if (target.classList.contains('tab-button')) {
            handleTabSwitch(target);
        }

        const id = target.id;
        switch (id) {
            case 'executePromptBtn': currentMode === 'generate' ? handleGenerate() : handleModify(); break;
            case 'modeGenerateBtn': setMode('generate'); break;
            case 'modeModifyBtn': setMode('modify'); break;
            case 'modeAutoBtn': setMode('auto'); break;
            case 'fixBtn': handleAutoFixAndRun(); break;
            case 'runBtn': handleRun(); break;
            case 'downloadPyBtn': handleDownloadPython(); break;
            case 'downloadRBtn': handleDownloadR(); break;
            case 'showAnalysisBtn': handleShowAnalysis(); break;
            case 'unifiedMic':
                handleMicClick(target); break;
            case 'bigMicBtn':
                handleAutoMicClick(target); break;
        }
    });

    function setMode(mode) {
        currentMode = mode;
        const genBtn = document.getElementById('modeGenerateBtn');
        const modBtn = document.getElementById('modeModifyBtn');
        const autoBtn = document.getElementById('modeAutoBtn');
        const execBtn = document.getElementById('executePromptBtn');
        const promptParams = document.getElementById('unifiedPrompt');

        const promptInputArea = document.getElementById('promptInputArea');
        const autoModeArea = document.getElementById('autoModeArea');
        const topMicBtn = document.getElementById('unifiedMic');

        const chipsContainer = document.getElementById('datasetChipsContainer');
        const chatInputWrapper = document.getElementById('chatInputWrapper');

        genBtn.classList.remove('active');
        modBtn.classList.remove('active');
        if (autoBtn) autoBtn.classList.remove('active');

        if (mode === 'auto') {
            if (autoBtn) autoBtn.classList.add('active');
            promptInputArea.style.display = 'none';
            autoModeArea.style.display = 'flex';
            topMicBtn.style.display = 'none';

            if (chipsContainer && autoModeArea) {
                autoModeArea.insertBefore(chipsContainer, autoModeArea.firstChild);
                chipsContainer.style.marginBottom = '12px';
            }
        } else {
            promptInputArea.style.display = 'block';
            autoModeArea.style.display = 'none';
            topMicBtn.style.display = 'flex';

            if (chipsContainer && chatInputWrapper) {
                chatInputWrapper.insertBefore(chipsContainer, chatInputWrapper.firstChild);
                chipsContainer.style.marginBottom = '4px';
            }

            if (mode === 'generate') {
                genBtn.classList.add('active');
                execBtn.textContent = 'Generate Code';
                promptParams.placeholder = 'Describe what you want to generate (select operation above)...';
            } else {
                modBtn.classList.add('active');
                execBtn.textContent = 'Modify Code';
                promptParams.placeholder = 'Describe how you want to modify the code...';
            }
        }
    }

    // --- Auto-Agent Toggle Listener ---
    if (autoAgentToggle) {
        autoAgentToggle.addEventListener('change', (e) => {
            if (e.target.checked) {
                startAutoAgent();
            } else {
                stopAutoAgent();
            }
        });
    }

    // --- IFrame Message Bridge (Side Panel -> IFrame) ---
    // --- IFrame Message Bridge (Side Panel -> IFrame) ---
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === 'INSERT_INTO_GEMINI' || message.action === 'INSERT_CONSOLE_ERRORS') {
            const iframe = document.getElementById('ai-chat-iframe');
            if (iframe && iframe.contentWindow) {
                iframe.contentWindow.postMessage(message, '*');
            }
        }
    });

    // --- IFrame and Permissions Management ---
    function updateAiChatFrame(activeTabId) {
        let targetUrl = '';

        if (activeTabId === 'gemini-chat') {
            targetUrl = GEMINI_URL;
        } else if (activeTabId === 'ai-chat') {
            targetUrl = aiServiceSelector.value;
        } else {
            return; // Not an AI chat tab.
        }

        // Set src only if it's changed to avoid reloading the iframe unnecessarily.
        if (aiChatIframe.src !== targetUrl) {
            aiChatIframe.src = targetUrl;
        }

        // Grant extensive permissions to all AI services to ensure features like
        // microphone input and clipboard copy/paste work correctly for DeepSeek, ChatGPT, etc.
        aiChatIframe.setAttribute('allow', 'microphone; clipboard-read; clipboard-write; camera; geolocation');
    }

    // --- Tab Management ---
    function handleTabSwitch(button) {
        const targetTabId = button.dataset.tab;
        if (button.classList.contains('active')) return;

        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');

        const geeAssistantPanel = document.getElementById('gee-assistant');
        const aiChatPanel = document.getElementById('ai-chat-content');

        if (targetTabId === 'gee-assistant') {
            geeAssistantPanel.classList.add('active');
            aiChatPanel.classList.remove('active');
        } else {
            aiChatPanel.classList.add('active');
            geeAssistantPanel.classList.remove('active');
            updateAiChatFrame(targetTabId); // Centralized call to update iframe
        }
        chrome.storage.sync.set({ lastActiveTab: targetTabId });
    }

    // --- AI Chat Service Management ---
    function loadLastSession() {
        chrome.storage.sync.get(['selectedAiService', 'lastActiveTab'], (result) => {
            const lastService = result.selectedAiService || aiServiceSelector.value;
            aiServiceSelector.value = lastService;

            const lastTab = result.lastActiveTab || 'gee-assistant';
            const tabButton = document.querySelector(`.tab-button[data-tab="${lastTab}"]`);

            if (tabButton) {
                // Manually trigger the full tab switch logic to ensure UI and iframe are correct
                handleTabSwitch(tabButton);
            }
        });
    }

    aiServiceSelector.addEventListener('change', () => {
        const selectedUrl = aiServiceSelector.value;
        chrome.storage.sync.set({ selectedAiService: selectedUrl });

        // If the "AI Chats" dropdown tab is currently active, update the iframe
        if (document.querySelector('.dropdown-tab-container').classList.contains('active')) {
            updateAiChatFrame('ai-chat');
        }
    });

    // --- API Key Management ---
    function updateApiKeyUI() {
        apiKeyInput.value = apiKeys['gemini'] || '';
        apiKeyInput.placeholder = `Enter Gemini API Key`;
        apiKeyHelpText.innerHTML = `Get key from <a href="https://aistudio.google.com/app/apikey" target="_blank">Google AI Studio</a>.`;
    }

    function loadSettings() {
        chrome.storage.sync.get(['apiKeys', 'selectedModel'], (result) => {
            apiKeys = result.apiKeys || {};
            modelSelector.value = result.selectedModel || 'gemini-3.1-flash-lite-preview';
            updateApiKeyUI();
        });
    }

    modelSelector.addEventListener('change', () => {
        chrome.storage.sync.set({ selectedModel: modelSelector.value }, updateApiKeyUI);
    });

    apiKeyInput.addEventListener('change', () => {
        apiKeys['gemini'] = apiKeyInput.value.trim();
        chrome.storage.sync.set({ apiKeys: apiKeys }, () => {
            updateStatus(`Gemini API Key saved.`, 'success');
        });
    });

    // --- Voice Recording Handlers ---
    let silenceAudioContext = null;
    let silenceAnalyser = null;
    let silenceTimer = null;
    let isAutoListening = false;

    function handleMicClick(micButton) {
        const { apiKey } = getApiKeyAndModel();
        if (!apiKey) {
            updateStatus('Gemini API Key is required for voice commands.', 'error');
            return;
        }

        const targetId = micButton.dataset.target;
        activeTextarea = document.getElementById(targetId);

        if (!activeTextarea) {
            console.error(`Target textarea #${targetId} not found.`);
            updateStatus('Error: Could not find text area for input.', 'error');
            return;
        }

        isRecording ? stopRecording() : startRecording(micButton);
    }

    function handleAutoMicClick(micButton) {
        if (isRecording || isAutoListening) {
            stopAutoRecording();
        } else {
            startAutoRecording(micButton);
        }
    }

    function startAutoRecording(micButton) {
        const { apiKey } = getApiKeyAndModel();
        if (!apiKey) {
            updateStatus('Gemini API Key is required for auto mode.', 'error');
            return;
        }

        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            updateStatus('Microphone API is not supported in this browser.', 'error');
            return;
        }

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                let mimeType = 'audio/webm';
                if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                    mimeType = 'audio/webm;codecs=opus';
                } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                    mimeType = 'audio/mp4';
                }

                try {
                    mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
                } catch (e) {
                    mediaRecorder = new MediaRecorder(stream);
                }

                mediaRecorder.start();
                isRecording = true;
                isAutoListening = true;
                audioChunks = [];

                micButton.classList.add('is-listening');
                document.getElementById('autoModeStatus').innerText = 'Listening... Speak now.';
                updateStatus('Listening for your command...', 'info');

                mediaRecorder.ondataavailable = event => {
                    if (event.data && event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = () => {
                    stream.getTracks().forEach(track => track.stop());
                    if (silenceAudioContext && silenceAudioContext.state !== 'closed') {
                        silenceAudioContext.close();
                    }
                    if (silenceTimer) clearTimeout(silenceTimer);
                    micButton.classList.remove('is-listening');
                    document.getElementById('autoModeStatus').innerText = 'Processing your request...';
                    transcribeAndExecuteAuto();
                };

                try {
                    silenceAudioContext = new (window.AudioContext || window.webkitAudioContext)();
                    const source = silenceAudioContext.createMediaStreamSource(stream);
                    silenceAnalyser = silenceAudioContext.createAnalyser();
                    silenceAnalyser.fftSize = 512;
                    source.connect(silenceAnalyser);
                    const dataArray = new Uint8Array(silenceAnalyser.frequencyBinCount);

                    let hasSpoken = false;

                    function detectSilence() {
                        if (!isRecording || !isAutoListening) return;

                        silenceAnalyser.getByteFrequencyData(dataArray);
                        const sum = dataArray.reduce((v, acc) => acc + v, 0);
                        const average = sum / dataArray.length;

                        if (average > 15) {
                            hasSpoken = true;
                            if (silenceTimer) {
                                clearTimeout(silenceTimer);
                                silenceTimer = null;
                            }
                        } else if (hasSpoken) {
                            if (!silenceTimer) {
                                silenceTimer = setTimeout(() => {
                                    if (isRecording && isAutoListening) {
                                        stopAutoRecording();
                                    }
                                }, 2000);
                            }
                        }
                        requestAnimationFrame(detectSilence);
                    }
                    detectSilence();
                } catch (err) {
                    console.log("AudioContext for silence detection failed", err);
                }
            })
            .catch(error => {
                console.error('Error accessing microphone:', error);
                if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                    updateStatus('Microphone access denied. <a href="#" id="openOptionsLink">Open Settings</a> to allow.', 'error');
                    const link = document.getElementById('openOptionsLink');
                    if (link) {
                        link.addEventListener('click', (e) => {
                            e.preventDefault();
                            chrome.runtime.openOptionsPage();
                        });
                    }
                    setTimeout(() => chrome.runtime.openOptionsPage(), 2000);
                } else {
                    updateStatus(`Microphone error: ${error.message || error}`, 'error');
                }
                document.getElementById('autoModeStatus').innerText = 'Microphone error.';
                isRecording = false;
                isAutoListening = false;
                micButton.classList.remove('is-listening');
            });
    }

    function stopAutoRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            isRecording = false;
            isAutoListening = false;
        }
    }

    function startRecording(micButton) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            updateStatus('Microphone API is not supported in this browser.', 'error');
            return;
        }

        navigator.mediaDevices.getUserMedia({ audio: true })
            .then(stream => {
                // Determine optimal mimeType
                let mimeType = 'audio/webm';
                if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
                    mimeType = 'audio/webm;codecs=opus';
                } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
                    mimeType = 'audio/mp4';
                }

                try {
                    mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
                } catch (e) {
                    console.error("MediaRecorder init failed with preferred mimeType, trying default.", e);
                    mediaRecorder = new MediaRecorder(stream); // Fallback
                }

                mediaRecorder.start();
                isRecording = true;
                audioChunks = [];

                micButton.classList.add('is-recording');
                updateStatus('Recording... Click the mic again to stop.', 'info');

                mediaRecorder.ondataavailable = event => {
                    if (event.data && event.data.size > 0) {
                        audioChunks.push(event.data);
                    }
                };

                mediaRecorder.onstop = () => {
                    stream.getTracks().forEach(track => track.stop());
                    transcribeAudio();
                };
            })
            .catch(error => {
                console.error('Error accessing microphone:', error);
                if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
                    updateStatus('Microphone access denied. <a href="#" id="openOptionsLink">Open Settings</a> to allow.', 'error');
                    const link = document.getElementById('openOptionsLink');
                    if (link) {
                        link.addEventListener('click', (e) => {
                            e.preventDefault();
                            chrome.runtime.openOptionsPage();
                        });
                    }
                    // Attempt to auto-open options after a delay
                    setTimeout(() => chrome.runtime.openOptionsPage(), 2000);
                } else {
                    updateStatus(`Microphone error: ${error.message || error.name || error}`, 'error');
                }
                isRecording = false;
                micButton.classList.remove('is-recording');
            });
    }

    function stopRecording() {
        if (mediaRecorder && mediaRecorder.state === 'recording') {
            mediaRecorder.stop();
            isRecording = false;
            document.querySelectorAll('.mic-button.is-recording').forEach(btn => btn.classList.remove('is-recording'));
        }
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result.split(',')[1]);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    async function transcribeAudio() {
        const { apiKey, model } = getApiKeyAndModel();

        if (!apiKey) {
            updateStatus('API Key missing during transcription.', 'error');
            return;
        }
        if (audioChunks.length === 0) {
            updateStatus('No audio data recorded.', 'error');
            return;
        }

        // Determine which button triggered the recording to show loading state
        // In unified mode, there is only one mic button.
        const activeMicBtn = document.getElementById('unifiedMic');

        setLoadingState(true, activeMicBtn, '...');
        updateStatus('Transcribing audio...', 'info');

        try {
            // Create blob with the correct MIME type used during recording
            const mimeType = mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(audioChunks, { type: mimeType });
            const base64Data = await blobToBase64(audioBlob);

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "Transcribe this audio recording precisely. Return ONLY the text." },
                            { inlineData: { mimeType: mimeType.split(';')[0], data: base64Data } }
                        ]
                    }]
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error?.message || `HTTP error ${response.status}`);
            }

            const data = await response.json();
            const transcribedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (transcribedText) {
                if (activeTextarea) {
                    activeTextarea.value = transcribedText.trim().replace(/^\[|\]$/g, '').trim();
                    updateStatus('Transcription successful!', 'success');
                }
            } else {
                throw new Error("API returned an empty transcription.");
            }

        } catch (error) {
            console.error('Gemini Transcription Error:', error);
            updateStatus(`Transcription failed: ${error.message}`, 'error');
        } finally {
            audioChunks = [];
            activeTextarea = null;
            setLoadingState(false, activeMicBtn, '...');
        }
    }

    async function transcribeAndExecuteAuto() {
        const { apiKey, model } = getApiKeyAndModel();
        if (!apiKey) return;

        try {
            const mimeType = mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(audioChunks, { type: mimeType });
            const base64Data = await blobToBase64(audioBlob);

            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: "Transcribe this audio recording precisely. Return ONLY the text." },
                            { inlineData: { mimeType: mimeType.split(';')[0], data: base64Data } }
                        ]
                    }]
                })
            });

            if (!response.ok) {
                if (response.status === 429) {
                    throw new Error(`API Quota Exceeded (429). Please wait a moment or try another model.`);
                }
                throw new Error(`HTTP error ${response.status}`);
            }

            const data = await response.json();
            const transcribedText = data.candidates?.[0]?.content?.parts?.[0]?.text;

            if (transcribedText) {
                const promptText = transcribedText.trim().replace(/^\[|\]$/g, '').trim();
                document.getElementById('autoModeStatus').innerText = `Decoded: "${promptText}"`;
                updateStatus(`Understood: "${promptText}"`, 'success');

                await executeAutoPrompt(promptText);
            } else {
                throw new Error("Empty transcription.");
            }
        } catch (error) {
            console.error('Transcription Error:', error);
            updateStatus(`Transcription failed: ${error.message}`, 'error');
            document.getElementById('autoModeStatus').innerText = 'Click to start speaking';
        } finally {
            audioChunks = [];
        }
    }

    async function executeAutoPrompt(promptText) {
        document.getElementById('autoModeStatus').innerText = `Executing Setup...`;

        const { apiKey, model } = getApiKeyAndModel();
        if (!apiKey) return;

        const bigMicBtn = document.getElementById('bigMicBtn');
        setLoadingState(true, bigMicBtn, '');

        try {
            const { code: existingCode } = await injectScript(getCodeAndErrors);
            let operation = existingCode && existingCode.trim().length > 0 ? 'modify' : 'generate';

            updateStatus(`${operation === 'modify' ? 'Modifying' : 'Generating'} code based on voice prompt...`, 'info');
            document.getElementById('autoModeStatus').innerText = `Writing code...`;

            const contextProps = operation === 'modify' ? { code: existingCode } : {};
            const finalPromptText = getUnifiedPromptWithChips(promptText);
            const finalPrompt = buildFinalPrompt(finalPromptText, operation, contextProps, geeDatasets);
            const generatedCode = await callApi(finalPrompt, model, apiKey);

            await injectScript(injectCodeIntoEditor, [generatedCode, 'setValue']);

            updateStatus('Code applied successfully. Executing script...', 'success');
            document.getElementById('autoModeStatus').innerText = `Code inserted! Running...`;

            setTimeout(async () => {
                await injectScript(clickGeeButton, ['.run-button', 'Run']);
                document.getElementById('autoModeStatus').innerText = `Done! Click to speak again.`;
                setLoadingState(false, bigMicBtn, '');
            }, 500);

        } catch (error) {
            updateStatus(`Auto execution failed: ${error.message}`, 'error');
            document.getElementById('autoModeStatus').innerText = `An error occurred`;
            setLoadingState(false, bigMicBtn, '');
        }
    }

    // --- Core Action Handlers ---
    async function handleDownload(type) {
        const { apiKey, model } = getApiKeyAndModel();
        if (!apiKey) return;

        const isPython = type === 'python';
        const button = isPython ? document.getElementById('downloadPyBtn') : document.getElementById('downloadRBtn');
        const promptType = isPython ? 'convert' : 'convert-r';
        const fileExt = isPython ? 'ipynb' : 'R';
        const mimeType = isPython ? 'application/x-ipynb+json' : 'text/x-r-source;charset=utf-8';
        const statusMsg = isPython ? 'Jupyter Notebook' : 'R script';

        setLoadingState(true, button, 'Converting...');

        try {
            const { code: jsCode } = await injectScript(getCodeAndErrors);
            if (!jsCode) {
                updateStatus('No code in the editor to convert.', 'error');
                return;
            }
            updateStatus(`Asking AI to convert to ${statusMsg}...`, 'info');
            const finalPrompt = buildFinalPrompt('', promptType, { code: jsCode });
            const convertedCode = await callApi(finalPrompt, model, apiKey, isPython ? 'json' : 'r');

            if (isPython) {
                try {
                    JSON.parse(convertedCode);
                } catch (jsonError) {
                    throw new Error("API did not return valid JSON for the notebook.");
                }
            }

            downloadFile(convertedCode, `gee_script.${fileExt}`, mimeType);
            updateStatus(`${statusMsg} download started.`, 'success');
        } catch (error) {
            updateStatus(`Conversion failed: ${error.message}`, 'error');
        } finally {
            setLoadingState(false, button, isPython ? 'Python' : 'R');
        }
    }

    const handleDownloadPython = () => handleDownload('python');
    const handleDownloadR = () => handleDownload('r');

    async function handleShowAnalysis() {
        const selectedIndex = selectedAnalysisIndexInput.value;
        if (selectedIndex === "" || !geeAnalyses[selectedIndex]) {
            updateStatus('Please select an analysis to show.', 'error');
            return;
        }
        const analysis = geeAnalyses[selectedIndex];
        const showBtn = document.getElementById('showAnalysisBtn');
        setLoadingState(true, showBtn, 'Show');
        try {
            await injectScript(injectCodeIntoEditor, [analysis.code, 'setValue']);
            updateStatus('Analysis code injected successfully.', 'success');
            analysisSearchInput.value = '';
            selectedAnalysisIndexInput.value = '';
        } catch (error) {
            updateStatus(`Error injecting code: ${error.message}`, 'error');
        } finally {
            setLoadingState(false, showBtn, 'Show');
        }
    }

    async function handleRun() {
        const runBtn = document.getElementById('runBtn');
        setLoadingState(true, runBtn, 'Executing...');
        try {
            const result = await injectScript(clickGeeButton, ['.run-button', 'Run']);
            updateStatus(result.status, 'success');
        } catch (error) {
            updateStatus(`Error: ${error.message}`, 'error');
        } finally {
            setLoadingState(false, runBtn, 'Run');
        }
    }

    async function handleGenerate() {
        const promptText = getUnifiedPromptWithChips();
        if (!promptText) {
            updateStatus('Please enter a prompt to generate a script.', 'error');
            return;
        }
        const { apiKey, model } = getApiKeyAndModel();
        if (!apiKey) return;
        const generateBtn = document.getElementById('executePromptBtn');
        setLoadingState(true, generateBtn, 'Generating...');
        try {
            // Do not take existing code into account for 'generate' mode per user request.
            const contextProps = {};
            const finalPrompt = buildFinalPrompt(promptText, 'generate', contextProps, geeDatasets);
            const generatedCode = await callApi(finalPrompt, model, apiKey);
            await injectScript(injectCodeIntoEditor, [generatedCode, 'setValue']);
            updateStatus('Script generated successfully.', 'success');
            clearUnifiedPromptWithChips();
        } catch (error) {
            updateStatus(`Generation failed: ${error.message}`, 'error');
        } finally {
            setLoadingState(false, generateBtn, 'Generate');
        }
    }

    async function handleModify() {
        const promptText = getUnifiedPromptWithChips();
        if (!promptText) {
            updateStatus('Please enter modification instructions.', 'error');
            return;
        }
        const { apiKey, model } = getApiKeyAndModel();
        if (!apiKey) return;
        const modifyBtn = document.getElementById('executePromptBtn');
        setLoadingState(true, modifyBtn, 'Modifying...');
        try {
            const { code: existingCode } = await injectScript(getCodeAndErrors);
            if (!existingCode) {
                updateStatus('No code found in the editor to modify.', 'error');
                return;
            }
            const finalPrompt = buildFinalPrompt(promptText, 'modify', { code: existingCode }, geeDatasets);
            const modifiedCode = await callApi(finalPrompt, model, apiKey);
            await injectScript(injectCodeIntoEditor, [modifiedCode, 'setValue']);
            updateStatus('Script modified successfully.', 'success');
            clearUnifiedPromptWithChips();
        } catch (error) {
            updateStatus(`Modification failed: ${error.message}`, 'error');
        } finally {
            setLoadingState(false, modifyBtn, 'Modify');
        }
    }

    async function handleAutoFixAndRun() {
        const { apiKey, model } = getApiKeyAndModel();
        if (!apiKey) return;
        const fixBtn = document.getElementById('fixBtn');
        const originalButtonText = fixBtn.dataset.originalText || 'Fix';
        setLoadingState(true, fixBtn, 'Starting...');
        let lastErrorsJson = "";
        for (let attempt = 1; attempt <= MAX_FIX_ATTEMPTS; attempt++) {
            try {
                if (attempt > 1) {
                    updateStatus(`Waiting for ${API_CALL_DELAY_MS / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, API_CALL_DELAY_MS));
                }
                updateStatus(`Attempt ${attempt}/${MAX_FIX_ATTEMPTS}: Reading code & errors...`);
                const { code, errors } = await injectScript(getCodeAndErrors);
                if (errors.length === 0) {
                    updateStatus(attempt === 1 ? 'No errors found.' : 'Script fixed and executed!', 'success');
                    setLoadingState(false, fixBtn, originalButtonText);
                    return;
                }
                const currentErrorsJson = JSON.stringify(errors.sort());
                if (attempt > 1 && currentErrorsJson === lastErrorsJson) {
                    updateStatus('Auto-fix stalled: Same errors persist.', 'error');
                    setLoadingState(false, fixBtn, originalButtonText);
                    return;
                }
                lastErrorsJson = currentErrorsJson;
                updateStatus(`Attempt ${attempt}: Found errors. Asking AI for a fix...`);
                const finalPrompt = buildFinalPrompt('', 'fix', { code, errors }, geeDatasets);
                const fixedCode = await callApi(finalPrompt, model, apiKey);
                await injectScript(injectCodeIntoEditor, [fixedCode, 'setValue']);
                updateStatus(`Attempt ${attempt}: Applied fix. Running...`);
                await injectScript(clickGeeButton, ['.run-button', 'Run']);
                await new Promise(resolve => setTimeout(resolve, EXECUTION_DELAY_MS));
            } catch (error) {
                updateStatus(`Auto-fix error: ${error.message}`, 'error');
                setLoadingState(false, fixBtn, originalButtonText);
                return;
            }
        }
        updateStatus(`Failed to fix after ${MAX_FIX_ATTEMPTS} attempts.`, 'error');
        setLoadingState(false, fixBtn, originalButtonText);
    }

    // --- Auto-Agent Logic ---
    function startAutoAgent() {
        if (isAutoAgentActive) return;
        isAutoAgentActive = true;
        updateStatus("Auto-Agent Started: Monitoring for errors...", "info");

        // Check immediately
        runAutoAgentLoop();

        // Then loop every 5 seconds
        autoAgentInterval = setInterval(runAutoAgentLoop, 5000);
    }

    function stopAutoAgent() {
        isAutoAgentActive = false;
        if (autoAgentInterval) clearInterval(autoAgentInterval);
        autoAgentInterval = null;
        updateStatus("Auto-Agent Stopped.", "info");
    }

    async function runAutoAgentLoop() {
        if (!isAutoAgentActive) return;

        // Don't run if we are already busy with a fix or generation
        const isBusy = Array.from(document.querySelectorAll('.btn')).some(btn => btn.disabled);
        if (isBusy) return;

        try {
            // 1. Check for errors
            const { code, errors } = await injectScript(getCodeAndErrors);

            // If no errors, clear the last error signature so we can catch new ones
            if (!errors || errors.length === 0) {
                if (lastAutoFixErrorSignature) {
                    updateStatus("Auto-Agent: Errors cleared.", "success");
                    lastAutoFixErrorSignature = "";
                }

                // --- Python Code Detection Remedied ---
                // User requested no check for Python conversion in auto agentic mode.
                /*
                if (isPythonCode(code)) {
                     // ... logic removed ...
                }
                */

                return;
            }

            // 2. Generate Error Signature (simple string hash)
            const currentErrorSignature = JSON.stringify(errors.sort());

            // 3. Check if we already tried fixing this EXACT error set
            if (currentErrorSignature === lastAutoFixErrorSignature) {
                // We already tried fixing this and it failed or is still there. 
                return;
            }

            // 4. Trigger Fix
            lastAutoFixErrorSignature = currentErrorSignature;

            let extraInstructions = "";
            let errorStatus = "Fixing...";

            // Smart Error Analysis
            const errorText = errors.join(' ').toLowerCase();
            if (errorText.includes("not defined") || errorText.includes("not find variable")) {
                extraInstructions = "\n**IMPORTANT:** Some variables are missing. You MUST add the necessary 'var name = ...' definitions or imports at the TOP of the script.";
                errorStatus = "Adding missing imports...";
            }

            updateStatus(`Auto-Agent: ${errorStatus}`, "warning");

            // Get API Key
            const { apiKey, model } = getApiKeyAndModel();
            if (!apiKey) {
                stopAutoAgent();
                updateStatus("Auto-Agent Stopped: API Key missing.", "error");
                if (autoAgentToggle) autoAgentToggle.checked = false;
                return;
            }

            // Call API
            const finalPrompt = buildFinalPrompt('', 'fix', { code, errors, extraInstructions }, geeDatasets);
            const fixedCode = await callApi(finalPrompt, model, apiKey);

            // Inject
            await injectScript(injectCodeIntoEditor, [fixedCode, 'setValue']);

            // Run
            updateStatus("Auto-Agent: Fix applied. Running...", "success");
            await injectScript(clickGeeButton, ['.run-button', 'Run']);

        } catch (err) {
            console.error("Auto-Agent Loop Error:", err);
            // Don't stop the agent, just log it. Maybe it was a transient extension error.
        }
    }

    // --- Helper to detect Python Code ---
    function isPythonCode(code) {
        if (!code) return false;
        const pyKeywords = [
            /import\s+ee\b/,
            /import\s+geemap\b/,
            /def\s+\w+\(.*\):/,
            /from\s+.*\s+import\s+/,
            /#\s+Imports/,
            /if\s+__name__\s+==\s+['"]__main__['"]:/,
            /\bFalse\b/, /\bTrue\b/, /\bNone\b/
        ];
        // Check if at least one strong Python indicator exists
        return pyKeywords.some(regex => regex.test(code));
    }

    // --- API & Prompt Engineering ---
    async function callApi(prompt, model, apiKey, responseType = 'javascript') {
        const modelName = modelSelector.options[modelSelector.selectedIndex].text;
        updateStatus(`Sending request to ${modelName}...`, 'info');

        const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const requestBody = { contents: [{ parts: [{ text: prompt }] }] };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error?.message || `HTTP error ${response.status}`);
        }

        const data = await response.json();
        const candidate = data.candidates?.[0];

        if (candidate?.finishReason && candidate.finishReason !== 'STOP') {
            throw new Error(`API request interrupted. Reason: ${candidate.finishReason}`);
        }
        const generatedText = candidate?.content?.parts?.[0]?.text;

        if (!generatedText) {
            throw new Error("API returned an empty response.");
        }
        const regex = new RegExp(`^\\\`\`\`(${responseType}|javascript|js|python|r|json)?\\n|\\\`\`\`$`, 'g');
        return generatedText.replace(regex, '').trim();
    }

    // --- BUILD FINAL PROMPT (No changes to internal logic) ---
    function getPythonConversionPrompt(context) {
        const taskDescription = `You are an expert programmer specializing in converting Google Earth Engine JavaScript to a well-structured Jupyter Notebook (.ipynb) file.

**TASK:** Convert the provided GEE JavaScript code into a JSON string representing a complete and runnable Jupyter Notebook. Your output must be ONLY the raw JSON string.`;

        const jsonStructureRules = `**CRITICAL JSON & NOTEBOOK STRUCTURE:**
1.  **Strictly Raw JSON Output:** Your entire response MUST be only the raw JSON string. Do not include any explanations, comments, or markdown formatting like \`\`\`json. The output must be parsable as JSON.
2.  **JSON Format:** The root of the JSON must be a valid Jupyter Notebook structure, containing "cells", "metadata", "nbformat": 4, and "nbformat_minor": 5.
3.  **Cell Structure:** The "cells" array must contain a sequence of "markdown" and "code" cells. Each cell is an object with a "cell_type" and a "source" (an array of strings, with each string being a line). Each cell MUST start with a Markdown subtitle (e.g., "### 1. Installation"), Number of cells can be decided as per the code.`;

        const mandatoryCells = `**Mandatory Cells (In Order):**
    a.  **Markdown Cell (Title & Credit):**
        -   Source must start with a title, e.g., "# Converted GEE Script for [Describe Task]".
        -   Must include the credit line: "Developed by Pulakesh Pradhan (pulakesh.mid@gmail.com). Visit: https://pulakeshpradhan.github.io".
    b.  **Code Cell (Installation):**
        -   A subtitle "### 1. Library Installation".
        -   A cell for installing Python libraries: \`# %pip install rasterio\`, \`# %pip install geedim\`.
    c.  **Code Cell (Imports):**
        -   A subtitle "### 2. Importing Libraries".
        -   A cell for all Python imports: \`import ee\`, \`import geemap\`, \`import os\`, \`import pandas as pd\`, \`import matplotlib.pyplot as plt\`, \`import datetime\`, \`import glob\`, \`import rasterio\`, \`from rasterio.merge import merge\`.
    d.  **Code Cell (Authentication & Initialization):**
        -   A subtitle "### 3. Authenticating and Initializing Earth Engine".
        -   A cell for GEE authentication and initialization with the following logic and comments:
          \`\`\`python
          # Set your GEE cloud project.
          cloud_project = 'your-cloud-project-name'  # Replace with your GEE cloud project name.
          
          try:
              # Attempt to initialize Earth Engine with the high-volume endpoint.
              ee.Initialize(project=cloud_project, opt_url='https://earthengine-highvolume.googleapis.com')
          except Exception as e:
              # If initialization fails, prompt for authentication.
              ee.Authenticate()
              # Retry initialization.
              ee.Initialize(project=cloud_project, opt_url='https://earthengine-highvolume.googleapis.com')
          
          # Print a success message.
          print("Earth Engine initialized successfully!")
          \`\`\`
    e.  **Code Cell(s) (Core Logic):**
        -   A subtitle like "### 4. Core GEE Logic".
        -   The main converted Python code. Use multiple cells if it improves readability.
    f.  **Code Cell (Map Creation & Display):**
        -   A subtitle "### 5. Interactive Map Display".
        -   The code to create the map, e.g., \`m = geemap.Map()\`.
        -   All \`m.addLayer(...)\` and \`m.centerObject(...)\` calls.
        -   Do proper band and vis selection befor addLayer.
        -   Replace the dictionary inside .draw() with separate arguments like  (e.g., color='red', width=2) 
        -   The final line in this cell must be \`m\` to display the map.
    g.  **Code Cell (Download shapefile to local):**
        -   A subtitle "### 5. Download shapefile".
        -   The code will download the AOI or study area to a local folder. 
        -   If the aoi is Geomety convert to featurecollection thatn export .
        -   Example \`geemap.ee_export_vector(fc, output_path, verbose=True)\'
            # Define the output path for the shp.
            output_path = "shapefile"
            if not os.path.exists(output_path):
                os.makedirs(output_path)
    g.  **Code Cell (ee.batch.Export):**
        -   A subtitle "### 5. ee.batch.Export to Drive".
        -   The code to wll ee.batch.Export to drive.
        -   If multibands image include all in sngle export or act as per instruction.
    h.  **Code Cell (Chart):**
        -   A subtitle "### 5. Matplotlib Charts".
        -   If there is timeseris or any chart in server-side object, call \`.getInfo()\` first. For data analysis,         
        -   In Python ee.Reduc.histogram() No need to pass  min, max arguments for buckets.
        -   Use Pandas to create DataFrames from the \`.getInfo()\` result and 
        -   Matplotlib to create charts. 
    h.  **Code Cell (Export CSV):**
        -   A subtitle "### 5. Export CSV to Loval Folder".
        -   Use the following functon to calculate the timesereis: 
        \' def export_time_series_dataframe(collection, bands, region, scale, reducer, folder, name):
                reducers = {'mean': ee.Reducer.mean(), 'sum': ee.Reducer.sum(), 'min': ee.Reducer.min(),'max': ee.Reducer.max(), 'median': ee.Reducer.median()}
                ee_reducer = reducers.get(reducer)
                if ee_reducer is None:
                    raise ValueError(f'Unsupported reducer: {reducer}')
                def extract_properties(img):
                    stats = img.reduceRegion(ee_reducer, region, scale, maxPixels=1e13)
                    stats = stats.set('date', img.date().format('YYYY-MM-dd'))
                    return ee.Feature(None, stats)
                features = collection.select(bands).map(extract_properties)
                feature_list = features.getInfo()['features']
                dataframe = pd.DataFrame([f['properties'] for f in feature_list])
                if not dataframe.empty:
                dataframe['date'] = pd.to_datetime(dataframe['date'])
                csv_path = os.path.join(folder, name)
                dataframe.to_csv(csv_path, index=False)
                print(f'Time series CSV saved to: {csv_path}')
                return dataframe/'
    i.  **Code Cell (Download in Tiles):**
        -   A subtitle "### 6. Downloading Image in Tiles".
        -   The code MUST follow this pattern:
          \`\`\`python
          # Extract the bounding box of the ROI as a polygon.
          roi_boundary = roi_ee.geometry().bounds() # Assuming roi_ee is the FeatureCollection
          
          # Create a fishnet grid. Adjust rows/cols based on ROI size and desired tile resolution.
          # For a larger area or higher resolution, increase rows and cols.
          mesh = geemap.fishnet(roi_boundary, rows=3, cols=3, delta=0)
          
          # Add the grid to the map to visualize the tiles.
          vis_params = {'color': 'yellow', 'fillColor': '00000000'}
          m.addLayer(mesh.style(**vis_params), {}, "Mesh Grid")
          
          # Define the output path for the tiles.
          output_path = "downloads"
          if not os.path.exists(output_path):
              os.makedirs(output_path)

          # Download the image by tiles using the mesh grid.
          # CRS and scale should be chosen appropriately for the analysis.
          geemap.download_ee_image_tiles(
              image=image, # Assuming 'image' is the final ee.Image to download
              features=mesh,
              out_dir=output_path,
              prefix="Image_",
              crs="EPSG:32645", # Example CRS, should be adjusted
              scale=30 # Example scale, should be adjusted
          )
          \`\`\`
    j.  **Code Cell (Merge Downloaded Tiles):**
        -   A subtitle "### 7. Merging Downloaded Tiles".
        -   The code MUST follow this pattern:
          \`\`\`python
          # Find all downloaded tile .tif files in the output path.
          tile_files = glob.glob(os.path.join(output_path, '*.tif'))

          # Open each tile as a rasterio dataset.
          src_files_to_mosaic = [rasterio.open(fp) for fp in tile_files]

          if src_files_to_mosaic:
              # Merge the tiles and get the output transform.
              mosaic, out_trans = merge(src_files_to_mosaic)
              
              # Prepare metadata for the output merged raster.
              out_meta = src_files_to_mosaic[0].meta.copy()
              out_meta.update({
                  "driver": "GTiff",
                  "height": mosaic.shape[1],
                  "width": mosaic.shape[2],
                  "transform": out_trans
              })

              # Define the path for the final merged raster file.
              merged_tif_path = os.path.join(output_path, "final_merged_image.tif")

              # Write the merged mosaic to disk.
              with rasterio.open(merged_tif_path, "w", **out_meta) as dest:
                  dest.write(mosaic)
              
              print(f"Mosaic created and saved to: {merged_tif_path}")
          else:
              print("No tile files found to merge.")
          \`\`\``;

        const conversionRules = `**PYTHON CONVERSION RULES (for code inside cells):**
* **Variable Naming:** Convert user-defined JavaScript 'camelCase' variables to Python 'snake_case'. Keep server-side 'camelCase' (e.g., 'visParams') as is. Use '\\' for new lines to break long statements and ensure proper Python indentation.
* **EE Methods:** Do NOT convert built-in 'camelCase' method names on EE objects (e.g., \`ee.ImageCollection\`, \`.filterDate\`).
* **Indentation:** In Python, you cannot start a new line with a dot (.) unless the previous line is inside parentheses () or uses a backslash \\.
* **Map Object:** Convert JS \`Map.addLayer(...)\` to \`m.addLayer(...)\` and JS \`Map.centerObject(...)\` to \`m.centerObject(...)\`.
* **Reducer:** * For reducers and zonal statistics in the GEE Python API, always use named parameters and parentheses (not braces) in function calls (e.g., image.reduceRegion(reducer=ee.Reducer.mean(), geometry=roi_ee, scale=30)). Dictionary keys must be quoted in Python (e.g., {'collection': roi_ee, 'reducer': ee.Reducer.mean(), 'scale': 5566}). When passing a dictionary as arguments, use ** unpacking (ee.Image.reduceRegions(**params)). Always check that the band name exists in your image before applying reducers.
* **Print Statements:** To print a server-side object, call \`.getInfo()\` first. For data analysis, use Pandas to create DataFrames from the \`.getInfo()\` result and Matplotlib to create charts.
* **UI Elements:** The Python API lacks the \`ee.ui\` module. REMOVE all JavaScript UI code (panels, labels, charts, legends).
* **Exporting:** Convert JS \`Export\` tasks to Python's \`ee.batch.Export\` module and start them with \`.start()\`. In \`ee.batch.Export\` use Python-style dictionary syntax (e.g., key=value), Keep server-side 'camelCase' (e.g., 'maxPixels', "GeoTIFF" , "EPSG:32645") , use key=value — not key: value — inside function calls.
* **Comments:** Convert \`//\` comments to \`#\`, MUST avoid comments in between filters, MUST ue backshash at the end of each in between lines.
* **Author Credit:** Include the comment \`# Developed by Pulakesh Pradhan (pulakesh.mid@gmail.com )\` at the top of the main logic cell.`;

        const jsonExample = `**EXAMPLE of a single cell in the JSON 'cells' array:**
\`\`\`json
{
  "cell_type": "code",
  "execution_count": null,
  "metadata": {},
  "outputs": [],
  "source": [
    "import ee\\n",
    "import geemap"
  ]
}
\`\`\``;

        const codeToConvert = `**JavaScript to Convert:**
\`\`\`javascript
${context.code}
\`\`\``;

        return [
            taskDescription,
            jsonStructureRules,
            mandatoryCells,
            conversionRules,
            jsonExample,
            codeToConvert
        ].join('\n\n');
    }

    function buildFinalPrompt(basePrompt, operation, context = {}, datasets = []) {
        let shouldIncludeDatasets = false;

        if (true) {
            if (operation === 'generate') {
                shouldIncludeDatasets = true;
            } else if (operation === 'modify') {
                const modifyKeywords = ['dataset', 'collection', 'image', 'imagery', 'landsat', 'sentinel', 'modis', 'viirs', 'asset', 'layer', 'add', 'replace', 'change to', 'evi', 'ndvi', 'ndwi'];
                if (modifyKeywords.some(keyword => basePrompt.toLowerCase().includes(keyword))) {
                    shouldIncludeDatasets = true;
                }
            } else if (operation === 'fix') {
                const errorKeywords = ["not found", "asset", "id", "load", "ee.imagecollection", "ee.image", "ee.featurecollection"];
                const errorString = (context.errors || []).join(' ').toLowerCase();
                if (errorKeywords.some(keyword => errorString.includes(keyword))) {
                    shouldIncludeDatasets = true;
                }
            }
        }

        // Reduced instructions for Generate, Modify, and Fix operations
        let finalPrompt = `You are a Google Earth Engine expert.
**Strict Rules:**
1. Output **ONLY** raw, valid JavaScript code. Do not use markdown blocks. Do not provide explanations.
2. Assume the 'ee' object is already initialized.
3. Use Landsat Collection 2 assets (e.g., LANDSAT/LC08/C02/T1_L2) instead of Collection 1.
4. **CRITICAL:** Do NOT use optional chaining (e.g., \`?.\`) or nullish coalescing (\`??\`). Use standard checks (e.g., \`if (obj && obj.prop)\`).
5. **CRITICAL:** ALWAYS output the FULL and COMPLETE code from start to finish. If existing code is provided, integrate all changes into it and return the ENTIRE updated script, do not just send snippets or omissions.
`;

        if (shouldIncludeDatasets && datasets.length > 0) {
            // --- SMART FILTERING TO REDUCE INPUT TOKEN SIZE ---
            // Instead of injecting the entire catalog (5000+ items), we filter based on relevance.

            // 1. Gather text to analyze for keywords
            let textToAnalyze = basePrompt.toLowerCase();
            if (operation === 'fix' && context.errors) {
                textToAnalyze += ' ' + context.errors.join(' ').toLowerCase();
            }
            if (context.code && context.code.length < 5000) { // Only check small code snippets to avoid perf hit
                textToAnalyze += ' ' + context.code.toLowerCase();
            } else if (context.code) {
                // For large code, just check the first 1000 chars
                textToAnalyze += ' ' + context.code.substring(0, 1000).toLowerCase();
            }

            // 2. Define Stop Words (Common GEE/English terms to ignore)
            const stopWords = new Set([
                'show', 'give', 'make', 'create', 'code', 'script', 'write', 'using', 'from', 'with', 'add',
                'map', 'layer', 'display', 'clip', 'mask', 'filter', 'select', 'reduce', 'mean', 'median',
                'sum', 'min', 'max', 'date', 'geometry', 'region', 'area', 'point', 'polygon', 'feature',
                'collection', 'image', 'dataset', 'load', 'import', 'var', 'function', 'return', 'true', 'false',
                'ee', 'print', 'visualization', 'style', 'params', 'palette', 'error', 'failed', 'found'
            ]);

            // 3. Extract meaningful keywords (min length 3)
            const keywords = textToAnalyze.split(/[^a-zA-Z0-9]+/)
                .filter(w => w.length > 2 && !stopWords.has(w));

            // 4. Filter Datasets
            // We look for matches in ID, Title, or Tags
            let relevantDatasets = [];

            if (keywords.length > 0) {
                relevantDatasets = datasets.filter(d => {
                    const id = (d.id || '').toLowerCase();
                    const title = (d.title || '').toLowerCase();
                    const tags = (Array.isArray(d.tags) ? d.tags.join(' ') : (d.tags || '')).toLowerCase();
                    // Match if ANY keyword is found in the dataset metadata
                    return keywords.some(k => id.includes(k) || title.includes(k) || tags.includes(k));
                });
            }

            // 5. Limit and Sort
            // If too many matches, prioritize exact ID matches or shorter IDs (heuristic)? 
            // For now, simple slice to strict limit.
            const MAX_DATASETS = 15;

            if (relevantDatasets.length > 0) {
                // If we have matches, take the top 15
                const limitedDatasets = relevantDatasets.slice(0, MAX_DATASETS);
                finalPrompt += `\n**Relevant Datasets (Filtered from Catalog):**\n${JSON.stringify(limitedDatasets, null, 2)}\n`;
            } else if (operation === 'generate') {
                // If user specifically asked for datasets but we found no keyword matches,
                // and it's a "Generate" task, maybe send a few popular ones or generic ones?
                // Or just do nothing to save valid tokens. 
                // Let's decide to NOT send anything if no keywords match, to be safe on quota.
                console.log('Datasets requested but no relevant keywords found in prompt.');
            }
        }

        finalPrompt += "\n---\n";

        switch (operation) {
            case 'generate':
                if (context.code) {
                    finalPrompt += `**Task:** Generate GEE script incorporating the request into the existing code if relevant.\n**User Request:** "${basePrompt}"\n\n**Existing Code in Editor (Take this into account!):**\n${context.code}`;
                } else {
                    finalPrompt += `**Task:** Generate GEE script.\n**User Request:** "${basePrompt}"`;
                }
                break;
            case 'modify':
                finalPrompt += `**Task:** Modify the script below based on the request.\n**Request:** "${basePrompt}"\n\n**Script:**\n${context.code}`;
                break;
            case 'fix':
                finalPrompt += `**Task:** Fix the script errors.\n**Errors:**\n- ${context.errors.join('\n- ')}\n\n**Script:**\n${context.code}`;
                break;
            case 'convert':
                return getPythonConversionPrompt(context);
            case 'to-js':
                return `You are an expert in converting Python (geemap/ee) code to Google Earth Engine JavaScript.
**Strict Rules:**
1. Output **ONLY** raw, valid JavaScript code.
2. Convert Python imports/syntax to generic GEE JS.
3. Remove Python-specific libs (matplotlib, pandas) if they can't be mapped, or use GEE Chart/console.
**Python Code:**
${context.code}`;
            case 'convert-r':
                return `You are an expert R programmer for Google Earth Engine, specializing in creating scripts that download data directly to a local computer.Your primary goal is to help users write clean, efficient, and complete R code with minimal friction.

**TASK:** Convert the provided GEE JavaScript code into a single, complete, and runnable R script. The script's primary purpose is to export the final data (Image, ImageCollection, etc.) to the user's local machine.

**CRITICAL INSTRUCTIONS:**

1.  **Strictly R Code Output:** Your entire response MUST be only the raw R code. Do not include any explanations, comments about the code, or markdown formatting like \`\`\`r.
1. **Author:** with comment write # Developed by Pulakesh Pradhan (pulakesh.mid@gmail.com ) # This work is licensed under the CC BY-NC-ND 4.0. License details: https://creativecommons.org/licenses/by-nc-nd/4.0/ 
2. **Imports:** Start the script with 'library(reticulate)', 'library(rgee)', 'library(terra)', 'library(sf)' and 'library(ggplot2)', 'library(ggspatial)'.
3. **Initialization:** Include 'use_python("C:/Users/pulak/anaconda3/envs/maps/python.exe")', 'ee$Authenticate(auth_mode = 'notebook')' and 'ee$Initialize(project = "your-cloud-project-name")'.
4. **In rgee, never use <- inside a $...$... chain. Always assign values on separate lines. $ chaining in rgee should only be used for methods, not assignments. Also DO NOT use py_set() (it doesn’t exist). Instead, assign R variables directly like py$variable_name <- r_variable. Use list('system:time_start') to create an R list, then wrap it with ee$List(...) to pass as a valid Earth Engine list to copyProperties().
5.  **Mandatory Script Structure:** The generated R script must follow this exact structure:
    a.  **Helper Functions:** IMMEDIATELY after the libraries, you MUST include the **full and complete definitions** of all the following R helper functions. These functions are essential for local data export.

        \`\`\`r
        # --- Start of Mandatory Helper Functions ---

        export_csv_local <- function(collection, bands, region, scale = 1000, reducer = 'mean', file_path) {
          out_dir <- dirname(file_path)
          file_name <- basename(file_path)
          if (!dir.exists(out_dir)) {
            dir.create(out_dir, recursive = TRUE)
          }
          py_code <- "
        import ee
        import pandas as pd
        import numpy as np
        import os
        def export_time_series_dataframe(collection, bands, region, scale, reducer, folder, name):
            reducers = {'mean': ee.Reducer.mean(), 'sum': ee.Reducer.sum(), 'min': ee.Reducer.min(),'max': ee.Reducer.max(), 'median': ee.Reducer.median()}
            ee_reducer = reducers.get(reducer)
            if ee_reducer is None:
                raise ValueError(f'Unsupported reducer: {reducer}')
            def extract_properties(img):
                stats = img.reduceRegion(ee_reducer, region, scale, maxPixels=1e13)
                stats = stats.set('date', img.date().format('YYYY-MM-dd'))
                return ee.Feature(None, stats)
            features = collection.select(bands).map(extract_properties)
            feature_list = features.getInfo()['features']
            dataframe = pd.DataFrame([f['properties'] for f in feature_list])
            if not dataframe.empty:
              dataframe['date'] = pd.to_datetime(dataframe['date'])
            csv_path = os.path.join(folder, name)
            dataframe.to_csv(csv_path, index=False)
            print(f'Time series CSV saved to: {csv_path}')
            return dataframe
        "
          reticulate::py_run_string(py_code)
          df_py <- reticulate::py$export_time_series_dataframe(collection=collection, bands=bands, region=region, scale=as.integer(scale), reducer=reducer, folder=out_dir, name=file_name)
          df_r <- reticulate::py_to_r(df_py)
          return(df_r)
        }

        export_local_tile <- function(image, region, scale, crs = 'EPSG:4326', name = 'Image_', rows = 2, cols = 2, folder = 'TIF') {
          if (!dir.exists(folder)) {
            dir.create(folder, recursive = TRUE)
          }
          py_code <- "
        import ee
        import geemap
        import os
        def export_tiles(image, region, scale, crs, name, rows, cols, folder):
            grids = geemap.fishnet(region, rows=rows, cols=cols)
            geemap.download_ee_image_tiles(image=image.clip(region), features=grids, out_dir=folder, prefix=name, crs=crs, scale=scale)
            print(f'Image tiles download submitted to folder: {folder}')
        "
          reticulate::py_run_string(py_code)
          reticulate::py$export_tiles(image=image, region=region, scale=as.integer(scale), crs=crs, name=name, rows=as.integer(rows), cols=as.integer(cols), folder=folder)
        }

        export_local <- function(image, region, scale, crs = 'EPSG:4326', file_path) {
          out_dir <- dirname(file_path)
          if (!dir.exists(out_dir)) {
            dir.create(out_dir, recursive = TRUE)
          }
          py_code <- "
        import ee
        import geemap
        import os
        def export_image(image, region, scale, crs, name):
            geemap.download_ee_image(image=image.clip(region), filename=name, region=region, scale=scale, crs=crs)
        "
          reticulate::py_run_string(py_code)
          reticulate::py$export_image(image = image, region = region, scale = as.integer(scale), crs = crs, name = file_path)
          cat("Image export submitted. File will be saved to:", file_path, "\\n")
        }

        # --- End of Mandatory Helper Functions ---
        \`\`\`

    b.  **Main Logic:** Convert the user's core JavaScript logic to R syntax (\`var\` to \`<-\`, \`.\` to \`$\`, \`//\` to \`#\`, \`function() {}\` to \`function() { ... }\`, etc.).
    c.  **Local Export Implementation:**
        * **CRITICAL:** Do NOT use \`Map$addLayer\`. The main goal is to export data for local processing, not to create interactive maps.
        * **ee.ee_exception.EEException:** MUST not use .draw() on ee$Geometry; instead, visualize it with Map$addLayer(geometry, list(color = '...')), if it is single color no need for list like outline use 'Map$addLayer(aoi$draw(color = 'red', strokeWidth = 2), list(), 'Name AOI')'. Do not pass "system:time_start" into ee$List() unless it’s an actual list-type property. Use aggregate_array() to collect property values across an image collection. Use ee$Date() to handle timestamps, not ee$List().
        * **CRITICAL:** Instead of printing reducer statistics or time series to the console, the goal is to export them to local files. If necessary, use the provided helper functions like \`export_csv_local\` for this purpose.
        * **CRITICAL:** Replace any JavaScript \`Export\` tasks with a call to one of the provided R helper functions.
        * Use And() not and(), No need for \ in R, Place $ at the end of the line, not the beginning of the next. Don't use '<<'; use 'bitwShiftL(1L, bit_position)' in R for bitmasking—it's the R equivalent of '1 << x' in JavaScript or Python.
        * If the JS exports an \`ee.Image\`, default call \`export_local_tile(...)\` or \`export_local(...)\`.
        * Color Palette in R MUST be with '#' (e.g., "#FFFFFF").
        * You MUST invent a sensible local file path for the export function, for example: \`file_path = 'my_gee_image.tif'\` or \`file_path = 'time_series_data.csv'\`.
    f.  **Tile Download Step:**
        * Define a variable for the output folder, e.g., \`output_folder <- "gee_tiles"\`.
        * Call the \`export_local_tile\` function using the image and region defined in the previous step. Choose a sensible number of rows/cols (e.g., 3x3 or 4x4) to split the image.
    g.  **Mosaic & Map Step:**
        * After the download call, add the R code to process the local files using the \`terra\` package.
        * This code MUST:
            1.  Get a list of all downloaded ".tif" files from the \`output_folder\`.
            2.  Check if files were found and stop with an error if not.
            3.  Read all tile files into a list of SpatRasters using \`lapply(..., terra::rast)\`.
            4.  Mosaic the rasters into a single SpatRaster using \`do.call(mosaic, ...)\`.
            5.  Save the mosaicked raster to a file (e.g., "final_mosaic.tif").
            6.  DO NOT pass a single property name to ee$List(). Use $aggregate_array("system:time_start") to get time values from an ImageCollection. Convert to POSIXct for plotting or export
            7.  Plot the final, mosaicked raster using terra library and  \`plot()\`.

    h.  **Shapefile Downloading Step MUST Follow syntex:**
        * After exporting the raster, also export any ee$FeatureCollection (such as AOI or region) to a local shapefile using the following pattern:
            1.  Define the output directory and shapefile path:
                \`\`\`r
                out_dir <- "output_folder"
                out_shp <- file.path(out_dir, "studyarea.shp")
                if (!dir.exists(out_dir)) dir.create(out_dir, recursive = TRUE)
                \`\`\`
            2.  Assign the FeatureCollection and path to Python environment:
                \`\`\`r
                py$fc <- your_feature_collection  # Replace with your ee$FeatureCollection object
                py$out_shp <- out_shp
                \`\`\`
            3.  Export the FeatureCollection as a shapefile using geemap:DO NOT use py_set() (it doesn’t exist). Instead, assign R variables directly like py$variable_name <- r_variable.
                \`\`\`r
                reticulate::py_run_string("
                import geemap
                geemap.ee_export_vector(fc, out_shp, verbose=True)
                ")
                \`\`\`
            4.  Replace \`your_feature_collection\` with your actual ee$FeatureCollection (e.g., aoi, region, etc.) before running.

    i.  **Mapping downloaed files MUST Follow syntex:**
        * After completation of mosaic gee the files from respective path and plot using fhe following steps :
            1.  Find the tif and shp file path:
                \`\`\`r
                aoi <- st_read("F:/RPRO/GDG/output_folder/nairobi_aoi.shp")
                dem <- rast("F:/RPRO/GDG/gee_ndvi_tiles/final_nairobi_ndvi_mosaic.tif")
                \`\`\`
            2.  Mask and get the bbox :
                \`\`\`r
                # Ensure both layers are in the same CRS
                aoi <- st_transform(aoi, crs(dem))

                # Crop and mask the DEM to AOI
                cropdem <- crop(dem, vect(aoi))
                maskdem <- mask(cropdem, vect(aoi))

                # Convert raster to data frame for ggplot
                demdf <- as.data.frame(maskdem, xy = TRUE, na.rm = TRUE)
                colnames(demdf) <- c("x", "y", "elevation")

                # Set lat/long breaks every 0.2 degrees
                bbox <- st_bbox(aoi)
                x_breaks <- seq(floor(bbox["xmin"]), ceiling(bbox["xmax"]), by = 0.1)
                y_breaks <- seq(floor(bbox["ymin"]), ceiling(bbox["ymax"]), by = 0.1)

                \`\`\`
            3.  plot and save them:
                \`\`\`r
                # Plot the DEM using ggplot2
                p <- ggplot() +
                geom_raster(data = demdf, aes(x = x, y = y, fill = elevation)) +
                scale_fill_viridis(name = "Elevation (m)", na.value = "transparent") +
                geom_sf(data = aoi, fill = NA, color = "white", linewidth = 0.5) +
                coord_sf() +
                labs(title = "DEM over AOI", x = "Longitude", y = "Latitude") +
                scale_x_continuous(
                    breaks = x_breaks,
                    labels = function(x) {
                        paste0(abs(x), "°", ifelse(x >= 0, "E", "W"))
                    }
                ) +
                scale_y_continuous(
                    breaks = y_breaks,
                    labels = function(y) {
                        paste0(abs(y), "°", ifelse(y >= 0, "N", "S"))
                    }
                ) +
                annotate("text", label = "pulakesh", x = Inf, y = -Inf, 
                        hjust = 2, vjust = -2, 
                        size = 10, color = alpha("grey70", 0.15), fontface = "bold") +
                annotation_scale(location = "bl", width_hint = 0.3) +
                annotation_north_arrow(location = "tr", which_north = "true",
                                        pad_x = unit(0.1, "in"), pad_y = unit(0.1, "in"),
                                        style = north_arrow_fancy_orienteering()) +
                theme_linedraw() +
                theme(
                    panel.grid.major = element_blank(),
                    panel.grid.minor = element_blank(),
                    legend.position.inside = c(0.9, 0.25),
                    legend.background = element_rect(fill = alpha('white', 0.7), color = NA),
                    legend.title = element_text(size = 10, face = "bold"),
                    legend.text = element_text(size = 8),
                    plot.title = element_text(hjust = 0.5, face = "bold"),
                    axis.text.y = element_text(angle = 90, vjust = 0.5, hjust = 0.5)
                )

                # Print the plot
                print(p)

                # Save the plot
                ggsave(filename = "dem_plot_R.jpg", plot = p, dpi = 600, width = 7.5, height = 4.5, units = "in", path = "./Output")

                \`\`\`

**JavaScript to Convert:** \`\`\`javascript
${context.code}
\`\`\``;
        }

        return finalPrompt;
    }

    // --- Page Interaction (Script Injection) ---
    function injectScript(func, args = []) {
        return new Promise((resolve, reject) => {
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (!tabs[0] || (!tabs[0].url.startsWith('https://code.earthengine.google.com') && !tabs[0].url.startsWith('https://code.earthengine.google.co.in'))) {
                    return reject(new Error("Not on a GEE Code Editor tab."));
                }
                chrome.scripting.executeScript({
                    target: { tabId: tabs[0].id },
                    world: 'MAIN',
                    func: func,
                    args: args,
                }, (injectionResults) => {
                    if (chrome.runtime.lastError) {
                        return reject(new Error(chrome.runtime.lastError.message));
                    }
                    if (!injectionResults || injectionResults.length === 0) {
                        return reject(new Error("Script injection failed."));
                    }
                    const result = injectionResults[0].result;
                    if (result?.error) {
                        return reject(new Error(result.error));
                    }
                    resolve(result);
                });
            });
        });
    }

    // --- Injected Functions (These run on the GEE page) ---
    function getCodeAndErrors() {
        try {
            // Get Code
            let code = '';
            const editorEl = document.querySelector('.ace_editor');
            if (editorEl && window.ace && window.ace.edit) {
                code = window.ace.edit(editorEl).getValue();
            } else if (editorEl) {
                code = editorEl.innerText;
            }

            // Get Errors
            const errors = [];

            // 1. Selector based approach (Standard GEE)
            const selectors = [
                '.goog-console-message-error',
                '.console-error',
                '.error-message',
                'div[style*="color: red"]'
            ];

            selectors.forEach(sel => {
                document.querySelectorAll(sel).forEach(el => {
                    if (el.innerText && el.innerText.trim()) errors.push(el.innerText.trim());
                });
            });

            // 2. Shadow DOM handling (New GEE UI)
            function findErrorsInShadow(root) {
                if (!root) return;
                const shadowErrors = root.querySelectorAll('.message.severity-error, .severity-error .summary');
                shadowErrors.forEach(el => {
                    if (el.innerText) errors.push(el.innerText.trim());
                });
                root.querySelectorAll('*').forEach(el => {
                    if (el.shadowRoot) findErrorsInShadow(el.shadowRoot);
                });
            }

            document.querySelectorAll('*').forEach(host => {
                if (host.shadowRoot) findErrorsInShadow(host.shadowRoot);
            });

            // 3. Keep the old symbol hack just in case
            document.querySelectorAll('ee-console-log').forEach(log => {
                const symbols = Object.getOwnPropertySymbols(log);
                if (symbols.length >= 2 && log[symbols[1]] === 'error') {
                    errors.push(String(log[symbols[0]]).trim());
                }
            });

            return { code, errors: [...new Set(errors)] }; // De-duplicate
        } catch (e) {
            return { error: `Failed to access GEE editor/console: ${e.message}` };
        }
    }

    function injectCodeIntoEditor(code, mode) {
        try {
            const editor = ace.edit(document.querySelector('.ace_editor'));
            if (!editor) return { error: 'GEE code editor not found.' };

            if (mode === 'setValue') editor.setValue(code, 1);
            else editor.insert(code);

            editor.clearSelection();
            return { status: 'Code injected successfully!' };
        } catch (e) {
            return { error: `Failed to inject code: ${e.message}` };
        }
    }

    function clickGeeButton(selector, buttonName) {
        try {
            const button = document.querySelector(selector);
            if (button) {
                button.click();
                return { status: `'${buttonName}' button clicked successfully.` };
            }
            return { error: `GEE '${buttonName}' button not found.` };
        } catch (e) {
            return { error: `Failed to click button: ${e.message}` };
        }
    }

    // --- File Download Utility ---
    function downloadFile(content, fileName, mimeType) {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([content], { type: mimeType }));
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(a.href);
    }

    // --- UI & State Management ---
    function getApiKeyAndModel() {
        const model = modelSelector.value;
        const apiKey = apiKeyInput.value.trim();
        // Removed the silent error alert here to allow handleMicClick to manage it more verbosely
        return { apiKey, model };
    }

    function updateStatus(message, type = 'info') {
        clearInterval(promoInterval);
        statusDiv.innerHTML = message;
        const styles = {
            success: { bg: '#d4edda', color: '#155724' },
            error: { bg: '#f8d7da', color: '#721c24' },
            warning: { bg: '#fff3cd', color: '#856404' },
            info: { bg: '#e9ecef', color: '#495057' }
        };
        const style = styles[type] || styles['info'];
        statusDiv.style.backgroundColor = style.bg;
        statusDiv.style.color = style.color;

        if (type !== 'error' && !message.includes('...')) {
            promoInterval = setInterval(displayPromotionalMessage, 30000);
        }
    }

    function setLoadingState(isLoading, activeBtn, loadingText) {
        clearInterval(promoInterval);
        allButtons.forEach(btn => {
            if (btn === document.getElementById('bigMicBtn')) {
                btn.style.opacity = isLoading ? '0.5' : '1';
                btn.style.pointerEvents = isLoading ? 'none' : 'auto';
                if (activeBtn === document.getElementById('bigMicBtn')) {
                    btn.disabled = isLoading;
                }
                return;
            }

            btn.disabled = isLoading;
            if (isLoading) {
                if (!btn.dataset.originalText && btn.innerHTML.trim() !== '') btn.dataset.originalText = btn.innerHTML;

                if (btn === activeBtn) {
                    if (!btn.classList.contains('mic-button')) {
                        btn.innerHTML = loadingText;
                    }
                }

                btn.style.cursor = 'wait';
                btn.style.opacity = (btn === activeBtn) ? '1' : '0.6';
            } else {
                if (btn.dataset.originalText) btn.innerHTML = btn.dataset.originalText;
                btn.style.cursor = 'pointer';
                btn.style.opacity = '1';
            }
        });
        analysisSearchInput.disabled = isLoading;
        analysisSearchInput.style.cursor = isLoading ? 'not-allowed' : 'text';
    }

    function displayPromotionalMessage() {
        if (statusDiv.style.color === 'rgb(114, 28, 36)') return;
        updateStatus(promotionalMessages[currentPromoIndex], 'info');
        currentPromoIndex = (currentPromoIndex + 1) % promotionalMessages.length;
    }

    // --- Dataset Search Dropdown ---
    function setupDatasetSearch() {
        const filterAndShow = (termStr) => {
            let filtered = geeDatasets;
            const term = termStr.trim().toLowerCase();

            if (term !== '') {
                const scoredData = geeDatasets.map(d => {
                    let score = 0;
                    const dTitle = d.title ? d.title.toLowerCase() : '';
                    const dId = d.id ? d.id.toLowerCase() : '';
                    const dThematic = d.thematic_group ? d.thematic_group.toLowerCase() : '';
                    const dProvider = d.provider ? d.provider.toLowerCase() : '';

                    let dTagsArr = [];
                    if (d.tags) {
                        dTagsArr = Array.isArray(d.tags) ? d.tags.map(t => t.toLowerCase()) : String(d.tags).toLowerCase().split(/,\s*/);
                    }
                    const dTagsStr = dTagsArr.join(' ');

                    // 1. Title matching (Highest Priority)
                    if (dTitle.includes(term)) {
                        score += 50;
                        if (dTitle.startsWith(term)) score += 20;
                        if (dTitle === term) score += 50;
                        // Word boundary match
                        if (new RegExp(`\\b${term}\\b`).test(dTitle)) score += 10;
                    }

                    // 2. Tags matching
                    if (dTagsStr.includes(term)) {
                        score += 30;
                        if (dTagsArr.includes(term)) score += 20;
                    }

                    // 3. Thematic Group matching
                    if (dThematic.includes(term)) {
                        score += 20;
                        if (dThematic === term) score += 10;
                    }

                    // 4. ID matching
                    if (dId.includes(term)) {
                        score += 10;
                        if (dId === term) score += 10;
                    }

                    // 5. Provider matching
                    if (dProvider.includes(term)) {
                        score += 5;
                    }

                    return { dataset: d, score: score };
                }).filter(item => item.score > 0);

                scoredData.sort((a, b) => b.score - a.score);
                filtered = scoredData.map(item => item.dataset);
            }
            // Show top 30 to avoid overwhelming the DOM
            populateDatasetOptions(filtered.slice(0, 30));
            datasetOptionsContainer.classList.add('show');
        };

        datasetSearchInput.addEventListener('input', (e) => filterAndShow(e.target.value.toLowerCase()));
        datasetSearchInput.addEventListener('click', () => filterAndShow(datasetSearchInput.value.toLowerCase()));

        datasetOptionsContainer.addEventListener('click', async (e) => {
            const option = e.target.closest('.dropdown-option');
            if (!option) return;

            const datasetId = option.dataset.id;
            const typecode = option.dataset.typecode;
            const url = option.dataset.url;

            if (e.target.closest('.action-add-editor')) {
                // Insert into Editor
                const safeTitle = option.querySelector('div').innerText.replace(/\n/g, ' ');
                const lines = `\n// ${safeTitle}\nvar dataset = ${typecode}('${datasetId}');\n`;
                await injectScript(injectCodeIntoEditor, [lines, 'insert']);
                updateStatus('Dataset code inserted into editor.', 'success');
                datasetOptionsContainer.classList.remove('show');
            } else if (e.target.closest('.action-view-example')) {
                // Open example url directly in a new tab
                if (url && url !== 'undefined') window.open(url, '_blank');
            } else {
                // Default or Add to chat (as chip)
                const chipsContainer = document.getElementById('datasetChipsContainer');

                if (chipsContainer && !Array.from(chipsContainer.children).some(chip => chip.dataset.id === datasetId)) {
                    const chip = document.createElement('div');
                    chip.className = 'dataset-chip';
                    chip.dataset.id = datasetId;
                    chip.style.cssText = 'display: inline-flex; align-items: center; background-color: white; border: 1px solid #cdd3dc; border-radius: 4px; padding: 2px 6px; font-size: 11px; color: #586069; gap: 4px; font-family: monospace; white-space: nowrap;';
                    chip.innerHTML = `<span>${datasetId}</span><span class="remove-chip" style="cursor: pointer; color: #dc3545; font-weight: bold; padding-left: 4px;">&times;</span>`;

                    chip.querySelector('.remove-chip').addEventListener('click', (ev) => {
                        ev.stopPropagation();
                        chip.remove();
                    });

                    chipsContainer.appendChild(chip);
                }

                datasetSearchInput.value = '';
                filterAndShow('');
                datasetOptionsContainer.classList.remove('show');

                // Focus the prompt box so cursor blinks at the end
                unifiedPrompt.focus();
                unifiedPrompt.selectionStart = unifiedPrompt.value.length;
                unifiedPrompt.selectionEnd = unifiedPrompt.value.length;
            }
        });

        document.addEventListener('click', (e) => {
            if (!datasetOptionsContainer.contains(e.target) && e.target !== datasetSearchInput) {
                datasetOptionsContainer.classList.remove('show');
            }
        });
    }

    function populateDatasetOptions(datasets) {
        datasetOptionsContainer.innerHTML = datasets.length ?
            datasets.map(dataset => {
                const isTable = dataset.type === 'table' || dataset.type === 'bigquery_table';
                const typeCode = isTable ? "ee.FeatureCollection" : "ee.ImageCollection";
                const datasetId = dataset.id;
                const sampleCode = dataset.sample_code ? dataset.sample_code : `https://code.earthengine.google.com/?scriptPath=Examples:Datasets/${datasetId}`;

                return `<div class="dropdown-option dataset-card dataset-item" data-id="${datasetId}" data-typecode="${typeCode}" data-url="${sampleCode}">
                            <div class="dataset-title">${dataset.title}</div>
                            <div class="dataset-id-container">
                                <span class="dataset-id">${dataset.id}</span>
                            </div>
                            <div class="dataset-actions">
                                <button class="dataset-action-btn action-add-chat">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                    chat
                                </button>
                                <button class="dataset-action-btn action-add-editor">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>
                                    editor
                                </button>
                                <button class="dataset-action-btn action-view-example">
                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                    sample
                                </button>
                            </div>
                        </div>`;
            }).join('') :
            '<div class="dropdown-option dataset-card" style="cursor: default; text-align: center; color: #666; padding: 16px;">No datasets found</div>';
    }

    // --- Analysis Search Dropdown ---
    function setupAnalysisSearch() {
        const filterAndShow = (term) => {
            const filtered = geeAnalyses.filter(a => a.title.toLowerCase().includes(term));
            populateAnalysisOptions(filtered);
            analysisOptionsContainer.classList.add('show');
        };
        analysisSearchInput.addEventListener('input', (e) => filterAndShow(e.target.value.toLowerCase()));
        analysisSearchInput.addEventListener('focus', () => filterAndShow(''));

        analysisOptionsContainer.addEventListener('click', (e) => {
            const option = e.target.closest('.dropdown-option');
            if (option) {
                analysisSearchInput.value = option.textContent;
                selectedAnalysisIndexInput.value = option.dataset.index;
                analysisOptionsContainer.classList.remove('show');
            }
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('.searchable-dropdown')) {
                analysisOptionsContainer.classList.remove('show');
            }
        });
    }

    function populateAnalysisOptions(analyses) {
        analysisOptionsContainer.innerHTML = analyses.length ?
            analyses.map(analysis => {
                const originalIndex = geeAnalyses.findIndex(item => item.title === analysis.title);
                return `<div class="dropdown-option" data-index="${originalIndex}">${analysis.title}</div>`;
            }).join('') :
            '<div class="dropdown-option" style="cursor: default;">No results found</div>';
    }

    // --- Initial setup ---
    async function init() {
        loadSettings();
        loadLastSession();
        setMode('auto');

        try {
            const [datasetsRes, commDatasetsRes, analysesRes] = await Promise.all([
                fetch('gee_catalog_formatted.json'),
                fetch('community_datasets.json'),
                fetch('analysis.json')
            ]);
            if (!datasetsRes.ok) throw new Error('Failed to load gee_catalog_formatted.json');
            if (!commDatasetsRes.ok) throw new Error('Failed to load community_datasets.json');
            if (!analysesRes.ok) throw new Error('Failed to load analysis.json');

            const [geeStandard, geeCommunity, geeAn] = await Promise.all([
                datasetsRes.json(),
                commDatasetsRes.json(),
                analysesRes.json()
            ]);

            // Combine both datasets lists together
            geeDatasets = [...geeStandard, ...geeCommunity];
            geeAnalyses = geeAn;

            setupAnalysisSearch();
            setupDatasetSearch();
            updateStatus('Ready.', 'success');
        } catch (error) {
            console.error('Initialization Error:', error);
            updateStatus(`Error loading resources: ${error.message}`, 'error');
        }
    }

    init();
});
