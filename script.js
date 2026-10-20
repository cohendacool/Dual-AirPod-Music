const databaseName = "DualAirpodMusic";
const databaseVersion = 1;

let database;
let tracks = [];
let playlists = [];
let selectedPlaylistId = null;

let audioContext;
let pendingPlaylistId = null;

const audioPlayers = {
    left: {
        audio: new Audio(),
        playlist: [],
        index: 0,
        playing: false,
        source: null,
        panner: null,
        objectUrl: null
    },
    right: {
        audio: new Audio(),
        playlist: [],
        index: 0,
        playing: false,
        source: null,
        panner: null,
        objectUrl: null
    }
};

function setupAudioPlayers() {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();

    for (const [side, player] of Object.entries(audioPlayers)) {
        player.audio.preload = "auto";

        player.source = audioContext.createMediaElementSource(player.audio);
        player.panner = audioContext.createStereoPanner();

        player.panner.pan.value = side === "left" ? -1 : 1;

        player.source.connect(player.panner);
        player.panner.connect(audioContext.destination);

        player.audio.addEventListener("ended", () => {
            playNextTrack(side);
        });

        player.audio.addEventListener("error", () => {
            showStatus("Unable to play this audio file.");
        });
    }
}

function openEarbudMenu(playlistId) {
    const playlist = playlists.find((item) => item.id === playlistId);

    if (!playlist) {
        showStatus("Playlist not found.");
        return;
    }

    if (playlist.trackIds.length === 0) {
        showStatus("Add songs to this playlist before playing it.");
        return;
    }

    pendingPlaylistId = playlistId;

    document.getElementById("earbud-modal-playlist").textContent =
        `Choose where "${playlist.name}" should play.`;

    document.getElementById("earbud-modal").hidden = false;
}

function closeEarbudMenu() {
    document.getElementById("earbud-modal").hidden = true;
    pendingPlaylistId = null;
}

async function startPlaylist(side, playlistId) {
    const player = audioPlayers[side];
    const playlist = playlists.find((item) => item.id === playlistId);

    if (!playlist) {
        showStatus("Playlist not found.");
        return;
    }

    const playlistTracks = playlist.trackIds
        .map((id) => tracks.find((track) => track.id === id))
        .filter((track) => track && track.file);

    if (playlistTracks.length === 0) {
        showStatus("This playlist has no playable songs.");
        return;
    }

    if (!audioContext) {
        setupAudioPlayers();
    }

    await audioContext.resume();

    player.audio.pause();

    if (player.objectUrl) {
        URL.revokeObjectURL(player.objectUrl);
        player.objectUrl = null;
    }

    player.playlist = [...playlistTracks];
    player.index = 0;

    const shuffle = document.getElementById(`${side}-shuffle`).checked;

    if (shuffle) {
        for (let i = player.playlist.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [player.playlist[i], player.playlist[j]] =
                [player.playlist[j], player.playlist[i]];
        }
    }

    player.playing = true;

    await playCurrentTrack(side);

    closeEarbudMenu();
}

async function playCurrentTrack(side) {
    const player = audioPlayers[side];

    if (player.index >= player.playlist.length) {
        player.playing = false;
        player.audio.pause();
        updatePlayerDisplay(side, "Playlist finished");
        return;
    }

    const track = player.playlist[player.index];

    if (player.objectUrl) {
        URL.revokeObjectURL(player.objectUrl);
    }

    player.objectUrl = URL.createObjectURL(track.file);
    player.audio.src = player.objectUrl;

    updatePlayerDisplay(side, track.name.replace(/\.[^.]+$/, ""));

    try {
        await player.audio.play();
        player.playing = true;
    } catch (error) {
        player.playing = false;
        showStatus("Playback failed. Try pressing Play again.");
    }
}

function playNextTrack(side) {
    const player = audioPlayers[side];

    if (!player.playing) {
        return;
    }

    player.index += 1;

    if (player.index >= player.playlist.length) {
        player.playing = false;
        player.audio.pause();
        updatePlayerDisplay(side, "Playlist finished");
        return;
    }

    playCurrentTrack(side);
}

