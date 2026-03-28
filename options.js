/*
Copyright © 2025 Pulakesh Pradhan.  
All rights reserved.

This file is part of the project: **GEE AI Assistant**.  
Unauthorized copying, distribution, modification, or use of this code, in whole or in part, is strictly prohibited without the express written permission of the copyright holder.

For permissions or inquiries, contact: pulakesh.mid@gmail.com
*/

document.addEventListener('DOMContentLoaded', () => {
    const micStatusBadge = document.getElementById('mic-status-badge');
    const permissionCtaDiv = document.getElementById('permission-cta');

    function updateUI(state) {
        micStatusBadge.textContent = state.charAt(0).toUpperCase() + state.slice(1);
        micStatusBadge.className = 'status-badge'; // Reset classes
        permissionCtaDiv.style.display = 'block';

        switch (state) {
            case 'granted':
                micStatusBadge.classList.add('status-granted');
                permissionCtaDiv.innerHTML = `
                    <h3>All Set!</h3>
                    <p>Microphone access is enabled. You can now use the voice dictation feature in the extension's side panel.</p>
                `;
                break;

            case 'denied':
                micStatusBadge.classList.add('status-denied');
                permissionCtaDiv.innerHTML = `
                    <h3>Action Required</h3>
                    <p>You have previously blocked microphone access. To use the voice feature, you must manually allow it in your browser settings.</p>
                    <ol>
                        <li>Click the <strong>puzzle piece icon</strong> in your Chrome toolbar, then the <strong>three dots</strong> next to the extension, and select <strong>"Manage extension"</strong>.</li>
                        <li>On the extension details page, find the <strong>"Site settings"</strong> option and click it.</li>
                        <li>Find <strong>Microphone</strong> in the permissions list and change its setting from "Block" to <strong>"Allow"</strong>.</li>
                    </ol>
                    <p>After changing the setting, please reload the extension by toggling it off and on from the extensions page.</p>
                `;
                break;

            case 'prompt':
            default:
                micStatusBadge.classList.add('status-prompt');
                permissionCtaDiv.innerHTML = `
                    <h3>Grant Access</h3>
                    <p>The extension needs your permission to access the microphone for voice-to-text to work.</p>
                    <button id="grant-access-btn" class="btn">Grant Microphone Access</button>
                `;
                document.getElementById('grant-access-btn').addEventListener('click', requestMicPermission);
                break;
        }
    }

    async function checkMicPermission() {
        try {
            const permissionStatus = await navigator.permissions.query({ name: 'microphone' });
            updateUI(permissionStatus.state);
            permissionStatus.onchange = () => updateUI(permissionStatus.state);
        } catch (error) {
            console.error("Permission API is not supported or failed:", error);
            permissionCtaDiv.innerHTML = "<p>Could not check microphone permissions. Your browser may not fully support this feature.</p>";
            permissionCtaDiv.style.display = 'block';
        }
    }

    async function requestMicPermission() {
        const button = document.getElementById('grant-access-btn');
        if(button) button.disabled = true;
        
        try {
            // This will trigger the browser's permission prompt
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            // We don't need to use the stream, just requesting it is enough.
            // Stop the tracks immediately to turn off the mic indicator.
            stream.getTracks().forEach(track => track.stop());
            // The onchange event from checkMicPermission will handle the UI update.
        } catch (err) {
            console.error("Error requesting microphone access:", err);
            // If the user denies it here, the state will change to 'denied'
            // and the onchange event will update the UI with instructions.
            if(button) button.disabled = false;
        }
    }

    checkMicPermission();
});
