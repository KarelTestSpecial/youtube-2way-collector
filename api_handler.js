const SPREADSHEET_NAME = chrome.i18n.getMessage("spreadsheetName");
const LIKED_VIDEOS_TITLE = "Liked Videos"; 

async function googleApiFetch(url, token, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        }
    });
    if (!response.ok) {
        const errorData = await response.json();
        const errorMessage = errorData.error?.message || `API Error: ${response.status}`;
        throw new Error(errorMessage);
    }
    if (response.status === 204) return null; // No Content
    return response.json();
}

async function findOrCreateSpreadsheet(token, createIfMissing = true) {
    const driveQuery = `name='${SPREADSHEET_NAME}' and mimeType='application/vnd.google-apps.spreadsheet' and trashed=false`;
    const driveUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(driveQuery)}&fields=files(id)`;
    
    const driveResponse = await googleApiFetch(driveUrl, token);

    if (driveResponse.files && driveResponse.files.length > 0) {
        return { spreadsheetId: driveResponse.files[0].id, isNew: false };
    } else if (createIfMissing) {
        const sheetsUrl = `https://sheets.googleapis.com/v4/spreadsheets`;
        const createResponse = await googleApiFetch(sheetsUrl, token, {
            method: 'POST',
            body: JSON.stringify({ properties: { title: SPREADSHEET_NAME } })
        });
        return { spreadsheetId: createResponse.spreadsheetId, isNew: true };
    }
    return null;
}

async function fetchAllUserPlaylistIds(token) {
    const allIds = [];
    const messages = [];

    try {
        const channelsUrl = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&mine=true`;
        const channelsResponse = await googleApiFetch(channelsUrl, token);
        const relatedPlaylists = channelsResponse.items?.[0]?.contentDetails?.relatedPlaylists;

        if (relatedPlaylists) {
            if (relatedPlaylists.likes) allIds.push(relatedPlaylists.likes);
            // Watch Later is often restricted by the API
            // if (relatedPlaylists.watchLater) allIds.push(relatedPlaylists.watchLater);
            // else messages.push(chrome.i18n.getMessage("noteWatchLater"));
        }
    } catch (error) {
        messages.push(chrome.i18n.getMessage("noteSpecialPlaylists"));
    }

    let nextPageToken = null;
    do {
        let url = `https://www.googleapis.com/youtube/v3/playlists?part=id&mine=true&maxResults=50`;
        if (nextPageToken) { url += `&pageToken=${nextPageToken}`; }
        try {
            const response = await googleApiFetch(url, token);
            if (response.items) { allIds.push(...response.items.map(item => item.id)); }
            nextPageToken = response.nextPageToken;
        } catch (error) {
            nextPageToken = null; 
        }
    } while (nextPageToken);

    const uniqueIds = [...new Set(allIds)];
    return { ids: uniqueIds, messages };
}

async function processSinglePlaylist(token, playlistId, spreadsheetId, playlistTitle) {
    let sheetId;
    // Sanitize title for sheet usage
    const safePlaylistTitle = playlistTitle.replace(/'/g, "''");

    // Try to add a new sheet. If it fails, it likely already exists.
    try {
        const addSheetRequest = { requests: [{ addSheet: { properties: { title: safePlaylistTitle } } }] };
        const addSheetResponse = await googleApiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, token, {
            method: 'POST',
            body: JSON.stringify(addSheetRequest)
        });
        sheetId = addSheetResponse.replies[0].addSheet.properties.sheetId;
    } catch (e) {
        // Sheet exists, clear it instead.
        await googleApiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(safePlaylistTitle)}!A1:Z:clear`, token, { method: 'POST' });
        
        try {
            const sheetMeta = await googleApiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets.properties`, token);
            const existingSheet = sheetMeta.sheets.find(s => s.properties.title === safePlaylistTitle);
            if (existingSheet) sheetId = existingSheet.properties.sheetId;
        } catch (metaError) {
            console.error("Could not retrieve sheetId for existing sheet:", metaError);
        }
    }

    const headers = [[
        chrome.i18n.getMessage("columnTitle"),
        chrome.i18n.getMessage("columnLink"),
        chrome.i18n.getMessage("columnVideoId")
    ]];
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(safePlaylistTitle)}!A1:append?valueInputOption=USER_ENTERED`;
    await googleApiFetch(updateUrl, token, { method: 'POST', body: JSON.stringify({ values: headers }) });
    
    let videoCount = 0;
    let nextPageToken = null;
    const videoRows = [];
    do {
        let itemsUrl = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50`;
        if (nextPageToken) { itemsUrl += `&pageToken=${nextPageToken}`; }
        const response = await googleApiFetch(itemsUrl, token);
        for (const item of response.items ?? []) {
            if (!item.snippet.resourceId?.videoId) continue;
            videoRows.push([
                item.snippet.title, 
                `https://www.youtube.com/watch?v=${item.snippet.resourceId.videoId}`,
                item.snippet.resourceId.videoId
            ]);
            videoCount++;
        }
        nextPageToken = response.nextPageToken;
    } while (nextPageToken);

    if (videoRows.length > 0) {
        await googleApiFetch(updateUrl, token, { method: 'POST', body: JSON.stringify({ values: videoRows }) });
    }

    let resizeRequest = null;
    if (sheetId) {
        resizeRequest = { autoResizeDimensions: { dimensions: { sheetId: sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 3 } } };
    }

    return {
        success: true,
        message: chrome.i18n.getMessage("successProcessPlaylist", [videoCount.toString(), playlistTitle]),
        resizeRequest: resizeRequest
    };
}