async function togglePlayer(side) {
    const player = audioPlayers[side];

    if (player.playing) {
        player.audio.pause();
        player.playing = false;
        document.getElementById(`${side}-play-pause`).textContent = "Resume";
        return;
    }

    if (player.playlist.length === 0) {
        showStatus("Choose a playlist to play first.");
        return;
    }

    if (!audioContext) {
        setupAudioPlayers();
    }

    await audioContext.resume();

    if (player.audio.src && player.audio.currentTime > 0) {
        try {
            await player.audio.play();
            player.playing = true;
            document.getElementById(`${side}-play-pause`).textContent = "Pause";
        } catch (error) {
            showStatus("Playback failed. Try again.");
        }
    } else {
        player.playing = true;
        await playCurrentTrack(side);
    }
}

function stopPlayer(side) {
    const player = audioPlayers[side];

    player.playing = false;
    player.audio.pause();
    player.audio.currentTime = 0;
    player.audio.removeAttribute("src");
    player.audio.load();

    if (player.objectUrl) {
        URL.revokeObjectURL(player.objectUrl);
        player.objectUrl = null;
    }

    player.playlist = [];
    player.index = 0;

    updatePlayerDisplay(side, "Nothing playing");
}

function updatePlayerDisplay(side, text) {
    document.getElementById(`${side}-now-playing`).textContent = text;

    document.getElementById(`${side}-play-pause`).textContent =
        audioPlayers[side].playing ? "Pause" : "Resume";
}

function hideWarning() {
    const headsUp = document.getElementById("heads-up");
    const main = document.getElementById("main");

    headsUp.style.display = "none";
    main.style.display = "flex";
}

function openDatabase() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(databaseName, databaseVersion);

        request.onupgradeneeded = () => {
            const db = request.result;

            if (!db.objectStoreNames.contains("tracks")) {
                db.createObjectStore("tracks", {
                    keyPath: "id"
                });
            }

            if (!db.objectStoreNames.contains("playlists")) {
                db.createObjectStore("playlists", {
                    keyPath: "id"
                });
            }
        };

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

function getAllRecords(storeName) {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readonly");
        const request = transaction.objectStore(storeName).getAll();

        request.onsuccess = () => {
            resolve(request.result);
        };

        request.onerror = () => {
            reject(request.error);
        };
    });
}

function saveRecord(storeName, record) {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");

        transaction.objectStore(storeName).put(record);

        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onerror = () => {
            reject(transaction.error);
        };

        transaction.onabort = () => {
            reject(transaction.error);
        };
    });
}

function deleteRecord(storeName, id) {
    return new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, "readwrite");

        transaction.objectStore(storeName).delete(id);

        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onerror = () => {
            reject(transaction.error);
        };

        transaction.onabort = () => {
            reject(transaction.error);
        };
    });
}

