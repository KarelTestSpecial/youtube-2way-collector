# youtube-2way-collector
Source code for "YouTube 2-way Playlist Collector" Chrome extension

Collect videos from YouTube playlists and save them to a Google Sheet.
Edit / Re-arrange your playlists in the Google Sheet and save the changes back to YouTube.

Effortlessly Export Your YouTube Playlists to Google Sheets and back

Tired of worrying about deleted videos or disappearing playlists? Want a simple, searchable, and permanent backup of your carefully curated video collections? YouTube Playlist Collector is the ultimate tool for archiving your YouTube playlists directly into a single, organized Google Sheet.

How It Works - Simple as 1-2-3

Click the extension icon in your browser's toolbar.
Choose your method:
For all playlists: Leave the text box empty.
For specific playlists: Paste one or more playlist IDs, each on a new line.
Click "Start Export" and grant the necessary permissions through the official Google pop-up.
That's it! The extension will process your request and provide a direct link to your newly created or updated Google Sheet.

Why You'll Love It

Digital Archiving: Create a permanent backup of your playlists. Never again lose a list of videos because a channel was deleted or a video was made private.
Content Management: Easily search, sort, and manage your video lists in the powerful Google Sheets interface. Find that one video you were looking for in seconds.
Sharing & Collaboration: Share a simple, text-based list with friends or colleagues without needing them to navigate the YouTube interface.
Offline Record: Have a complete record of your video titles even when you're offline.

-----

To all technically skilled users:

You can install it and run it locally

To all developers :

Please feel free to set up the project as a Google Chrome Web Store extension .

I myself have no personal webdomain which is a new requirement by Google for oAuth-verification for extensions that use Google/YouTube API's via the Google Cloud Platform (since Manifest v3).

It is a good program and I use it locally (which is allowed by Google) and I think it would be benificial to the community if someone made a publically available Chrome extension out of it.

Many greetings,

Karel.Test.Special

-----

Belangrijke Mededeling
Deze repository bevat de volledig werkende code en stelt je in staat de extensie lokaal te draaien met je eigen Google API-credentials. Volg de onderstaande stappen zorgvuldig.

Vanwege de aangescherpte verificatie-eisen van Google is het voor deze extensie niet mogelijk om het officiële OAuth-verificatieproces te doorlopen zonder een eigen, betaalde domeinnaam te registreren.

Daarom is de versie in de Chrome Web Store niet meer beschikbaar. In plaats daarvan is er deze GitHub-pagina.

-----

Installatie- en Configuratiegids
Stap 1: Download de Code
Kloon deze repository of download de code als een ZIP-bestand en pak het uit op je computer. git clone https://github.com/KarelTestSpecial/YouTube-Playlist-Collector.git

Stap 2: Creëer je Eigen Google Cloud Project
Je hebt je eigen API-sleutels nodig.

Ga naar de Google Cloud Console.
Maak een Nieuw Project aan. Geef het een duidelijke naam (bv. "Mijn Playlist Extensie").
Selecteer je nieuwe project en ga naar API's en services > Bibliotheek.
Zoek en activeer de volgende drie API's:
YouTube Data API v3
Google Drive API
Google Sheets API
Ga naar API's en services > Inloggegevens (Credentials).
Klik op + Inloggegevens aanmaken > OAuth-client-ID.
Kies als toepassingstype Chrome-app.
Geef het een naam, bv. "Chrome Extensie Client".
Laat het veld "Toepassings-ID" voor nu leeg en klik op Maken.
Je krijgt nu een Client-ID. Kopieer deze, die hebben we later nodig.
Stap 3: Laad de Extensie Lokaal in Chrome
Open Chrome en navigeer naar chrome://extensions.
Activeer rechtsboven de Ontwikkelaarsmodus (Developer mode).
Klik op de knop Uitgepakte extensie laden (Load unpacked).
Selecteer de map waarin je de code hebt gedownload.
De extensie verschijnt nu in je lijst. Zoek de ID van de extensie (een lange reeks letters, bv: abcdefghijklmnopabcdefghijklmnop). Kopieer deze ID.
Stap 4: Koppel de Extensie aan je Google Project
Ga terug naar de Google Cloud Console, naar de Client-ID die je in Stap 2 hebt gemaakt. Klik erop om deze te bewerken.
Plak de Extensie-ID die je zojuist hebt gekopieerd in het veld Toepassings-ID.
Klik op Opslaan.
Stap 5: Configureer het Manifest-bestand
Open het bestand manifest.json in de codemap.

Zoek het oauth2-object. Vervang de bestaande client_id door de Client-ID die je in Stap 2.10 hebt gekopieerd.

// in manifest.json
"oauth2": {
    "client_id": "HIER-JOUW-EIGEN-CLIENT-ID-PLAKKEN.apps.googleusercontent.com",
    "scopes": [
      // ... scopes blijven hetzelfde
    ]
}
Sla het manifest.json-bestand op.

Stap 6: Herlaad en Gebruik
Ga terug naar de chrome://extensions pagina. Klik op het herlaad-icoontje (de cirkelvormige pijl) op de kaart van je "YouTube Playlist Collector" extensie. Dit is een essentiële stap om de wijzigingen in manifest.json te laden. Klik op het extensie-icoon in je werkbalk om te beginnen. De eerste keer zal Google je vragen om in te loggen en toestemming te geven.