export async function processPlaylists(token, playlistIds, updateStatus) {
    let userMessages = [];
    if (playlistIds.length === 0) {
        updateStatus(chrome.i18n.getMessage('statusSearchingAll'));
        const playlistData = await fetchAllUserPlaylistIds(token);
        playlistIds = playlistData.ids;
        userMessages = playlistData.messages;
        if (playlistIds.length === 0) {
            return { message: chrome.i18n.getMessage("errorNoPlaylistsFound"), sheet_url: null };
        }
    } else {
        updateStatus(chrome.i18n.getMessage('statusProcessingInput'));
    }

    const sheetInfo = await findOrCreateSpreadsheet(token);
    const results = [];
    const resizeRequests = [];
    let hasSuccessfulProcessing = false;

    for (const pid of playlistIds) {
        try {
            const playlistInfo = await googleApiFetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${pid}&fields=items(id,snippet(title))`, token);
            if (!playlistInfo.items || playlistInfo.items.length === 0) {
                results.push(chrome.i18n.getMessage("errorPlaylistNotFound", [pid]));
                continue;
            }
            const playlistTitle = playlistInfo.items[0].snippet.title;
            
            updateStatus(chrome.i18n.getMessage("statusProcessingPlaylist", [playlistTitle]));

            const singleResult = await processSinglePlaylist(token, pid, sheetInfo.spreadsheetId, playlistTitle);
            results.push(singleResult.message);
            if (singleResult.resizeRequest) resizeRequests.push(singleResult.resizeRequest);
            if (singleResult.success) hasSuccessfulProcessing = true;

        } catch (error) {
            const errorMessage = chrome.i18n.getMessage("errorProcessingPlaylist", [pid, error.message]);
            console.error(errorMessage, error);
            results.push(errorMessage);
        }
    }

    if (resizeRequests.length > 0) {
        try {
            await googleApiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetInfo.spreadsheetId}:batchUpdate`, token, {
                method: 'POST',
                body: JSON.stringify({ requests: resizeRequests })
            });
        } catch (e) {
            console.error("Error batching column resize:", e);
        }
    }

    if (sheetInfo.isNew && hasSuccessfulProcessing) {
        try { // Delete the default "Sheet1"
            await googleApiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetInfo.spreadsheetId}:batchUpdate`, token, {
                method: 'POST',
                body: JSON.stringify({ requests: [{ deleteSheet: { sheetId: 0 } }] })
            });
        } catch (e) { /* Fails silently if sheet was already removed */ }
    }

    const finalMessage = chrome.i18n.getMessage("summaryComplete", [[...userMessages, ...results].join("\n")]);
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetInfo.spreadsheetId}`;
    
    return { message: finalMessage, sheet_url: sheetUrl };
}

function extractVideoId(url) {
    if (!url) return null;
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

async function getVideosFromSheet(token, spreadsheetId, sheetTitle) {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetTitle)}!B2:C`;
    const response = await googleApiFetch(url, token);
    if (!response.values) return [];

    const videoIds = new Set();
    for (const row of response.values) {
        const link = row[0];
        const idInSheet = row[1];
        
        const id = (idInSheet || extractVideoId(link))?.trim();
        if (id) videoIds.add(id);
    }
    return [...videoIds]; // Return array of unique IDs
}

async function getYouTubePlaylistMap(token) {
    const playlistMap = new Map();
    let nextPageToken = null;
    do {
        let url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=50`;
        if (nextPageToken) url += `&pageToken=${nextPageToken}`;
        const response = await googleApiFetch(url, token);
        for (const item of response.items ?? []) {
            playlistMap.set(item.snippet.title, item.id);
        }
        nextPageToken = response.nextPageToken;
    } while (nextPageToken);
    return playlistMap;
}