function createId() {
    if (typeof crypto.randomUUID === "function") {
        return crypto.randomUUID();
    }

    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function showStatus(message) {
    const status = document.getElementById("status-message");

    status.textContent = message;
}

function formatFileSize(bytes) {
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getTrackName(track) {
    return track.name.replace(/\.[^.]+$/, "");
}

function getSelectedPlaylist() {
    return playlists.find((playlist) => {
        return playlist.id === selectedPlaylistId;
    });
}

async function loadData() {
    tracks = await getAllRecords("tracks");
    playlists = await getAllRecords("playlists");

    if (!playlists.some((playlist) => {
        return playlist.id === selectedPlaylistId;
    })) {
        selectedPlaylistId = playlists.length > 0 ? playlists[0].id : null;
    }

    renderLibrary();
    renderPlaylists();
    renderPlaylistSongs();
}

async function importTracks(files) {
    const audioFiles = Array.from(files).filter((file) => {
        return file.type.startsWith("audio/") || /\.(mp3|m4a|aac|wav|ogg|flac|opus|aiff)$/i.test(file.name);
    });

    if (audioFiles.length === 0) {
        showStatus("Select valid audio files.");
        return;
    }

    const existingFiles = new Set(
        tracks.map((track) => {
            return `${track.name}:${track.size}:${track.lastModified}`;
        })
    );

    let importedCount = 0;

    for (const file of audioFiles) {
        const signature = `${file.name}:${file.size}:${file.lastModified}`;

        if (existingFiles.has(signature)) {
            continue;
        }

        const track = {
            id: createId(),
            name: file.name,
            size: file.size,
            type: file.type || "audio/mpeg",
            lastModified: file.lastModified,
            file: file
        };

        await saveRecord("tracks", track);

        tracks.push(track);
        existingFiles.add(signature);
        importedCount += 1;
    }

    renderLibrary();

    if (importedCount === 0) {
        showStatus("Those songs are already in your library.");
    } else {
        showStatus(`Added ${importedCount} song${importedCount === 1 ? "" : "s"}.`);
    }
}

function createSongRow(track, playlistMode = false) {
    const row = document.createElement("div");
    row.className = "song-row";

    const icon = document.createElement("div");
    icon.className = "song-icon";
    icon.textContent = "♫";

    const details = document.createElement("div");
    details.className = "song-details";

    const name = document.createElement("p");
    name.className = "song-name";
    name.textContent = getTrackName(track);
    name.title = track.name;

    const meta = document.createElement("p");
    meta.className = "song-meta";
    meta.textContent = formatFileSize(track.size);

    details.append(name, meta);
    row.append(icon, details);

    const actions = document.createElement("div");
    actions.className = "song-actions";

    if (playlistMode) {
        const removeButton = document.createElement("button");
        removeButton.className = "small-button remove-button";
        removeButton.type = "button";
        removeButton.textContent = "Remove";
        removeButton.addEventListener("click", () => {
            removeTrackFromPlaylist(track.id);
        });

        actions.append(removeButton);
    } else {
        const select = document.createElement("select");
        select.setAttribute("aria-label", `Choose playlist for ${track.name}`);

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Choose playlist";
        select.append(placeholder);

        for (const playlist of playlists) {
            const option = document.createElement("option");
            option.value = playlist.id;
            option.textContent = playlist.name;
            select.append(option);
        }

        if (selectedPlaylistId) {
            select.value = selectedPlaylistId;
        }

        const addButton = document.createElement("button");
        addButton.className = "small-button";
        addButton.type = "button";
        addButton.textContent = "Add";

        addButton.addEventListener("click", async () => {
            if (!select.value) {
                showStatus("Create or select a playlist first.");
                return;
            }

            await addTrackToPlaylist(track.id, select.value);
        });

        const deleteButton = document.createElement("button");
        deleteButton.className = "small-button remove-button";
        deleteButton.type = "button";
        deleteButton.textContent = "Delete";
        deleteButton.setAttribute("aria-label", `Delete ${track.name}`);

        deleteButton.addEventListener("click", async () => {
            await deleteTrack(track.id);
        });

        actions.append(select, addButton, deleteButton);
    }

    row.append(actions);

    return row;
}

function renderLibrary() {
    const list = document.getElementById("library-list");
    const search = document.getElementById("search-songs").value.trim().toLowerCase();

    list.replaceChildren();

    const filteredTracks = tracks.filter((track) => {
        return track.name.toLowerCase().includes(search);
    });

    document.getElementById("library-count").textContent =
        `${tracks.length} song${tracks.length === 1 ? "" : "s"}`;

    if (filteredTracks.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = tracks.length === 0
            ? "Add music files to get started."
            : "No songs match your search.";

        list.append(empty);
        return;
    }

    for (const track of filteredTracks) {
        list.append(createSongRow(track));
    }
}

async function createPlaylist(name) {
    const playlist = {
        id: createId(),
        name,
        trackIds: [],
        createdAt: Date.now()
    };

    await saveRecord("playlists", playlist);

    playlists.push(playlist);
    selectedPlaylistId = playlist.id;

    renderLibrary();
    renderPlaylists();
    renderPlaylistSongs();

    showStatus(`Created playlist "${name}".`);
}

async function addTrackToPlaylist(trackId, playlistId) {
    const playlist = playlists.find((item) => {
        return item.id === playlistId;
    });

    if (!playlist) {
        showStatus("Playlist not found.");
        return;
    }

    if (playlist.trackIds.includes(trackId)) {
        selectedPlaylistId = playlistId;
        renderPlaylists();
        renderPlaylistSongs();
        showStatus("That song is already in this playlist.");
        return;
    }

    playlist.trackIds.push(trackId);

    await saveRecord("playlists", playlist);

    selectedPlaylistId = playlistId;

    renderPlaylists();
    renderPlaylistSongs();

    showStatus(`Added song to "${playlist.name}".`);
}

async function removeTrackFromPlaylist(trackId) {
    const playlist = getSelectedPlaylist();

    if (!playlist) {
        return;
    }

    playlist.trackIds = playlist.trackIds.filter((id) => {
        return id !== trackId;
    });

    await saveRecord("playlists", playlist);

    renderPlaylists();
    renderPlaylistSongs();

    showStatus("Removed song from playlist.");
}

async function deleteTrack(trackId) {
    const track = tracks.find((item) => {
        return item.id === trackId;
    });

    if (!track) {
        return;
    }

    const confirmed = window.confirm(
        `Delete "${track.name}" from your music library and all playlists?`
    );

    if (!confirmed) {
        return;
    }

    await deleteRecord("tracks", trackId);

    tracks = tracks.filter((item) => {
        return item.id !== trackId;
    });

    for (const playlist of playlists) {
        playlist.trackIds = playlist.trackIds.filter((id) => {
            return id !== trackId;
        });

        await saveRecord("playlists", playlist);
    }

    renderLibrary();
    renderPlaylists();
    renderPlaylistSongs();

    showStatus("Song deleted from your library and playlists.");
}

function renderPlaylists() {
    const list = document.getElementById("playlist-list");

    list.replaceChildren();

    if (playlists.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "No playlists yet.";
        list.append(empty);
        return;
    }

    for (const playlist of playlists) {
        const row = document.createElement("div");
        row.className = "playlist-row";

        const button = document.createElement("button");
        button.type = "button";
        button.className = "playlist-item";

        if (playlist.id === selectedPlaylistId) {
            button.classList.add("active");
        }

        const icon = document.createElement("span");
        icon.textContent = "♫";

        const name = document.createElement("span");
        name.className = "playlist-item-name";
        name.textContent = playlist.name;

        const count = document.createElement("span");
        count.className = "playlist-item-count";
        count.textContent = playlist.trackIds.length;

        button.append(icon, name, count);

        button.addEventListener("click", () => {
            selectedPlaylistId = playlist.id;
            renderPlaylists();
            renderPlaylistSongs();
        });

        const playButton = document.createElement("button");
        playButton.type = "button";
        playButton.className = "small-button playlist-play-button";
        playButton.textContent = "Play";
        playButton.setAttribute("aria-label", `Play playlist ${playlist.name}`);

        playButton.addEventListener("click", () => {
            openEarbudMenu(playlist.id);
        });

        row.append(button, playButton);
        list.append(row);
    }
}

function renderPlaylistSongs() {
    const list = document.getElementById("playlist-songs");
    const title = document.getElementById("selected-playlist-name");
    const count = document.getElementById("selected-playlist-count");
    const deleteButton = document.getElementById("delete-playlist");
    const playlist = getSelectedPlaylist();

    list.replaceChildren();

    deleteButton.disabled = !playlist;

    if (!playlist) {
        title.textContent = "Select a playlist";
        count.textContent = "Choose a playlist to view its songs.";

        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "Your playlist songs will appear here.";

        list.append(empty);
        return;
    }

    title.textContent = playlist.name;

    const playlistTracks = playlist.trackIds
        .map((id) => tracks.find((track) => track.id === id))
        .filter(Boolean);

    count.textContent =
        `${playlistTracks.length} song${playlistTracks.length === 1 ? "" : "s"}`;

    if (playlistTracks.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty-state";
        empty.textContent = "This playlist is empty. Add songs from your library.";

        list.append(empty);
        return;
    }

    for (const track of playlistTracks) {
        list.append(createSongRow(track, true));
    }
}

async function deleteSelectedPlaylist() {
    const playlist = getSelectedPlaylist();

    if (!playlist) {
        return;
    }

    const confirmed = window.confirm(
        `Delete the playlist "${playlist.name}"? Your music files will remain in the library.`
    );

    if (!confirmed) {
        return;
    }

    await deleteRecord("playlists", playlist.id);

    playlists = playlists.filter((item) => {
        return item.id !== playlist.id;
    });

    selectedPlaylistId = playlists.length > 0 ? playlists[0].id : null;

    renderLibrary();
    renderPlaylists();
    renderPlaylistSongs();

    showStatus("Playlist deleted. Your songs remain in the library.");
}

function configureEvents() {
    const transferModal = document.getElementById("transfer-modal");

    document.getElementById("open-transfer-guide").addEventListener("click", () => {
        transferModal.hidden = false;
    });

    document.getElementById("close-transfer-guide").addEventListener("click", () => {
        transferModal.hidden = true;
    });

    document.getElementById("choose-transferred-files").addEventListener("click", () => {
        transferModal.hidden = true;
        document.getElementById("music-files").click();
    });

    transferModal.addEventListener("click", (event) => {
        if (event.target === transferModal) {
            transferModal.hidden = true;
        }
    });

    document.getElementById("music-files").addEventListener("change", async (event) => {
        try {
            await importTracks(event.target.files);
        } catch (error) {
            showStatus("Unable to save songs. Check your browser storage.");
        }

        event.target.value = "";
    });

    document.getElementById("search-songs").addEventListener("input", () => {
        renderLibrary();
    });

    document.getElementById("create-playlist-form").addEventListener("submit", async (event) => {
        event.preventDefault();

        const input = document.getElementById("playlist-name");
        const name = input.value.trim();

        if (!name) {
            return;
        }

        const duplicate = playlists.some((playlist) => {
            return playlist.name.toLowerCase() === name.toLowerCase();
        });

        if (duplicate) {
            showStatus("A playlist with that name already exists.");
            return;
        }

        try {
            await createPlaylist(name);
            input.value = "";
        } catch (error) {
            showStatus("Unable to create playlist.");
        }
    });

    document.getElementById("delete-playlist").addEventListener("click", async () => {
        try {
            await deleteSelectedPlaylist();
        } catch (error) {
            showStatus("Unable to delete playlist.");
        }
    });

    document.getElementById("play-left").addEventListener("click", async () => {
    if (!pendingPlaylistId) {
        return;
    }

    try {
        await startPlaylist("left", pendingPlaylistId);
    } catch (error) {
        showStatus("Unable to start the playlist.");
    }
});

document.getElementById("play-right").addEventListener("click", async () => {
    if (!pendingPlaylistId) {
        return;
    }

    try {
        await startPlaylist("right", pendingPlaylistId);
    } catch (error) {
        showStatus("Unable to start the playlist.");
    }
});

document.getElementById("cancel-earbud").addEventListener("click", () => {
    closeEarbudMenu();
});

document.getElementById("earbud-modal").addEventListener("click", (event) => {
    if (event.target.id === "earbud-modal") {
        closeEarbudMenu();
    }
});

document.getElementById("left-play-pause").addEventListener("click", async () => {
    await togglePlayer("left");
});

document.getElementById("right-play-pause").addEventListener("click", async () => {
    await togglePlayer("right");
});

document.getElementById("left-stop").addEventListener("click", () => {
    stopPlayer("left");
});

document.getElementById("right-stop").addEventListener("click", () => {
    stopPlayer("right");
});
}

async function initializeApp() {
    configureEvents();

    try {
        database = await openDatabase();
        await loadData();
    } catch (error) {
        showStatus("Browser storage is unavailable. Try opening the site through HTTPS or localhost.");
    }
}

initializeApp();