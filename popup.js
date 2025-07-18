import { processPlaylists, uploadPlaylistsFromSheet } from './api_handler.js';

function localizeHtml() {
    document.title = chrome.i18n.getMessage('appName');
    document.getElementById('popupTitle').textContent = chrome.i18n.getMessage('popupTitle');
    document.getElementById('manual_button').title = chrome.i18n.getMessage('manualButtonTitle');
    document.getElementById('popupExplanation').textContent = chrome.i18n.getMessage('popupExplanation');
    document.getElementById('playlist_ids').placeholder = chrome.i18n.getMessage('textareaPlaceholder');
    document.getElementById('process_button').textContent = chrome.i18n.getMessage('processButton');
    document.getElementById('upload_button').textContent = chrome.i18n.getMessage('uploadButton');
}

function setupManualToggle() {
    const manualButton = document.getElementById('manual_button');
    const manualContentDiv = document.getElementById('manual_content');

    manualButton.addEventListener('click', (event) => {
        event.preventDefault();
        const isHidden = manualContentDiv.style.display === 'none';
        if (isHidden) {
            // Use innerHTML to render the HTML tags from the message
            manualContentDiv.innerHTML = chrome.i18n.getMessage('manualContent');
            manualContentDiv.style.display = 'block';
        } else {
            manualContentDiv.style.display = 'none';
        }
    });

    manualContentDiv.addEventListener('click', (event) => {
        // Only hide if the click is on the background, not on a link
        if (event.target.tagName !== 'A') {
            manualContentDiv.style.display = 'none';
        }
    });
}

document.addEventListener('DOMContentLoaded', () => {
    localizeHtml();
    setupManualToggle();
});

function setButtonsDisabled(disabled) {
    document.getElementById('process_button').disabled = disabled;
    document.getElementById('upload_button').disabled = disabled;
}

async function runAction(actionFunction, initialStatusMessage) {
    const statusDiv = document.getElementById('status');
    statusDiv.textContent = '';
    setButtonsDisabled(true);

    let logLines = [];
    const updateLog = (newLine) => {
        logLines.push(newLine);
        statusDiv.textContent = logLines.join('\n');
        statusDiv.scrollTop = statusDiv.scrollHeight;
    };

    try {
        updateLog(chrome.i18n.getMessage('statusResettingAuth'));

        const currentToken = await new Promise(resolve => chrome.identity.getAuthToken({ interactive: false }, resolve));
        if (currentToken) {
            await new Promise(resolve => chrome.identity.removeCachedAuthToken({ token: currentToken }, resolve));
        }

        const token = await new Promise((resolve, reject) => {
            chrome.identity.getAuthToken({ interactive: true }, (token) => {
                if (chrome.runtime.lastError || !token) {
                    reject(new Error(chrome.i18n.getMessage('errorGetToken')));
                } else {
                    resolve(token);
                }
            });
        });

        logLines = []; // Clear log after successful auth
        updateLog(chrome.i18n.getMessage('statusAuthSuccess'));
        updateLog(initialStatusMessage);

        const result = await actionFunction(token, updateLog);

        updateLog("\n" + result.message);

        if (result.sheet_url) {
            const link = document.createElement('a');
            link.href = result.sheet_url;
            link.textContent = chrome.i18n.getMessage('openSheetLink');
            link.target = '_blank';
            statusDiv.appendChild(document.createElement('br'));
            statusDiv.appendChild(link);
        }

    } catch (error) {
        updateLog(chrome.i18n.getMessage('statusError', [error.message]));
        console.error("Error during action:", error);
    } finally {
        setButtonsDisabled(false);
    }
}

function extractPlaylistIdFromInput(input) {
    if (!input) return null;
    const regex = /[?&]list=([a-zA-Z0-9_-]+)/;
    const match = input.match(regex);
    return match ? match[1] : input.trim(); 
}

document.getElementById('process_button').addEventListener('click', () => {
    const playlistIdsRaw = document.getElementById('playlist_ids').value;
    const playlistInputs = playlistIdsRaw.split(/\r?\n/);

    const playlistIds = playlistInputs
        .map(input => extractPlaylistIdFromInput(input))
        .filter(id => id); // Remove null or empty results.
    
    const action = (token, updateStatus) => processPlaylists(token, playlistIds, updateStatus);
    
    const initialMessage = playlistIds.length === 0 ? 
        chrome.i18n.getMessage('statusSearchingAll') : 
        chrome.i18n.getMessage('statusProcessingInput');

    runAction(action, initialMessage);
});

document.getElementById('upload_button').addEventListener('click', () => {
    const action = (token, updateLog) => uploadPlaylistsFromSheet(token, updateLog);
    const initialMessage = chrome.i18n.getMessage('statusStartingUpload');
    
    runAction(action, initialMessage);
});