async function getYouTubePlaylistItems(token, playlistId) {
    const items = new Map();
    let nextPageToken = null;
    do {
        let url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50`;
        if (nextPageToken) url += `&pageToken=${nextPageToken}`;
        const response = await googleApiFetch(url, token);
        for (const item of response.items ?? []) {
            if (item.snippet.resourceId?.videoId) {
                items.set(item.snippet.resourceId.videoId, {
                    playlistItemId: item.id,
                    title: item.snippet.title
                });
            }
        }
        nextPageToken = response.nextPageToken;
    } while (nextPageToken);
    return items;
}

export async function uploadPlaylistsFromSheet(token, updateLog) {
    const logMessages = [];
    const sheetInfo = await findOrCreateSpreadsheet(token, false);
    if (!sheetInfo) throw new Error(chrome.i18n.getMessage("errorSpreadsheetNotFound"));
    
    const [sheetResponse, ytPlaylistMap] = await Promise.all([
        googleApiFetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheetInfo.spreadsheetId}?fields=sheets.properties.title`, token),
        getYouTubePlaylistMap(token)
    ]);
    const sheetTitles = sheetResponse.sheets.map(s => s.properties.title);

    for (const sheetTitle of sheetTitles) {
        updateLog(chrome.i18n.getMessage('statusSyncing', [sheetTitle]));
        if (sheetTitle === LIKED_VIDEOS_TITLE) {
            logMessages.push(chrome.i18n.getMessage('warningSkippedLikes'));
            continue;
        }

        const videosInSheet = await getVideosFromSheet(token, sheetInfo.spreadsheetId, sheetTitle);
        const playlistId = ytPlaylistMap.get(sheetTitle);

        if (playlistId) { // Existing playlist -> Sync
            logMessages.push(chrome.i18n.getMessage('logPlaylistUpdated', [sheetTitle]));
            const videosOnYouTube = await getYouTubePlaylistItems(token, playlistId);
            const sheetVideoIds = new Set(videosInSheet);
            const ytVideoIds = new Set(videosOnYouTube.keys());
            let hasChanges = false;

            // Items to remove
            for (const [videoId, item] of videosOnYouTube.entries()) {
                if (!sheetVideoIds.has(videoId)) {
                    await googleApiFetch(`https://www.googleapis.com/youtube/v3/playlistItems?id=${item.playlistItemId}`, token, { method: 'DELETE' });
                    logMessages.push(chrome.i18n.getMessage('logItemRemoved', [item.title]));
                    hasChanges = true;
                }
            }

            // Items to add
            for (const videoId of videosInSheet) {
                if (!ytVideoIds.has(videoId)) {
                    const body = { snippet: { playlistId: playlistId, resourceId: { kind: 'youtube#video', videoId: videoId } } };
                    try {
                        const addedItem = await googleApiFetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet`, token, { method: 'POST', body: JSON.stringify(body) });
                        logMessages.push(chrome.i18n.getMessage('logItemAdded', [addedItem.snippet.title]));
                        hasChanges = true;
                    } catch (addError) {
                        logMessages.push(`  [!] Failed to add video ID ${videoId}: ${addError.message}`);
                    }
                }
            }
            if (!hasChanges) logMessages.push(chrome.i18n.getMessage('logUnchanged'));

        } else { // New playlist -> Create and add all
            logMessages.push(chrome.i18n.getMessage('logPlaylistCreated', [sheetTitle]));
            const body = { snippet: { title: sheetTitle, description: "Created by YouTube Playlist 2-Way Collector" }, status: { privacyStatus: 'private' } };
            const newPlaylist = await googleApiFetch(`https://www.googleapis.com/youtube/v3/playlists?part=snippet,status`, token, { method: 'POST', body: JSON.stringify(body) });
            
            for (const videoId of videosInSheet) {
                 const itemBody = { snippet: { playlistId: newPlaylist.id, resourceId: { kind: 'youtube#video', videoId: videoId } } };
                 try {
                     const addedItem = await googleApiFetch(`https://www.googleapis.com/youtube/v3/playlistItems?part=snippet`, token, { method: 'POST', body: JSON.stringify(itemBody) });
                     logMessages.push(chrome.i18n.getMessage('logItemAdded', [addedItem.snippet.title]));
                 } catch (addError) {
                     logMessages.push(`  [!] Failed to add video ID ${videoId}: ${addError.message}`);
                 }
            }
        }
    }
    return { message: chrome.i18n.getMessage("summaryUploadComplete", [logMessages.join("\n")]) };
}