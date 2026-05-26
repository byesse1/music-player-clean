// ========== ПЕРЕМЕННЫЕ ==========
let playlist = [];
let playlist_container = document.getElementById("playlist");
let show_btn = document.querySelector(".show_btn");
let last_btn = document.querySelector(".last_track");
let play_pause_btn = document.querySelector(".play_pause_track");
let next_btn = document.querySelector(".next_track");

let tab_btns = document.querySelectorAll(".tab-btn");
let login_form = document.getElementById("login-form");
let register_form = document.getElementById("register-form");

let currentPlaylistId = null;
let isMainPlaylist = false;
let progress_slider = null;
let current_time_display = null;
let duration_display = null;
let current_duration = 0;
let currentTrackName = "";
let trackTitleElement = null;
let profilePage = null;

let searchHistory = [];
let mainPlayerWasPlaying = false;
let searchHistoryDropdown = null;
let searchBtn = document.querySelector(".search_btn");
let searchContainer = document.getElementById("search-container");
let searchInputCentered = document.getElementById("search-input-centered");
let searchBtnCentered = document.getElementById("search-btn-centered");
let searchResultsCentered = document.getElementById("search-results-centered");
let backFromSearchBtn = document.getElementById("back-from-search-btn");
let searchStatus = document.getElementById("search-status");

let login_btn = document.getElementById("login-btn");
let login_nick = document.getElementById("login-nick");
let login_password = document.getElementById("login-password");
let login_error = document.getElementById("login-error");

let register_btn = document.getElementById("register-btn");
let register_nick = document.getElementById("register-nick");
let register_password = document.getElementById("register-password");
let register_repeate_password = document.getElementById("repeate-reg-password");
let registor_error = document.getElementById("register-error");

let logout_btn = document.getElementById("logout-btn");

let audio = new Audio();
let volume_slider = document.getElementById("volume-slider");
let volume_value = document.getElementById("volume-value");
const savedVolume = localStorage.getItem("volume");
if (savedVolume) {
    volume_slider.value = savedVolume;
    audio.volume = savedVolume / 100;
    volume_value.textContent = savedVolume + "%";
}

let is_playlist_visible = false;
let current_user = null;
let index_song = 0;
let currentTrackUrl = null;

// ========== ФУНКЦИИ ПЛЕЙЛИСТА И ВОСПРОИЗВЕДЕНИЯ ==========
function play_song(url) {
    currentTrackUrl = url;
    audio.src = url;
    audio.play();
    play_pause_btn.textContent = "⏸";
    if (playlist[index_song]) {
        currentTrackName = playlist[index_song].name;
        updateTrackTitleDisplay(currentTrackName);
        setTimeout(() => {
            loadCoverForTrack(url, index_song);
        }, 50);
    }
}

function updateTrackTitleDisplay(trackName) {
    if (!trackTitleElement) {
        trackTitleElement = document.getElementById("track-title");
    }
    if (trackTitleElement) {
        trackTitleElement.textContent = trackName || "Выберите трек";
        trackTitleElement.scrollLeft = 0;
    }
}

function highlightCurrentSongByIndex() {
    let allSongs = document.querySelectorAll(".playlist-item");
    allSongs.forEach((song, idx) => {
        if (idx === index_song) {
            song.style.fontWeight = "bold";
            song.style.background = "rgba(116, 189, 203, 0.3)";
        } else {
            song.style.fontWeight = "normal";
            song.style.background = "";
        }
    });
}

function isSongInPlaylist(songName) {
    return playlist.some(song => song.name === songName);
}

function addSongToPlaylistUI(song_name, url, songIndex) {
    let song_element = document.createElement("div");
    song_element.className = "playlist-item";

    let clean_name = song_name.replace(/\.(mp3|wav|ogg|m4a|flac|aac)$/i, '');

    let nameSpan = document.createElement("span");
    nameSpan.textContent = clean_name;
    nameSpan.style.flex = "1";
    nameSpan.style.cursor = "pointer";

    let deleteBtn = document.createElement("button");
    deleteBtn.textContent = "❌";
    deleteBtn.className = "delete-track-btn";
    deleteBtn.title = "Удалить из этого плейлиста";
    deleteBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();

        if (currentPlaylistId) {
            const currentPlaylistObj = userPlaylists.find(p => p.id === currentPlaylistId);
            const isMain = currentPlaylistObj ? currentPlaylistObj.is_main : false;

            if (isMain) {
                if (confirm(`Удалить трек "${clean_name}" полностью? Он исчезнет из всех плейлистов!`)) {
                    deleteTrack(songIndex, url);
                }
            } else {
                removeTrackFromPlaylist(currentPlaylistId, url, clean_name);
            }
        } else {
            deleteTrack(songIndex, url);
        }
    };

    song_element.appendChild(nameSpan);
    song_element.appendChild(deleteBtn);

    nameSpan.onclick = () => {
        index_song = songIndex;
        currentTrackName = clean_name;
        updateTrackTitleDisplay(clean_name);
        play_song(url);
        highlightCurrentSongByIndex();
    };

    playlist_container.appendChild(song_element);
}

// ========== API ЗАПРОСЫ ==========
async function register(nick, password) {
    const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nick, password })
    });
    return await response.json();
}

async function login(nick, password) {
    const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nick, password })
    });
    return await response.json();
}

async function savePlaylistToServer() {
    if (!current_user) return;

    const playlistData = playlist.map(song => ({
        name: song.name,
        url: song.url
    }));

    const response = await fetch('/api/save_playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            nick: current_user,
            playlist: playlistData
        })
    });
    return await response.json();
}

async function deleteTrack(trackIndex, trackUrl) {
    if (!current_user) return;
    if (!confirm(`Удалить трек "${playlist[trackIndex]?.name}" полностью? Он исчезнет из всех плейлистов!`)) return;

    try {
        const response = await fetch('/api/delete_track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nick: current_user,
                track_url: trackUrl
            })
        });

        const result = await response.json();
        if (result.ok) {
            playlist = result.playlist;
            playlist_container.innerHTML = "";
            if (playlist.length > 0) {
                playlist.forEach((song, idx) => {
                    addSongToPlaylistUI(song.name, song.url, idx);
                });
                addAddToPlaylistButtons();
                if (index_song >= playlist.length) {
                    index_song = playlist.length - 1;
                }
                if (playlist[index_song]) {
                    if (currentTrackUrl === trackUrl) {
                        play_song(playlist[index_song].url);
                    }
                } else if (playlist.length > 0) {
                    index_song = 0;
                    play_song(playlist[0].url);
                } else {
                    audio.pause();
                    audio.src = "";
                    currentTrackUrl = null;
                    play_pause_btn.textContent = "▶";
                    updateTrackTitleDisplay("Выберите трек");
                    document.querySelector('.music').src = './Image/music.png';
                }
                highlightCurrentSongByIndex();
            } else {
                audio.pause();
                audio.src = "";
                currentTrackUrl = null;
                play_pause_btn.textContent = "▶";
                updateTrackTitleDisplay("Выберите трек");
                document.querySelector('.music').src = './Image/music.png';
                index_song = 0;
            }
            await loadUserPlaylists();
            alert('✅ Трек полностью удалён');
        } else {
            alert('❌ Ошибка при удалении трека');
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при удалении трека');
    }
}

async function shufflePlaylist() {
    if (!current_user || playlist.length === 0) return;

    const response = await fetch('/api/shuffle_playlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nick: current_user })
    });

    const result = await response.json();
    if (result.ok) {
        playlist = result.playlist;
        playlist_container.innerHTML = "";
        playlist.forEach((song, idx) => {
            addSongToPlaylistUI(song.name, song.url, idx);
        });
        index_song = 0;
        if (playlist.length > 0) {
            play_song(playlist[0].url);
        }
        highlightCurrentSongByIndex();
    }
}

// ========== ПРОГРЕСС И ВРЕМЯ ==========
function formatTime(seconds) {
    if (isNaN(seconds)) return "0:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function updateProgressDisplay() {
    if (progress_slider && current_duration > 0) {
        const progress = (audio.currentTime / current_duration) * 100;
        progress_slider.value = progress;
    }
    if (current_time_display) {
        current_time_display.textContent = formatTime(audio.currentTime);
    }
}

function initProgressControls() {
    const controlsWrapper = document.querySelector('.controls-wrapper');
    if (!controlsWrapper) return;

    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-container';
    progressContainer.innerHTML = `
        <div class="time-display">
            <span id="current-time">0:00</span>
            <span id="duration-time">0:00</span>
        </div>
        <input type="range" id="progress-slider" min="0" max="100" value="0">
    `;

    const volumeControl = document.querySelector('.volume-control');
    if (volumeControl) {
        controlsWrapper.insertBefore(progressContainer, volumeControl);
    } else {
        controlsWrapper.appendChild(progressContainer);
    }

    progress_slider = document.getElementById('progress-slider');
    current_time_display = document.getElementById('current-time');
    duration_display = document.getElementById('duration-time');

    if (progress_slider) {
        progress_slider.oninput = (e) => {
            if (current_duration > 0) {
                const seekTime = (e.target.value / 100) * current_duration;
                audio.currentTime = seekTime;
                updateProgressDisplay();
            }
        };
    }

    audio.ontimeupdate = updateProgressDisplay;

    audio.onloadedmetadata = () => {
        current_duration = audio.duration;
        if (duration_display) {
            duration_display.textContent = formatTime(current_duration);
        }
        if (progress_slider) {
            progress_slider.max = 100;
        }
        updateProgressDisplay();
    };
}

function showPlayer(nick, saved_playlist) {
    current_user = nick;

    document.getElementById("auth-container").style.display = "none";
    document.getElementById("player-container").style.display = "block";

    let userSpan = document.getElementById("user-nick");
    if (userSpan) {
        userSpan.textContent = nick;
        userSpan.onclick = () => {
            showUserProfile();
        };
    }
    playlist = [];
    playlist_container.innerHTML = "";
    if (saved_playlist && saved_playlist.length > 0) {
        saved_playlist.forEach((song, idx) => {
            let cleanSongName = song.name.replace(/\.(mp3|wav|ogg|m4a|flac|aac)$/i, '');
            playlist.push({ name: cleanSongName, url: song.url });
            addSongToPlaylistUI(cleanSongName, song.url, idx);
        });
    }

    if (!document.getElementById('shuffle-btn')) {
        const showBtn = document.querySelector('.show_btn');
        if (showBtn && showBtn.parentElement) {
            const shuffleBtn = document.createElement('button');
            shuffleBtn.id = 'shuffle-btn';
            shuffleBtn.textContent = '🔀 Перемешать';
            shuffleBtn.style.background = 'rgba(255, 255, 255, 0.1)';
            shuffleBtn.style.border = '1px solid rgba(255, 255, 255, 0.2)';
            shuffleBtn.style.borderRadius = '40px';
            shuffleBtn.style.padding = '6px 16px';
            shuffleBtn.style.color = 'white';
            shuffleBtn.style.fontWeight = '600';
            shuffleBtn.style.fontSize = '13px';
            shuffleBtn.style.cursor = 'pointer';
            shuffleBtn.onclick = shufflePlaylist;
            showBtn.parentElement.appendChild(shuffleBtn);
        }
    }

    index_song = 0;
}

// ========== ОБРАБОТЧИКИ СОБЫТИЙ ==========
window.addEventListener('DOMContentLoaded', () => {
    const savedNick = localStorage.getItem('saved_nick');
    const savedPassword = localStorage.getItem('saved_password');
    if (savedNick && savedPassword) {
        document.getElementById('login-nick').value = savedNick;
        document.getElementById('login-password').value = savedPassword;
        document.getElementById('remember-me').checked = true;
    }
    initProgressControls();
});

show_btn.onclick = () => {
    if (is_playlist_visible) {
        playlist_container.style.display = "none";
        is_playlist_visible = false;
    } else {
        playlist_container.style.display = "block";
        is_playlist_visible = true;
    }
};

last_btn.onclick = () => {
    if (playlist.length > 0) {
        index_song = (index_song - 1 + playlist.length) % playlist.length;
        play_song(playlist[index_song].url);
        highlightCurrentSongByIndex();
    }
};

play_pause_btn.onclick = () => {
    if (playlist.length === 0) return;
    let current_file = playlist[index_song];
    if (audio.paused && currentTrackUrl === current_file.url) {
        audio.play();
        play_pause_btn.textContent = "⏸";
    } else if (!audio.paused && currentTrackUrl === current_file.url) {
        audio.pause();
        play_pause_btn.textContent = "▶";
    } else {
        play_song(current_file.url);
    }
    mainPlayerWasPlaying = false;
};

next_btn.onclick = () => {
    if (playlist.length > 0) {
        index_song = (index_song + 1) % playlist.length;
        play_song(playlist[index_song].url);
        highlightCurrentSongByIndex();
    }
};

const shuffleBtnBottom = document.getElementById('shuffle-btn-bottom');
const coverBtnBottom = document.getElementById('cover-btn-bottom');
if (coverBtnBottom) {
    coverBtnBottom.onclick = changeTrackCover;
}
if (shuffleBtnBottom) {
    shuffleBtnBottom.onclick = async () => {
        if (!current_user || playlist.length === 0) return;

        shuffleBtnBottom.classList.add('active');

        const response = await fetch('/api/shuffle_playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nick: current_user })
        });

        const result = await response.json();
        if (result.ok) {
            playlist = result.playlist;
            playlist_container.innerHTML = "";
            playlist.forEach((song, idx) => {
                addSongToPlaylistUI(song.name, song.url, idx);
            });
            index_song = 0;
            if (playlist.length > 0) {
                play_song(playlist[0].url);
            }
            highlightCurrentSongByIndex();
        }

        setTimeout(() => {
            shuffleBtnBottom.classList.remove('active');
        }, 300);
    };
}

audio.onended = () => {
    play_pause_btn.textContent = "▶";
    if (playlist.length > 0) {
        index_song = (index_song + 1) % playlist.length;
        play_song(playlist[index_song].url);
        highlightCurrentSongByIndex();
    }
};

tab_btns.forEach(btn => {
    btn.onclick = () => {
        tab_btns.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        let tab = btn.dataset.tab;
        if (tab == "login") {
            login_form.classList.add("active");
            register_form.classList.remove("active");
        } else {
            register_form.classList.add("active");
            login_form.classList.remove("active");
        }
    };
});

login_btn.onclick = async () => {
    let nick = login_nick.value.trim();
    let password = login_password.value;
    let rememberMe = document.getElementById('remember-me')?.checked || false;

    if (!nick) {
        login_error.textContent = "Введите имя";
        return;
    }
    if (!password) {
        login_error.textContent = "Введите пароль";
        return;
    }

    let result = await login(nick, password);
    if (result.ok) {
        if (rememberMe) {
            localStorage.setItem('saved_nick', nick);
            localStorage.setItem('saved_password', password);
        } else {
            localStorage.removeItem('saved_nick');
            localStorage.removeItem('saved_password');
        }
        showPlayer(nick, result.playlist);
    } else {
        login_error.textContent = result.error || "Ошибка входа";
    }
};

register_btn.onclick = async () => {
    let nick = register_nick.value.trim();
    let password = register_password.value;
    let rep_password = register_repeate_password.value;

    if (!nick || !password) {
        registor_error.textContent = "Заполните все поля";
        return;
    }
    if (password != rep_password) {
        registor_error.textContent = "Пароли не совпадают";
        return;
    }
    if (password.length < 3) {
        registor_error.textContent = "Пароль должен содержать минимум 3 символа";
        return;
    }

    let result = await register(nick, password);
    if (result.ok) {
        let login_result = await login(nick, password);
        if (login_result.ok) {
            showPlayer(nick, login_result.playlist);
        }
    } else {
        registor_error.textContent = result.error || "Ошибка регистрации";
    }
};

logout_btn.onclick = () => {
    current_user = null;
    playlist = [];
    playlist_container.innerHTML = "";
    document.getElementById("player-container").style.display = "none";
    document.getElementById("auth-container").style.display = "flex";
    audio.pause();
    audio.src = "";
};

volume_slider.oninput = () => {
    let vol = volume_slider.value / 100;
    audio.volume = vol;
    volume_value.textContent = volume_slider.value + "%";
    localStorage.setItem("volume", volume_slider.value);
};

// ========== ПОИСК ==========
if (searchBtn) {
    searchBtn.onclick = () => {
        searchContainer.style.display = "flex";
        searchInputCentered.value = "";
        searchResultsCentered.innerHTML = "";
        searchStatus.textContent = "";
        searchInputCentered.focus();
    };
}

if (searchInputCentered) {
    searchInputCentered.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearchCentered();
        }
    });
}

if (searchBtnCentered) {
    searchBtnCentered.onclick = performSearchCentered;
}

if (backFromSearchBtn) {
    backFromSearchBtn.onclick = () => {
        searchContainer.style.display = "none";
        if (mainPlayerWasPlaying && playlist.length > 0) {
            audio.play();
            play_pause_btn.textContent = "⏸";
            mainPlayerWasPlaying = false;
        }
    };
}

async function performSearchCentered() {
    const query = searchInputCentered.value.trim();
    if (!query) {
        searchStatus.textContent = "Введите поисковый запрос";
        return;
    }
    if (!current_user) {
        searchStatus.textContent = "Необходимо авторизоваться";
        return;
    }

    searchResultsCentered.innerHTML = '<div class="loading-spinner">🔍 Поиск треков...</div>';
    searchStatus.textContent = "";

    try {
        const response = await fetch('/api/search_tracks', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query })
        });
        const result = await response.json();

        if (result.ok && result.results) {
            displaySearchResultsCentered(result.results);
        } else {
            searchResultsCentered.innerHTML = `<div class="search-error">${result.error || "Ничего не найдено"}</div>`;
        }
    } catch (error) {
        console.error("Ошибка поиска:", error);
        searchResultsCentered.innerHTML = '<div class="search-error">Ошибка соединения с сервером</div>';
    }
}

function displaySearchResultsCentered(results) {
    if (!results || results.length === 0) {
        searchResultsCentered.innerHTML = '<div class="no-results">🔍 Ничего не найдено</div>';
        return;
    }

    searchResultsCentered.innerHTML = '';
    results.forEach(track => {
        const item = document.createElement('div');
        item.className = 'search-result-item-centered';

        const info = document.createElement('div');
        info.className = 'search-result-info-centered';
        info.innerHTML = `
            <div class="search-result-title-centered">${escapeHtml(track.name)}</div>
            <div class="search-result-artist-centered">${escapeHtml(track.artist || 'Неизвестный исполнитель')}</div>
        `;

        const actions = document.createElement('div');
        actions.className = 'search-result-actions-centered';

        const addBtn = document.createElement('button');
        addBtn.textContent = '➕';
        addBtn.title = 'Добавить в плейлист';
        addBtn.onclick = (e) => {
            e.stopPropagation();
            addTrackFromSearchCentered(track);
        };

        actions.appendChild(addBtn);
        item.appendChild(info);
        item.appendChild(actions);
        searchResultsCentered.appendChild(item);
    });
}

async function addTrackFromSearchCentered(track) {
    if (!current_user) return;

    searchStatus.textContent = "⏳ Загрузка трека...";

    try {
        const response = await fetch('/api/download_track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track: track, nick: current_user })
        });
        const result = await response.json();

        if (result.ok) {
            const newIndex = playlist.length;
            let cleanName = result.original_name.replace(/\.(mp3|wav|ogg|m4a|flac|aac)$/i, '');

            playlist.push({
                name: result.original_name,
                url: result.url
            });

            addSongToPlaylistUI(result.original_name, result.url, newIndex);
            await savePlaylistToServer();

            searchStatus.textContent = `✅ "${track.name}" добавлен!`;

            if (playlist.length === 1) {
                index_song = 0;
                currentTrackName = cleanName;
                updateTrackTitleDisplay(cleanName);
            }

            setTimeout(() => {
                searchContainer.style.display = "none";
                searchStatus.textContent = "";
            }, 1000);
        } else {
            searchStatus.textContent = result.error || "Ошибка загрузки";
        }
    } catch (error) {
        console.error("Ошибка:", error);
        searchStatus.textContent = "Ошибка соединения";
    }
}

// ========== АУДИОРЕДАКТОР ==========
const editorBtn = document.querySelector(".editor_btn");
const editorMenu = document.getElementById("editor-menu");
const editorContainer = document.getElementById("editor-container");
const backToPlayerBtn = document.getElementById("back-to-player-btn");
const processBtn = document.getElementById("process-btn");
const editorFileInput = document.getElementById("editor-file-input");
const bassControl = document.getElementById("bass-control");
const bassLevel = document.getElementById("bass-level");
const bassValue = document.getElementById("bass-value");
const speedControl = document.getElementById("speed-control");
const speedLevel = document.getElementById("speed-level");
const speedValue = document.getElementById("speed-value");
const editorStatus = document.getElementById("editor-status");

let selectedEffect = null;
let selectedFile = null;

if (editorBtn) {
    editorBtn.onclick = (e) => {
        e.stopPropagation();
        editorMenu.classList.toggle("show");
    };
}

document.addEventListener("click", () => {
    if (editorMenu) editorMenu.classList.remove("show");
});

document.querySelectorAll(".editor-option").forEach(option => {
    option.onclick = (e) => {
        e.stopPropagation();
        selectedEffect = option.dataset.effect;
        editorMenu.classList.remove("show");

        const editorTitleH2 = document.querySelector('#editor-container .editor-card h2');

        if (selectedEffect === "equalizer") {
            if (bassControl) bassControl.style.display = "block";
            if (speedControl) speedControl.style.display = "block";
            if (editorTitleH2) editorTitleH2.textContent = "🎛️ Эквалайзер";

            if (bassLevel) bassLevel.value = 5;
            if (bassValue) {
                bassValue.textContent = "0 дБ";
                bassValue.style.color = "white";
            }
            if (speedLevel) speedLevel.value = 1.0;
            if (speedValue) {
                speedValue.textContent = "1.00x";
                speedValue.style.color = "white";
            }
        } else if (selectedEffect === "remove_vocals") {
            if (bassControl) bassControl.style.display = "none";
            if (speedControl) speedControl.style.display = "none";
            if (editorTitleH2) editorTitleH2.textContent = "🗑️ Удаление вокала";
        }

        editorContainer.style.display = "flex";
        if (editorStatus) editorStatus.textContent = "";
        if (processBtn) processBtn.disabled = true;
    };
});

if (editorFileInput) {
    editorFileInput.onchange = (e) => {
        selectedFile = e.target.files[0];
        if (processBtn) processBtn.disabled = !selectedFile;
    };
}

if (bassLevel && bassValue) {
    bassLevel.oninput = () => {
        const actualBoost = parseInt(bassLevel.value) - 5;
        if (actualBoost >= 0) {
            bassValue.textContent = `+${actualBoost} дБ`;
            bassValue.style.color = "#4CAF50";
        } else {
            bassValue.textContent = `${actualBoost} дБ`;
            bassValue.style.color = "#ff9800";
        }
    };
}

if (speedLevel && speedValue) {
    speedLevel.oninput = () => {
        const speed = parseFloat(speedLevel.value);
        speedValue.textContent = speed.toFixed(2) + "x";
        if (speed > 1.0) {
            speedValue.style.color = "#4CAF50";
        } else if (speed < 1.0) {
            speedValue.style.color = "#ff9800";
        } else {
            speedValue.style.color = "white";
        }
    };
}

if (processBtn) {
    processBtn.onclick = async () => {
        if (!selectedFile || !selectedEffect) return;

        processBtn.disabled = true;
        if (editorStatus) editorStatus.textContent = "⏳ Обработка...";

        const formData = new FormData();
        formData.append("audio", selectedFile);

        let apiUrl = "/api/process_audio";

        if (selectedEffect === "remove_vocals") {
            formData.append("effect", "remove_vocals");
            formData.append("bass_level", 5);
        } else if (selectedEffect === "equalizer") {
            apiUrl = "/api/process_equalizer";
            const bassLevelVal = document.getElementById('bass-level');
            const speedLevelVal = document.getElementById('speed-level');
            formData.append("bass_level", bassLevelVal ? bassLevelVal.value : 5);
            formData.append("speed_level", speedLevelVal ? speedLevelVal.value : 1.0);
        }

        try {
            const response = await fetch(apiUrl, {
                method: "POST",
                body: formData
            });

            if (response.ok) {
                const blob = await response.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;

                let filename = selectedFile.name;
                const nameWithoutExt = filename.replace(/\.(mp3|wav|ogg|m4a)$/i, '');
                const ext = filename.match(/\.(mp3|wav|ogg|m4a)$/i)?.[0] || '.mp3';

                if (selectedEffect === 'remove_vocals') {
                    filename = `${nameWithoutExt}_no_voice${ext}`;
                } else if (selectedEffect === 'equalizer') {
                    const bass = document.getElementById('bass-level')?.value || 5;
                    const speed = document.getElementById('speed-level')?.value || 1.0;
                    filename = `${nameWithoutExt}_eq_bass${bass}_speed${speed}${ext}`;
                }

                a.download = filename;
                a.click();
                URL.revokeObjectURL(url);
                if (editorStatus) editorStatus.textContent = "✅ Готово! Файл скачан.";
            } else {
                const error = await response.json();
                if (editorStatus) editorStatus.textContent = "❌ Ошибка: " + (error.error || "Неизвестная ошибка");
            }
        } catch (err) {
            console.error("Ошибка:", err);
            if (editorStatus) editorStatus.textContent = "❌ Ошибка соединения с сервером";
        }

        if (processBtn) processBtn.disabled = false;
    };
}

if (backToPlayerBtn) {
    backToPlayerBtn.onclick = () => {
        if (editorContainer) editorContainer.style.display = "none";
        if (editorFileInput) editorFileInput.value = "";
        selectedFile = null;
        selectedEffect = null;
        if (processBtn) processBtn.disabled = true;
        if (editorStatus) editorStatus.textContent = "";
        if (bassControl) bassControl.style.display = "none";
        if (speedControl) speedControl.style.display = "none";
    };
}

// ========== ПРОФИЛЬ ==========
async function showUserProfile() {
    if (!current_user) return;

    const response = await fetch('/api/user_profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nick: current_user })
    });

    const result = await response.json();

    if (result.ok) {
        showProfilePage(result);
    }
}

function showProfilePage(userData) {
    const oldProfile = document.getElementById('profile-page');
    if (oldProfile) oldProfile.remove();

    const savedAvatar = localStorage.getItem(`avatar_${current_user}`);
    const avatarUrl = savedAvatar || getDefaultAvatar(userData.nick);

    const profileHTML = `
        <div id="profile-page">
            <div class="profile-card">
                <div class="avatar-container" id="avatar-click-area">
                    <img id="profile-avatar" src="${avatarUrl}" alt="avatar">
                    <div class="avatar-edit-icon">📷</div>
                </div>
                <input type="file" id="avatar-input" accept="image/*" style="display: none;">

                <h3 id="profile-nick-display">${escapeHtml(userData.nick)}</h3>

                <div class="profile-field">
                    <label>Изменить имя</label>
                    <input type="text" id="edit-nick-input" placeholder="Новое имя" value="${escapeHtml(userData.nick)}">
                </div>

                <div class="profile-stats">
                    <div>
                        <div class="stat-value">${userData.track_count || 0}</div>
                        <div class="stat-label">Треков</div>
                    </div>
                    <div>
                        <div class="stat-value">${getUserLevel(userData.track_count || 0)}</div>
                        <div class="stat-label">Уровень</div>
                    </div>
                    <div>
                        <div class="stat-value">${new Date().getFullYear()}</div>
                        <div class="stat-label">Год</div>
                    </div>
                </div>

                <div class="profile-buttons">
                    <button id="save-profile-btn">💾 Сохранить</button>
                    <button id="close-profile-btn">✕ Закрыть</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', profileHTML);
    profilePage = document.getElementById('profile-page');

    const avatarArea = document.getElementById('avatar-click-area');
    const avatarInput = document.getElementById('avatar-input');
    const saveBtn = document.getElementById('save-profile-btn');
    const closeBtn = document.getElementById('close-profile-btn');
    const nickInput = document.getElementById('edit-nick-input');
    const profileNickDisplay = document.getElementById('profile-nick-display');

    if (avatarArea) avatarArea.onclick = () => avatarInput.click();

    if (avatarInput) {
        avatarInput.onchange = async (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                if (file.size > 2 * 1024 * 1024) {
                    alert('Аватарка не должна превышать 2MB');
                    return;
                }
                const reader = new FileReader();
                reader.onload = (event) => {
                    document.getElementById('profile-avatar').src = event.target.result;
                    localStorage.setItem(`avatar_${current_user}`, event.target.result);
                    alert('Аватарка обновлена!');
                };
                reader.readAsDataURL(file);
            }
        };
    }

    if (saveBtn) {
        saveBtn.onclick = async () => {
            const newNick = nickInput.value.trim();
            if (newNick && newNick !== current_user) {
                const checkResponse = await fetch('/api/check_nick', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ nick: newNick })
                });
                const checkResult = await checkResponse.json();
                if (checkResult.exists) {
                    alert('Имя уже занято');
                    return;
                }
                const updateResponse = await fetch('/api/update_nick', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ old_nick: current_user, new_nick: newNick })
                });
                if (updateResponse.ok) {
                    current_user = newNick;
                    document.getElementById('user-nick').textContent = newNick;
                    if (profileNickDisplay) profileNickDisplay.textContent = newNick;
                    alert('Имя изменено!');
                }
            }
            closeProfilePage();
        };
    }

    if (closeBtn) closeBtn.onclick = closeProfilePage;
    if (profilePage) {
        profilePage.onclick = (e) => {
            if (e.target === profilePage) closeProfilePage();
        };
    }
}

function closeProfilePage() {
    if (profilePage) profilePage.remove();
    profilePage = null;
}

function getDefaultAvatar(nick) {
    const canvas = document.createElement('canvas');
    canvas.width = 120;
    canvas.height = 120;
    const ctx = canvas.getContext('2d');

    const colors = ['#74bdcb', '#e6ad9b', '#9b59b6', '#3498db', '#e67e22', '#2ecc71'];
    const colorIndex = (nick.length * 7) % colors.length;
    ctx.fillStyle = colors[colorIndex];
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = 'white';
    ctx.font = 'bold 48px Manrope, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const initial = nick.charAt(0).toUpperCase();
    ctx.fillText(initial, canvas.width/2, canvas.height/2);

    return canvas.toDataURL();
}

function getUserLevel(trackCount) {
    if (trackCount < 5) return 'Новичок';
    if (trackCount < 15) return 'Любитель';
    if (trackCount < 30) return 'Знаток';
    return 'Меломан';
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

trackTitleElement = document.getElementById("track-title");
if (!trackTitleElement) {
    const playerCard = document.querySelector('.player-card');
    if (playerCard && !document.querySelector('.track-title-container')) {
        const container = document.createElement('div');
        container.className = 'track-title-container';
        container.innerHTML = '<div class="track-title" id="track-title">Выберите трек</div>';
        playerCard.appendChild(container);
        trackTitleElement = document.getElementById("track-title");
    }
}

const profileBtn = document.getElementById("profile-btn");
if (profileBtn) {
    profileBtn.onclick = showUserProfile;
}

// ========== ОБЛОЖКИ ТРЕКОВ (ОБЛАКО) ==========
async function changeTrackCover() {
    if (!current_user || playlist.length === 0) {
        alert("Нет активного трека! Сначала добавьте музыку.");
        return;
    }

    const currentTrack = playlist[index_song];
    if (!currentTrack) {
        alert("Трек не найден");
        return;
    }

    const coverInput = document.createElement('input');
    coverInput.type = 'file';
    coverInput.accept = 'image/jpeg, image/png, image/jpg, image/webp';

    coverInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 5 * 1024 * 1024) {
            alert('Файл слишком большой! Максимум 5MB');
            return;
        }

        if (!file.type.startsWith('image/')) {
            alert('Пожалуйста, выберите изображение');
            return;
        }

        const reader = new FileReader();
        reader.onload = async (event) => {
            const imageUrl = event.target.result;
            await saveCoverForTrack(currentTrack.url, imageUrl);
        };
        reader.readAsDataURL(file);
    };

    coverInput.click();
}

async function saveCoverForTrack(trackUrl, coverData) {
    try {
        const response = await fetch('/api/save_track_cover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                track_url: trackUrl,
                cover_data: coverData
            })
        });

        const result = await response.json();

        if (result.ok) {
            const trackIndex = playlist.findIndex(t => t.url === trackUrl);
            if (trackIndex !== -1) {
                playlist[trackIndex].cover = result.cover_url;
            }

            if (currentTrackUrl === trackUrl) {
                const musicCover = document.querySelector('.music');
                if (musicCover) {
                    musicCover.src = result.cover_url;
                }
            }

            alert('✅ Обложка сохранена!');
        } else {
            alert('Ошибка сохранения обложки: ' + (result.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при сохранении обложки');
    }
}

async function loadCoverForTrack(trackUrl, trackIndex) {
    const musicCover = document.querySelector('.music');
    if (!musicCover) return;

    if (playlist[trackIndex] && playlist[trackIndex].cover) {
        musicCover.src = playlist[trackIndex].cover;
        return;
    }

    try {
        const response = await fetch('/api/get_track_cover', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ track_url: trackUrl })
        });

        const result = await response.json();

        if (result.ok && result.cover_url) {
            if (playlist[trackIndex]) {
                playlist[trackIndex].cover = result.cover_url;
            }
            musicCover.src = result.cover_url;
            return;
        }
    } catch (e) {
        console.error('Ошибка загрузки обложки:', e);
    }

    musicCover.src = './Image/music.png';
}

const changeCoverBtn = document.getElementById('change-cover-btn');
if (changeCoverBtn) {
    changeCoverBtn.onclick = changeTrackCover;
}

const shuffleBtn = document.getElementById('shuffle-btn');
if (shuffleBtn) {
    shuffleBtn.onclick = shufflePlaylist;
}

// ========== ПЕРЕМЕННЫЕ ДЛЯ ПЛЕЙЛИСТОВ ==========
let userPlaylists = [];
let currentTrackForAdding = null;

// ========== ФУНКЦИИ ПЛЕЙЛИСТОВ ==========
async function loadUserPlaylists() {
    if (!current_user) return;

    try {
        const response = await fetch('/api/playlists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ nick: current_user })
        });
        const result = await response.json();
        if (result.ok) {
            userPlaylists = result.playlists;
            displayPlaylistsList();
        }
    } catch (error) {
        console.error('Ошибка загрузки плейлистов:', error);
    }
}

function displayPlaylistsList() {
    const container = document.getElementById('playlists-list');
    if (!container) return;

    const sortedPlaylists = [...userPlaylists].sort((a, b) => {
        if (a.is_main) return -1;
        if (b.is_main) return 1;
        return 0;
    });

    if (sortedPlaylists.length === 0) {
        container.innerHTML = '<div class="empty-message" style="color: rgba(255,255,255,0.5); text-align: center; padding: 20px;">У вас пока нет плейлистов</div>';
        return;
    }

    container.innerHTML = '';
    sortedPlaylists.forEach(playlist => {
        const playlistCard = document.createElement('div');
        playlistCard.className = 'playlist-item-card';

        if (playlist.is_main) {
            playlistCard.style.border = '2px solid rgba(116, 189, 203, 0.8)';
            playlistCard.style.background = 'rgba(116, 189, 203, 0.15)';
            playlistCard.style.boxShadow = '0 0 10px rgba(116, 189, 203, 0.3)';
        }

        if (playlist.id === currentPlaylistId) {
            playlistCard.style.outline = '2px solid rgba(230, 173, 155, 0.9)';
            playlistCard.style.outlineOffset = '1px';
        }

        playlistCard.innerHTML = `
            <img class="playlist-cover-small" src="${playlist.cover_art || './Image/music.png'}" alt="cover">
            <div class="playlist-info">
                <div class="playlist-name">${escapeHtml(playlist.name)} ${playlist.is_main ? '⭐' : ''}</div>
                <div class="playlist-stats">${playlist.track_count} треков / ${playlist.like_count || 0} лайков</div>
            </div>
            <div class="playlist-actions">
                <button class="play-playlist" data-id="${playlist.id}" title="Воспроизвести">▶</button>
                ${!playlist.is_main ? '<button class="delete-playlist" data-id="' + playlist.id + '" title="Удалить плейлист">🗑️</button>' : ''}
            </div>
        `;

        playlistCard.querySelector('.play-playlist').onclick = (e) => {
            e.stopPropagation();
            playPlaylist(playlist.id);
        };

        if (!playlist.is_main) {
            playlistCard.querySelector('.delete-playlist').onclick = (e) => {
                e.stopPropagation();
                deletePlaylist(playlist.id);
            };
        }

        container.appendChild(playlistCard);
    });
}

async function loadPlaylistTracks(playlistId) {
    if (!current_user) return;

    try {
        const response = await fetch('/api/play_playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nick: current_user,
                playlist_id: playlistId
            })
        });
        const result = await response.json();

        if (result.ok && result.tracks && result.tracks.length > 0) {
            playlist_container.innerHTML = "";
            playlist.length = 0;

            result.tracks.forEach(track => {
                playlist.push(track);
            });

            playlist.forEach((song, idx) => {
                addSongToPlaylistUI(song.name, song.url, idx);
            });

            addAddToPlaylistButtons();

            if (index_song >= playlist.length) {
                index_song = playlist.length - 1;
            }
            highlightCurrentSongByIndex();
        }
    } catch (error) {
        console.error('Ошибка загрузки треков плейлиста:', error);
    }
}

async function removeTrackFromPlaylist(playlistId, trackUrl, trackName) {
    if (!confirm(`Удалить трек "${trackName}" из этого плейлиста?`)) return;

    try {
        const response = await fetch('/api/remove_from_playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nick: current_user,
                playlist_id: playlistId,
                track_url: trackUrl
            })
        });
        const result = await response.json();

        if (result.ok) {
            alert(`✅ Трек удален из плейлиста`);
            await loadUserPlaylists();
            if (currentPlaylistId === playlistId) {
                await loadPlaylistTracks(playlistId);
            }
        } else {
            alert('❌ Ошибка при удалении трека: ' + (result.error || 'Неизвестная ошибка'));
        }
    } catch (error) {
        console.error('Ошибка:', error);
        alert('Ошибка при удалении трека');
    }
}

async function createPlaylist(name, description, coverData) {
    if (!current_user) return false;

    try {
        const response = await fetch('/api/create_playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nick: current_user,
                name: name,
                description: description,
                cover_data: coverData
            })
        });
        const result = await response.json();
        if (result.ok) {
            await loadUserPlaylists();
            return true;
        }
        return false;
    } catch (error) {
        console.error('Ошибка создания плейлиста:', error);
        return false;
    }
}

async function addToPlaylist(playlistId, trackUrl) {
    if (!current_user) return false;

    try {
        const response = await fetch('/api/add_to_playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nick: current_user,
                playlist_id: playlistId,
                track_url: trackUrl
            })
        });
        const result = await response.json();
        return result.ok;
    } catch (error) {
        console.error('Ошибка добавления в плейлист:', error);
        return false;
    }
}

async function playPlaylist(playlistId) {
    if (!current_user) return;

    currentPlaylistId = playlistId;

    const selectedPlaylist = userPlaylists.find(p => p.id === playlistId);
    isMainPlaylist = selectedPlaylist ? selectedPlaylist.is_main : false;

    try {
        const response = await fetch('/api/play_playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nick: current_user,
                playlist_id: playlistId
            })
        });
        const result = await response.json();

        if (result.ok && result.tracks && result.tracks.length > 0) {
            playlist_container.innerHTML = "";
            playlist.length = 0;

            const newPlaylist = result.tracks;
            newPlaylist.forEach(track => {
                playlist.push(track);
            });

            playlist.forEach((song, idx) => {
                addSongToPlaylistUI(song.name, song.url, idx);
            });

            addAddToPlaylistButtons();

            index_song = 0;
            if (playlist[0]) {
                play_song(playlist[0].url);
            }
            highlightCurrentSongByIndex();
            await savePlaylistToServer();
            closePlaylistsModal();
        }
    } catch (error) {
        console.error('Ошибка воспроизведения плейлиста:', error);
        alert('Ошибка при воспроизведении плейлиста');
    }
}

async function deletePlaylist(playlistId) {
    if (!confirm('Удалить этот плейлист?')) return;

    try {
        const response = await fetch('/api/delete_playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nick: current_user,
                playlist_id: playlistId
            })
        });
        const result = await response.json();
        if (result.ok) {
            await loadUserPlaylists();
        }
    } catch (error) {
        console.error('Ошибка удаления плейлиста:', error);
    }
}

function showAddToPlaylistModal(trackUrl, trackName) {
    currentTrackForAdding = trackUrl;
    document.getElementById('add-track-name').textContent = `Добавить: ${trackName}`;

    const container = document.getElementById('playlists-for-add');
    container.innerHTML = '';

    if (userPlaylists.length === 0) {
        container.innerHTML = '<div style="color: rgba(255,255,255,0.5); text-align: center; padding: 20px;">У вас нет плейлистов. Сначала создайте плейлист!</div>';
    } else {
        userPlaylists.forEach(playlist => {
            const item = document.createElement('div');
            item.className = 'playlist-small-item';
            item.innerHTML = `
                <img class="playlist-small-cover" src="${playlist.cover_art || './Image/music.png'}" alt="cover">
                <span class="playlist-small-name">${escapeHtml(playlist.name)}</span>
                <span class="playlist-small-count" style="color: rgba(255,255,255,0.5);">(${playlist.track_count})</span>
            `;
            item.onclick = async () => {
                const success = await addToPlaylist(playlist.id, trackUrl);
                if (success) {
                    alert(`✅ Трек добавлен в "${playlist.name}"`);
                    closeAddToPlaylistModal();
                    await loadUserPlaylists();
                } else {
                    alert('❌ Ошибка добавления или трек уже в плейлисте');
                }
            };
            container.appendChild(item);
        });
    }

    document.getElementById('add-to-playlist-modal').style.display = 'flex';
}

function addAddToPlaylistButtons() {
    const playlistItems = document.querySelectorAll('.playlist-item');
    playlistItems.forEach((item, idx) => {
        if (!item.querySelector('.add-to-playlist-btn')) {
            const trackUrl = playlist[idx]?.url;
            const trackName = playlist[idx]?.name;
            if (trackUrl && trackName) {
                const addBtn = document.createElement('button');
                addBtn.textContent = '📁';
                addBtn.className = 'add-to-playlist-btn';
                addBtn.title = 'Добавить в плейлист';
                addBtn.style.background = 'none';
                addBtn.style.border = 'none';
                addBtn.style.cursor = 'pointer';
                addBtn.style.fontSize = '14px';
                addBtn.style.marginLeft = '8px';
                addBtn.style.opacity = '0.7';
                addBtn.onclick = (e) => {
                    e.stopPropagation();
                    showAddToPlaylistModal(trackUrl, trackName);
                };
                item.appendChild(addBtn);
            }
        }
    });
}

// ========== МОДАЛЬНЫЕ ОКНА ==========
function showPlaylistsModal() {
    document.getElementById('playlists-modal').style.display = 'flex';
    loadUserPlaylists();
}

function closePlaylistsModal() {
    document.getElementById('playlists-modal').style.display = 'none';
}

function showCreatePlaylistModal() {
    document.getElementById('create-playlist-modal').style.display = 'flex';
}

function closeCreatePlaylistModal() {
    document.getElementById('create-playlist-modal').style.display = 'none';
    document.getElementById('playlist-name').value = '';
    document.getElementById('playlist-description').value = '';
    document.getElementById('playlist-cover-preview').src = './Image/music.png';
}

function closeAddToPlaylistModal() {
    document.getElementById('add-to-playlist-modal').style.display = 'none';
    currentTrackForAdding = null;
}

// ========== ИНИЦИАЛИЗАЦИЯ ПЛЕЙЛИСТОВ ==========
function initPlaylistsUI() {
    const playlistsBtn = document.getElementById('playlists-btn');
    if (playlistsBtn) {
        playlistsBtn.onclick = showPlaylistsModal;
    }

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.modal').forEach(modal => {
                modal.style.display = 'none';
            });
        };
    });

    const createPlaylistBtn = document.getElementById('create-playlist-btn');
    if (createPlaylistBtn) {
        createPlaylistBtn.onclick = showCreatePlaylistModal;
    }

    const savePlaylistBtn = document.getElementById('save-playlist-btn');
    if (savePlaylistBtn) {
        savePlaylistBtn.onclick = async () => {
            const name = document.getElementById('playlist-name').value.trim();
            if (!name) {
                alert('Введите название плейлиста');
                return;
            }

            let coverData = null;
            const coverImg = document.getElementById('playlist-cover-preview');
            if (coverImg.src && !coverImg.src.includes('music.png')) {
                coverData = coverImg.src;
            }

            const success = await createPlaylist(name, document.getElementById('playlist-description').value, coverData);
            if (success) {
                closeCreatePlaylistModal();
                alert('✅ Плейлист создан!');
            } else {
                alert('❌ Ошибка создания плейлиста');
            }
        };
    }

    const cancelPlaylistBtn = document.getElementById('cancel-playlist-btn');
    if (cancelPlaylistBtn) {
        cancelPlaylistBtn.onclick = closeCreatePlaylistModal;
    }

    const coverArea = document.getElementById('playlist-cover-area');
    const coverInput = document.getElementById('playlist-cover-input');
    if (coverArea && coverInput) {
        coverArea.onclick = () => coverInput.click();
        coverInput.onchange = (e) => {
            const file = e.target.files[0];
            if (file && file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    document.getElementById('playlist-cover-preview').src = event.target.result;
                };
                reader.readAsDataURL(file);
            }
        };
    }

    document.querySelectorAll('.modal').forEach(modal => {
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    });
}

const originalAddSong = addSongToPlaylistUI;
window.addSongToPlaylistUI = function(song_name, url, songIndex) {
    originalAddSong(song_name, url, songIndex);
    const lastSong = playlist_container.lastChild;
    const addBtn = document.createElement('button');
    addBtn.textContent = '📁';
    addBtn.className = 'add-to-playlist-btn';
    addBtn.title = 'Добавить в плейлист';
    addBtn.style.background = 'none';
    addBtn.style.border = 'none';
    addBtn.style.cursor = 'pointer';
    addBtn.style.fontSize = '14px';
    addBtn.style.marginLeft = '8px';
    addBtn.style.opacity = '0.7';
    addBtn.onclick = (e) => {
        e.stopPropagation();
        showAddToPlaylistModal(url, song_name);
    };
    lastSong.appendChild(addBtn);
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPlaylistsUI);
} else {
    initPlaylistsUI();
}

// ========== КРОССФЕЙД МЕЖДУ ТРЕКАМИ ==========
let crossfadeDuration = 3.0;
let crossfadeActive = false;
let crossfadeInterval = null;
let tempAudio = null;
let crossfadeTargetIndex = null;

const savedCrossfadeFromSettings = localStorage.getItem('crossfadeDuration');
if (savedCrossfadeFromSettings !== null) {
    crossfadeDuration = parseFloat(savedCrossfadeFromSettings);
}

function cancelCrossfade() {
    if (crossfadeInterval) {
        clearInterval(crossfadeInterval);
        crossfadeInterval = null;
    }
    if (tempAudio) {
        try {
            tempAudio.pause();
            tempAudio.src = '';
        } catch(e) {}
        tempAudio = null;
    }
    crossfadeActive = false;
    crossfadeTargetIndex = null;
}

function startCrossfade(nextIndex) {
    if (crossfadeActive) cancelCrossfade();
    if (!playlist[nextIndex]) return;
    if (crossfadeDuration <= 0) return;

    crossfadeActive = true;
    crossfadeTargetIndex = nextIndex;

    tempAudio = new Audio();
    tempAudio.src = playlist[nextIndex].url;
    tempAudio.volume = 0;
    tempAudio.load();

    tempAudio.play().catch(e => {});

    const startTime = Date.now();
    const durationMs = crossfadeDuration * 1000;
    const userVolume = parseFloat(volume_slider?.value || 50) / 100;

    crossfadeInterval = setInterval(() => {
        if (!crossfadeActive) {
            clearInterval(crossfadeInterval);
            crossfadeInterval = null;
            return;
        }

        const elapsed = Date.now() - startTime;
        let progress = Math.min(1, elapsed / durationMs);

        if (audio && audio.src) {
            audio.volume = userVolume * (1 - progress);
        }
        if (tempAudio) {
            tempAudio.volume = userVolume * progress;
        }

        if (progress >= 1) {
            clearInterval(crossfadeInterval);
            crossfadeInterval = null;

            if (audio) {
                audio.pause();
            }

            audio = tempAudio;
            audio.volume = userVolume;

            currentTrackUrl = playlist[nextIndex].url;
            currentTrackName = playlist[nextIndex].name;
            index_song = nextIndex;

            updateTrackTitleDisplay(currentTrackName);
            highlightCurrentSongByIndex();
            loadCoverForTrack(currentTrackUrl, index_song);
            play_pause_btn.textContent = "⏸";

            setupAudioHandlers();

            tempAudio = null;
            crossfadeActive = false;
            crossfadeTargetIndex = null;
        }
    }, 50);
}

let crossfadeCheckInterval = null;

function startCrossfadeChecker() {
    if (crossfadeCheckInterval) clearInterval(crossfadeCheckInterval);

    crossfadeCheckInterval = setInterval(() => {
        if (!audio || !audio.src) return;
        if (audio.paused) return;
        if (!audio.duration || isNaN(audio.duration) || audio.duration === Infinity) return;
        if (crossfadeActive) return;
        if (playlist.length <= index_song + 1) return;
        if (crossfadeDuration <= 0) return;

        const timeLeft = audio.duration - audio.currentTime;

        if (timeLeft <= crossfadeDuration && timeLeft > 0.05) {
            startCrossfade(index_song + 1);
        }
    }, 100);
}

function setupAudioHandlers() {
    if (!audio) return;

    const updateProgress = () => {
        if (progress_slider && current_duration > 0) {
            const progress = (audio.currentTime / current_duration) * 100;
            progress_slider.value = progress;
        }
        if (current_time_display) {
            current_time_display.textContent = formatTime(audio.currentTime);
        }
    };

    audio.ontimeupdate = updateProgress;

    audio.onloadedmetadata = () => {
        current_duration = audio.duration;
        if (duration_display) {
            duration_display.textContent = formatTime(current_duration);
        }
        if (progress_slider) {
            progress_slider.max = 100;
        }
        updateProgress();
    };

    audio.onended = () => {
        play_pause_btn.textContent = "▶";
        if (playlist.length > 0 && !crossfadeActive) {
            index_song = (index_song + 1) % playlist.length;
            play_song(playlist[index_song].url);
            highlightCurrentSongByIndex();
        }
    };
}

const originalPlaySong = play_song;

window.play_song = function(url) {
    cancelCrossfade();
    originalPlaySong(url);
    setTimeout(() => {
        setupAudioHandlers();
    }, 100);
};

if (next_btn) {
    const originalNextOnClick = next_btn.onclick;
    next_btn.onclick = () => {
        cancelCrossfade();
        if (playlist.length > 0) {
            index_song = (index_song + 1) % playlist.length;
            play_song(playlist[index_song].url);
            highlightCurrentSongByIndex();
        }
    };
}

if (last_btn) {
    const originalLastOnClick = last_btn.onclick;
    last_btn.onclick = () => {
        cancelCrossfade();
        if (playlist.length > 0) {
            index_song = (index_song - 1 + playlist.length) % playlist.length;
            play_song(playlist[index_song].url);
            highlightCurrentSongByIndex();
        }
    };
}

setTimeout(() => {
    setupAudioHandlers();
    startCrossfadeChecker();
}, 500);

// ========== НАСТРОЙКИ ==========
(function() {
    function initSettings() {
        const settingsBtn = document.getElementById('settings-btn');

        if (!settingsBtn) {
            const buttonsBar = document.querySelector('.buttons-bar');
            if (buttonsBar) {
                const newSettingsBtn = document.createElement('button');
                newSettingsBtn.id = 'settings-btn';
                newSettingsBtn.textContent = '⚙️ Настройки';
                newSettingsBtn.style.background = 'rgba(255, 255, 255, 0.1)';
                newSettingsBtn.style.border = '1px solid rgba(255, 255, 255, 0.2)';
                newSettingsBtn.style.borderRadius = '40px';
                newSettingsBtn.style.padding = '6px 16px';
                newSettingsBtn.style.color = 'white';
                newSettingsBtn.style.fontWeight = '600';
                newSettingsBtn.style.fontSize = '13px';
                newSettingsBtn.style.cursor = 'pointer';
                buttonsBar.appendChild(newSettingsBtn);
                window.settingsBtnElement = newSettingsBtn;
            }
        }

        const modal = document.getElementById('settings-modal');
        const btn = document.getElementById('settings-btn') || window.settingsBtnElement;
        const modalCloseBtn = modal ? modal.querySelector('.close-modal') : null;
        const crossfadeSlider = document.getElementById('crossfade-slider');
        const crossfadeValue = document.getElementById('crossfade-value');
        const themeOptions = document.querySelectorAll('.theme-option');

        let currentTheme = 'dark';

        function loadSettings() {
            const savedCrossfade = localStorage.getItem('crossfadeDuration');
            if (savedCrossfade !== null) {
                crossfadeDuration = parseFloat(savedCrossfade);
                if (crossfadeSlider) crossfadeSlider.value = crossfadeDuration;
                if (crossfadeValue) crossfadeValue.textContent = crossfadeDuration.toFixed(2);
            }
            const savedTheme = localStorage.getItem('theme');
            if (savedTheme === 'light' || savedTheme === 'dark') {
                currentTheme = savedTheme;
            } else {
                currentTheme = 'dark';
            }
            applyTheme(currentTheme);
        }

        function applyTheme(theme) {
            document.body.classList.remove('light-theme', 'dark-theme');
            document.body.classList.add(theme === 'light' ? 'light-theme' : 'dark-theme');
            themeOptions.forEach(btn => {
                if (btn.dataset.theme === theme) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            });
        }

        function saveCrossfade(value) {
            crossfadeDuration = value;
            localStorage.setItem('crossfadeDuration', value);
        }

        function setTheme(theme) {
            currentTheme = theme;
            localStorage.setItem('theme', theme);
            applyTheme(theme);
        }

        if (btn) {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                if (modal) modal.style.display = 'flex';
            });
        }

        if (modalCloseBtn) {
            modalCloseBtn.addEventListener('click', () => {
                if (modal) modal.style.display = 'none';
            });
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }

        if (crossfadeSlider && crossfadeValue) {
            crossfadeSlider.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                crossfadeValue.textContent = val.toFixed(2);
                saveCrossfade(val);
            });
        }

        themeOptions.forEach(btn => {
            btn.addEventListener('click', () => {
                const theme = btn.dataset.theme;
                if (theme === 'light' || theme === 'dark') {
                    setTheme(theme);
                }
            });
        });

        loadSettings();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initSettings);
    } else {
        initSettings();
    }
})();

let pendingInviteToken = new URLSearchParams(window.location.search).get('invite');
let pendingInviteHandled = false;
let activePublicProfileNick = null;

function ensureCommunityUI() {
    const buttonsBar = document.querySelector('.buttons-bar');
    if (buttonsBar && !document.getElementById('community-btn')) {
        const communityBtn = document.createElement('button');
        communityBtn.id = 'community-btn';
        communityBtn.textContent = 'Community';
        communityBtn.onclick = showCommunityModal;
        buttonsBar.appendChild(communityBtn);
    }

    if (!document.getElementById('community-modal')) {
        document.body.insertAdjacentHTML('beforeend', `
            <div id="community-modal" class="modal" style="display:none;">
                <div class="modal-content community-modal-content">
                    <div class="modal-header">
                        <h2>Community</h2>
                        <button class="close-modal" id="close-community-modal">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="community-grid">
                            <section class="community-panel">
                                <h3>Friends</h3>
                                <div class="community-link-row">
                                    <input id="friend-invite-link" type="text" readonly>
                                    <button id="copy-friend-invite-btn">Copy link</button>
                                </div>
                                <div class="invite-row">
                                    <input id="friend-invite-input" type="text" placeholder="Paste invite link or token">
                                    <button id="add-friend-btn">Add friend</button>
                                </div>
                                <div id="community-status" class="community-status"></div>
                                <div id="friends-list" class="community-list"></div>
                            </section>
                            <section class="community-panel">
                                <h3>Top playlists</h3>
                                <div id="top-playlists-list" class="community-list"></div>
                            </section>
                        </div>
                    </div>
                </div>
            </div>
            <div id="public-profile-modal" class="modal" style="display:none;">
                <div class="modal-content public-profile-modal-content">
                    <div class="modal-header">
                        <h2 id="public-profile-title">Profile</h2>
                        <button class="close-modal" id="close-public-profile-modal">&times;</button>
                    </div>
                    <div class="modal-body" id="public-profile-body"></div>
                </div>
            </div>
        `);
    }

    const communityModal = document.getElementById('community-modal');
    const publicProfileModal = document.getElementById('public-profile-modal');
    const closeCommunityBtn = document.getElementById('close-community-modal');
    const closePublicProfileBtn = document.getElementById('close-public-profile-modal');
    const copyInviteBtn = document.getElementById('copy-friend-invite-btn');
    const addFriendBtn = document.getElementById('add-friend-btn');

    if (closeCommunityBtn) {
        closeCommunityBtn.onclick = () => {
            communityModal.style.display = 'none';
        };
    }

    if (closePublicProfileBtn) {
        closePublicProfileBtn.onclick = () => {
            publicProfileModal.style.display = 'none';
            activePublicProfileNick = null;
        };
    }

    if (communityModal) {
        communityModal.onclick = (e) => {
            if (e.target === communityModal) {
                communityModal.style.display = 'none';
            }
        };
    }

    if (publicProfileModal) {
        publicProfileModal.onclick = (e) => {
            if (e.target === publicProfileModal) {
                publicProfileModal.style.display = 'none';
                activePublicProfileNick = null;
            }
        };
    }

    if (copyInviteBtn) {
        copyInviteBtn.onclick = async () => {
            const inviteInput = document.getElementById('friend-invite-link');
            if (!inviteInput || !inviteInput.value) return;
            try {
                await navigator.clipboard.writeText(inviteInput.value);
                setCommunityStatus('Invite link copied');
            } catch (error) {
                inviteInput.select();
                document.execCommand('copy');
                setCommunityStatus('Invite link copied');
            }
        };
    }

    if (addFriendBtn) {
        addFriendBtn.onclick = async () => {
            const inviteInput = document.getElementById('friend-invite-input');
            const token = inviteInput ? inviteInput.value.trim() : '';
            if (!token) {
                setCommunityStatus('Paste an invite link or token');
                return;
            }
            const result = await addFriendByToken(token);
            if (result.ok) {
                if (inviteInput) inviteInput.value = '';
                setCommunityStatus(`Added ${result.friend.nick}`);
                await loadCommunityData();
            } else {
                setCommunityStatus(result.error || 'Could not add friend');
            }
        };
    }
}

function setCommunityStatus(message) {
    const status = document.getElementById('community-status');
    if (status) {
        status.textContent = message || '';
    }
}

async function apiPost(url, payload) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload || {})
    });
    return await response.json();
}

async function showCommunityModal() {
    if (!current_user) return;
    ensureCommunityUI();
    const modal = document.getElementById('community-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
    await loadCommunityData();
}

async function loadCommunityData() {
    if (!current_user) return;

    const [inviteResult, friendsResult, topResult] = await Promise.all([
        apiPost('/api/friends/invite', { nick: current_user }),
        apiPost('/api/friends/list', { nick: current_user }),
        apiPost('/api/playlists/top', { nick: current_user })
    ]);

    renderInviteLink(inviteResult);
    renderFriendsList(friendsResult.friends || []);
    renderTopPlaylists(topResult.playlists || []);
}

function renderInviteLink(result) {
    const inviteInput = document.getElementById('friend-invite-link');
    if (!inviteInput) return;
    if (result && result.ok) {
        inviteInput.value = `${window.location.origin}${result.invite_path}`;
    } else {
        inviteInput.value = '';
    }
}

function renderFriendsList(friends) {
    const container = document.getElementById('friends-list');
    if (!container) return;

    if (!friends.length) {
        container.innerHTML = '<div class="community-empty">No friends yet</div>';
        return;
    }

    container.innerHTML = friends.map(friend => `
        <article class="community-card">
            <div class="community-card-header">
                <div>
                    <div class="community-card-title">${escapeHtml(friend.nick)}</div>
                    <div class="community-card-subtitle">${friend.track_count} tracks / ${friend.playlist_count} playlists / ${friend.friend_count} friends</div>
                </div>
                <div class="community-card-actions">
                    <button class="community-action-btn" data-friend-profile="${escapeHtml(friend.nick)}">Profile</button>
                </div>
            </div>
        </article>
    `).join('');

    container.querySelectorAll('[data-friend-profile]').forEach(button => {
        button.onclick = () => openPublicProfile(button.dataset.friendProfile);
    });
}

function renderTopPlaylists(playlists) {
    const container = document.getElementById('top-playlists-list');
    if (!container) return;

    if (!playlists.length) {
        container.innerHTML = '<div class="community-empty">No playlists yet</div>';
        return;
    }

    container.innerHTML = playlists.map(playlistItem => `
        <article class="community-card">
            <div class="community-card-header">
                <div>
                    <div class="community-card-title">${escapeHtml(playlistItem.name)}</div>
                    <div class="community-card-subtitle">${escapeHtml(playlistItem.owner)} / ${playlistItem.track_count} tracks / ${playlistItem.like_count} likes</div>
                </div>
                <div class="community-card-actions">
                    <button class="community-action-btn" data-play-public="${playlistItem.id}">Play</button>
                    <button class="community-action-btn" data-like-public="${playlistItem.id}">${playlistItem.liked_by_me ? 'Unlike' : 'Like'}</button>
                    <button class="community-action-btn" data-copy-public="${playlistItem.id}">Add</button>
                </div>
            </div>
        </article>
    `).join('');

    attachPublicPlaylistActions(container);
}

function attachPublicPlaylistActions(root) {
    root.querySelectorAll('[data-play-public]').forEach(button => {
        button.onclick = async () => {
            await playPublicPlaylist(parseInt(button.dataset.playPublic, 10));
        };
    });

    root.querySelectorAll('[data-like-public]').forEach(button => {
        button.onclick = async () => {
            const playlistId = parseInt(button.dataset.likePublic, 10);
            await togglePlaylistLike(playlistId);
        };
    });

    root.querySelectorAll('[data-copy-public]').forEach(button => {
        button.onclick = async () => {
            const playlistId = parseInt(button.dataset.copyPublic, 10);
            await copyPublicPlaylist(playlistId);
        };
    });
}

async function addFriendByToken(token) {
    return await apiPost('/api/friends/add', {
        nick: current_user,
        token
    });
}

async function openPublicProfile(targetNick) {
    if (!current_user || !targetNick) return;
    activePublicProfileNick = targetNick;
    const result = await apiPost('/api/users/public_profile', {
        nick: current_user,
        target_nick: targetNick
    });

    if (!result.ok) {
        alert(result.error || 'Could not open profile');
        return;
    }

    renderPublicProfile(result);
    const modal = document.getElementById('public-profile-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function renderPublicProfile(result) {
    const title = document.getElementById('public-profile-title');
    const body = document.getElementById('public-profile-body');
    if (!body) return;

    if (title) {
        title.textContent = result.profile.nick;
    }

    const playlistsHtml = result.playlists.length ? result.playlists.map(item => `
        <article class="public-playlist-card">
            <div class="public-playlist-header">
                <div>
                    <div class="public-playlist-title">${escapeHtml(item.name)}</div>
                    <div class="public-playlist-meta">${item.track_count} tracks / ${item.like_count} likes</div>
                </div>
                <div class="public-playlist-actions">
                    <button data-play-public="${item.id}">Play</button>
                    <button data-like-public="${item.id}">${item.liked_by_me ? 'Unlike' : 'Like'}</button>
                    <button data-copy-public="${item.id}">Add</button>
                </div>
            </div>
        </article>
    `).join('') : '<div class="community-empty">No playlists yet</div>';

    const libraryHtml = result.library.length ? result.library.map(track => `
        <div class="public-library-item">
            <div>
                <div class="public-library-name">${escapeHtml(track.name)}</div>
                <div class="public-library-meta">${escapeHtml(track.artist || 'Unknown artist')}</div>
            </div>
        </div>
    `).join('') : '<div class="community-empty">Library is empty</div>';

    body.innerHTML = `
        <div class="public-profile-layout">
            <aside class="public-profile-sidebar">
                <section class="public-profile-hero">
                    <div class="public-profile-header">
                        <div>
                            <div class="community-card-title">${escapeHtml(result.profile.nick)}</div>
                            <div class="public-profile-meta">${result.profile.is_friend ? 'Friend' : 'User'}</div>
                        </div>
                    </div>
                    <div class="public-profile-stats">
                        <div class="public-profile-stat">
                            <div class="public-profile-stat-value">${result.profile.track_count}</div>
                            <div class="public-profile-stat-label">Tracks</div>
                        </div>
                        <div class="public-profile-stat">
                            <div class="public-profile-stat-value">${result.profile.playlist_count}</div>
                            <div class="public-profile-stat-label">Playlists</div>
                        </div>
                        <div class="public-profile-stat">
                            <div class="public-profile-stat-value">${result.profile.friend_count}</div>
                            <div class="public-profile-stat-label">Friends</div>
                        </div>
                    </div>
                </section>
            </aside>
            <section class="public-profile-main">
                <div class="public-profile-section">
                    <h3>Playlists</h3>
                    <div class="public-playlists-list">${playlistsHtml}</div>
                </div>
                <div class="public-profile-section">
                    <h3>Music library</h3>
                    <div class="public-library-list">${libraryHtml}</div>
                </div>
            </section>
        </div>
    `;

    attachPublicPlaylistActions(body);
}

function replaceQueueWithTracks(tracks) {
    if (!tracks || !tracks.length) {
        alert('Playlist is empty');
        return;
    }

    playlist_container.innerHTML = '';
    playlist.length = 0;

    tracks.forEach(track => {
        playlist.push(track);
    });

    playlist.forEach((song, idx) => {
        addSongToPlaylistUI(song.name, song.url, idx);
    });

    addAddToPlaylistButtons();
    index_song = 0;
    play_song(playlist[0].url);
    highlightCurrentSongByIndex();
}

async function playPublicPlaylist(playlistId) {
    const result = await apiPost('/api/public_playlist', {
        nick: current_user,
        playlist_id: playlistId
    });

    if (!result.ok) {
        alert(result.error || 'Could not open playlist');
        return;
    }

    replaceQueueWithTracks(result.tracks || []);
}

async function togglePlaylistLike(playlistId) {
    const result = await apiPost('/api/playlists/like', {
        nick: current_user,
        playlist_id: playlistId
    });

    if (!result.ok) {
        alert(result.error || 'Could not update like');
        return;
    }

    await loadCommunityData();
    if (activePublicProfileNick) {
        await openPublicProfile(activePublicProfileNick);
    }
    await loadUserPlaylists();
}

async function copyPublicPlaylist(playlistId) {
    const result = await apiPost('/api/playlists/copy', {
        nick: current_user,
        playlist_id: playlistId
    });

    if (!result.ok) {
        alert(result.error || 'Could not add playlist');
        return;
    }

    await loadUserPlaylists();
    await loadCommunityData();
    if (activePublicProfileNick) {
        await openPublicProfile(activePublicProfileNick);
    }
    alert(`Playlist "${result.playlist.name}" added`);
}

async function processPendingInvite() {
    if (!current_user || !pendingInviteToken || pendingInviteHandled) return;
    pendingInviteHandled = true;

    const result = await addFriendByToken(pendingInviteToken);
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url.toString());
    pendingInviteToken = null;

    if (result.ok) {
        alert(`Friend added: ${result.friend.nick}`);
    }
}

const originalShowPlayerWithCommunity = showPlayer;
showPlayer = function(nick, saved_playlist) {
    originalShowPlayerWithCommunity(nick, saved_playlist);
    ensureCommunityUI();
    processPendingInvite();
};

function initCommunityFeatures() {
    ensureCommunityUI();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCommunityFeatures);
} else {
    initCommunityFeatures();
}

function localizeCommunityUI() {
    const communityBtn = document.getElementById('community-btn');
    if (communityBtn) communityBtn.textContent = 'Сообщество';

    const communityTitle = document.querySelector('#community-modal .modal-header h2');
    if (communityTitle) communityTitle.textContent = 'Сообщество';

    const friendsTitle = document.querySelector('#community-modal .community-panel h3');
    if (friendsTitle) friendsTitle.textContent = 'Друзья';

    const topTitle = document.querySelectorAll('#community-modal .community-panel h3')[1];
    if (topTitle) topTitle.textContent = 'Топ плейлистов';

    const copyBtn = document.getElementById('copy-friend-invite-btn');
    if (copyBtn) copyBtn.textContent = 'Копировать';

    const inviteInput = document.getElementById('friend-invite-input');
    if (inviteInput) inviteInput.placeholder = 'Вставьте ссылку или токен';

    const addFriendBtn = document.getElementById('add-friend-btn');
    if (addFriendBtn) addFriendBtn.textContent = 'Добавить';

    const publicTitle = document.getElementById('public-profile-title');
    if (publicTitle && publicTitle.textContent === 'Profile') {
        publicTitle.textContent = 'Профиль';
    }
}

const originalEnsureCommunityUI = ensureCommunityUI;
ensureCommunityUI = function() {
    originalEnsureCommunityUI();
    localizeCommunityUI();
};

displayPlaylistsList = function() {
    const container = document.getElementById('playlists-list');
    if (!container) return;

    const sortedPlaylists = [...userPlaylists].sort((a, b) => {
        if (a.is_main) return -1;
        if (b.is_main) return 1;
        return 0;
    });

    if (sortedPlaylists.length === 0) {
        container.innerHTML = '<div class="empty-message" style="color: rgba(255,255,255,0.5); text-align: center; padding: 20px;">У вас пока нет плейлистов</div>';
        return;
    }

    container.innerHTML = '';
    sortedPlaylists.forEach(playlistItem => {
        const playlistCard = document.createElement('div');
        playlistCard.className = 'playlist-item-card';

        if (playlistItem.is_main) {
            playlistCard.style.border = '2px solid rgba(116, 189, 203, 0.8)';
            playlistCard.style.background = 'rgba(116, 189, 203, 0.15)';
            playlistCard.style.boxShadow = '0 0 10px rgba(116, 189, 203, 0.3)';
        }

        if (playlistItem.id === currentPlaylistId) {
            playlistCard.style.outline = '2px solid rgba(230, 173, 155, 0.9)';
            playlistCard.style.outlineOffset = '1px';
        }

        playlistCard.innerHTML = `
            <img class="playlist-cover-small" src="${playlistItem.cover_art || './Image/music.png'}" alt="cover">
            <div class="playlist-info">
                <div class="playlist-name">${escapeHtml(playlistItem.name)} ${playlistItem.is_main ? '★' : ''}</div>
                <div class="playlist-stats">${playlistItem.track_count} треков / ${playlistItem.like_count || 0} лайков</div>
            </div>
            <div class="playlist-actions">
                <button class="play-playlist" data-id="${playlistItem.id}" title="Открыть">Открыть</button>
                <button class="fill-playlist" data-id="${playlistItem.id}" title="Добавить треки">Треки</button>
                ${!playlistItem.is_main ? '<button class="delete-playlist" data-id="' + playlistItem.id + '" title="Удалить плейлист">🗑️</button>' : ''}
            </div>
        `;

        playlistCard.onclick = () => {
            openPlaylist(playlistItem.id, false);
        };

        playlistCard.querySelector('.play-playlist').onclick = (e) => {
            e.stopPropagation();
            openPlaylist(playlistItem.id, false);
        };

        playlistCard.querySelector('.fill-playlist').onclick = async (e) => {
            e.stopPropagation();
            await openPlaylist(playlistItem.id, false);
            showTrackLibraryModal();
        };

        if (!playlistItem.is_main) {
            playlistCard.querySelector('.delete-playlist').onclick = (e) => {
                e.stopPropagation();
                deletePlaylist(playlistItem.id);
            };
        }

        container.appendChild(playlistCard);
    });
};

async function openPlaylist(playlistId, autoplayFirstTrack = false) {
    if (!current_user) return;

    currentPlaylistId = playlistId;

    const selectedPlaylist = userPlaylists.find(p => p.id === playlistId);
    isMainPlaylist = selectedPlaylist ? selectedPlaylist.is_main : false;

    try {
        const response = await fetch('/api/play_playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nick: current_user,
                playlist_id: playlistId
            })
        });
        const result = await response.json();

        if (!result.ok) {
            alert(result.error || 'Ошибка загрузки плейлиста');
            return;
        }

        playlist_container.innerHTML = '';
        playlist.length = 0;

        const newPlaylist = result.tracks || [];
        newPlaylist.forEach(track => {
            playlist.push(track);
        });

        playlist.forEach((song, idx) => {
            addSongToPlaylistUI(song.name, song.url, idx);
        });

        addAddToPlaylistButtons();
        index_song = 0;

        if (playlist.length > 0) {
            if (autoplayFirstTrack) {
                play_song(playlist[0].url);
            } else {
                audio.pause();
                play_pause_btn.textContent = '▶';
                currentTrackUrl = null;
                updateTrackTitleDisplay(`Плейлист: ${selectedPlaylist ? selectedPlaylist.name : 'открыт'}`);
            }
            highlightCurrentSongByIndex();
        } else {
            audio.pause();
            audio.src = '';
            currentTrackUrl = null;
            play_pause_btn.textContent = '▶';
            updateTrackTitleDisplay(`Пустой плейлист: ${selectedPlaylist ? selectedPlaylist.name : ''}`);
        }

        displayPlaylistsList();
        closePlaylistsModal();
    } catch (error) {
        console.error('Ошибка открытия плейлиста:', error);
        alert('Ошибка при открытии плейлиста');
    }
}

playPlaylist = async function(playlistId) {
    await openPlaylist(playlistId, true);
};

createPlaylist = async function(name, description, coverData) {
    if (!current_user) return null;

    try {
        const response = await fetch('/api/create_playlist', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                nick: current_user,
                name: name,
                description: description,
                cover_data: coverData
            })
        });
        const result = await response.json();
        if (result.ok) {
            await loadUserPlaylists();
            return result.playlist;
        }
        return null;
    } catch (error) {
        console.error('Ошибка создания плейлиста:', error);
        return null;
    }
};

function enhancePlaylistCreation() {
    const savePlaylistBtn = document.getElementById('save-playlist-btn');
    if (!savePlaylistBtn) return;

    savePlaylistBtn.onclick = async () => {
        const name = document.getElementById('playlist-name').value.trim();
        if (!name) {
            alert('Введите название плейлиста');
            return;
        }

        let coverData = null;
        const coverImg = document.getElementById('playlist-cover-preview');
        if (coverImg && coverImg.src && !coverImg.src.includes('music.png')) {
            coverData = coverImg.src;
        }

        const createdPlaylist = await createPlaylist(
            name,
            document.getElementById('playlist-description').value,
            coverData
        );

        if (createdPlaylist) {
            closeCreatePlaylistModal();
            await openPlaylist(createdPlaylist.id, false);
            alert(`Плейлист "${createdPlaylist.name}" создан и открыт`);
        } else {
            alert('Ошибка создания плейлиста');
        }
    };
}

function ensureTrackLibraryModal() {
    if (document.getElementById('track-library-modal')) return;

    document.body.insertAdjacentHTML('beforeend', `
        <div id="track-library-modal" class="modal" style="display:none;">
            <div class="modal-content small">
                <div class="modal-header">
                    <h2>Добавить треки</h2>
                    <button class="close-modal" id="close-track-library-modal">&times;</button>
                </div>
                <div class="modal-body">
                    <p id="track-library-target-name" style="color: white; margin-bottom: 14px;"></p>
                    <div id="track-library-list" class="playlists-list-small"></div>
                </div>
            </div>
        </div>
    `);

    const modal = document.getElementById('track-library-modal');
    const closeBtn = document.getElementById('close-track-library-modal');
    if (closeBtn) {
        closeBtn.onclick = () => {
            modal.style.display = 'none';
        };
    }
    if (modal) {
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
            }
        };
    }
}

function collectTracksFromAllPlaylists() {
    const trackMap = new Map();

    userPlaylists.forEach(playlistItem => {
        (playlistItem.tracks || []).forEach(track => {
            const url = track.file_path || track.url;
            if (!url) return;

            if (!trackMap.has(url)) {
                trackMap.set(url, {
                    url,
                    name: track.title || track.name || 'Без названия',
                    artist: track.artist || 'Неизвестный исполнитель',
                    cover: track.cover_art || track.cover || './Image/music.png',
                    sources: new Set()
                });
            }

            trackMap.get(url).sources.add(playlistItem.name);
        });
    });

    return Array.from(trackMap.values()).sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function getCurrentPlaylistUrls() {
    const selectedPlaylist = userPlaylists.find(p => p.id === currentPlaylistId);
    const urls = new Set();

    if (!selectedPlaylist) return urls;

    (selectedPlaylist.tracks || []).forEach(track => {
        const url = track.file_path || track.url;
        if (url) urls.add(url);
    });

    return urls;
}

async function addTrackToCurrentPlaylist(trackUrl, trackName) {
    if (!currentPlaylistId) {
        alert('Сначала откройте плейлист');
        return;
    }

    const targetPlaylist = userPlaylists.find(p => p.id === currentPlaylistId);
    const success = await addToPlaylist(currentPlaylistId, trackUrl);
    if (!success) {
        alert(`Не удалось добавить "${trackName}"`);
        return;
    }

    await loadUserPlaylists();
    await openPlaylist(currentPlaylistId, false);
    showTrackLibraryModal();
    alert(`Трек "${trackName}" добавлен в "${targetPlaylist ? targetPlaylist.name : 'плейлист'}"`);
}

function renderTrackLibraryList() {
    const container = document.getElementById('track-library-list');
    const targetLabel = document.getElementById('track-library-target-name');
    if (!container || !targetLabel) return;

    const selectedPlaylist = userPlaylists.find(p => p.id === currentPlaylistId);
    targetLabel.textContent = selectedPlaylist
        ? `Куда добавляем: ${selectedPlaylist.name}`
        : 'Сначала откройте нужный плейлист';

    if (!selectedPlaylist) {
        container.innerHTML = '<div class="community-empty">Откройте плейлист, в который хотите добавлять треки</div>';
        return;
    }

    const existingUrls = getCurrentPlaylistUrls();
    const availableTracks = collectTracksFromAllPlaylists().filter(track => !existingUrls.has(track.url));

    if (!availableTracks.length) {
        container.innerHTML = '<div class="community-empty">Больше нет треков для добавления</div>';
        return;
    }

    container.innerHTML = '';
    availableTracks.forEach(track => {
        const item = document.createElement('div');
        item.className = 'playlist-small-item';
        item.innerHTML = `
            <img class="playlist-small-cover" src="${track.cover}" alt="cover">
            <div style="flex:1;">
                <div class="playlist-small-name">${escapeHtml(track.name)}</div>
                <div class="playlist-small-count" style="color: rgba(255,255,255,0.5); font-size: 11px;">
                    ${escapeHtml(track.artist)} / ${escapeHtml(Array.from(track.sources).join(', '))}
                </div>
            </div>
        `;
        item.onclick = () => addTrackToCurrentPlaylist(track.url, track.name);
        container.appendChild(item);
    });
}

function showTrackLibraryModal() {
    ensureTrackLibraryModal();
    renderTrackLibraryList();
    const modal = document.getElementById('track-library-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function ensureAddTracksButton() {
    const buttonsBar = document.querySelector('.buttons-bar');
    if (!buttonsBar || document.getElementById('add-tracks-btn')) return;

    const addTracksBtn = document.createElement('button');
    addTracksBtn.id = 'add-tracks-btn';
    addTracksBtn.textContent = 'Добавить треки';
    addTracksBtn.onclick = () => {
        if (!currentPlaylistId) {
            alert('Сначала откройте плейлист');
            return;
        }
        showTrackLibraryModal();
    };
    buttonsBar.appendChild(addTracksBtn);
}

renderFriendsList = function(friends) {
    const container = document.getElementById('friends-list');
    if (!container) return;

    if (!friends.length) {
        container.innerHTML = '<div class="community-empty">Пока нет друзей</div>';
        return;
    }

    container.innerHTML = friends.map(friend => `
        <article class="community-card">
            <div class="community-card-header">
                <div>
                    <div class="community-card-title">${escapeHtml(friend.nick)}</div>
                    <div class="community-card-subtitle">${friend.track_count} треков / ${friend.playlist_count} плейлистов / ${friend.friend_count} друзей</div>
                </div>
                <div class="community-card-actions">
                    <button class="community-action-btn" data-friend-profile="${escapeHtml(friend.nick)}">Профиль</button>
                </div>
            </div>
        </article>
    `).join('');

    container.querySelectorAll('[data-friend-profile]').forEach(button => {
        button.onclick = () => openPublicProfile(button.dataset.friendProfile);
    });
};

renderTopPlaylists = function(playlists) {
    const container = document.getElementById('top-playlists-list');
    if (!container) return;

    if (!playlists.length) {
        container.innerHTML = '<div class="community-empty">Пока нет плейлистов</div>';
        return;
    }

    container.innerHTML = playlists.map(playlistItem => `
        <article class="community-card">
            <div class="community-card-header">
                <div>
                    <div class="community-card-title">${escapeHtml(playlistItem.name)}</div>
                    <div class="community-card-subtitle">${escapeHtml(playlistItem.owner)} / ${playlistItem.track_count} треков / ${playlistItem.like_count} лайков</div>
                </div>
                <div class="community-card-actions">
                    <button class="community-action-btn" data-play-public="${playlistItem.id}">Слушать</button>
                    <button class="community-action-btn" data-like-public="${playlistItem.id}">${playlistItem.liked_by_me ? 'Убрать лайк' : 'Лайк'}</button>
                    <button class="community-action-btn" data-copy-public="${playlistItem.id}">Добавить</button>
                </div>
            </div>
        </article>
    `).join('');

    attachPublicPlaylistActions(container);
};

renderPublicProfile = function(result) {
    const title = document.getElementById('public-profile-title');
    const body = document.getElementById('public-profile-body');
    if (!body) return;

    if (title) {
        title.textContent = `Профиль: ${result.profile.nick}`;
    }

    const playlistsHtml = result.playlists.length ? result.playlists.map(item => `
        <article class="public-playlist-card">
            <div class="public-playlist-header">
                <div>
                    <div class="public-playlist-title">${escapeHtml(item.name)}</div>
                    <div class="public-playlist-meta">${item.track_count} треков / ${item.like_count} лайков</div>
                </div>
                <div class="public-playlist-actions">
                    <button data-play-public="${item.id}">Слушать</button>
                    <button data-like-public="${item.id}">${item.liked_by_me ? 'Убрать лайк' : 'Лайк'}</button>
                    <button data-copy-public="${item.id}">Добавить</button>
                </div>
            </div>
        </article>
    `).join('') : '<div class="community-empty">Плейлистов пока нет</div>';

    const libraryHtml = result.library.length ? result.library.map(track => `
        <div class="public-library-item">
            <div>
                <div class="public-library-name">${escapeHtml(track.name)}</div>
                <div class="public-library-meta">${escapeHtml(track.artist || 'Неизвестный исполнитель')}</div>
            </div>
        </div>
    `).join('') : '<div class="community-empty">Библиотека пуста</div>';

    body.innerHTML = `
        <div class="public-profile-layout">
            <aside class="public-profile-sidebar">
                <section class="public-profile-hero">
                    <div class="public-profile-header">
                        <div>
                            <div class="community-card-title">${escapeHtml(result.profile.nick)}</div>
                            <div class="public-profile-meta">${result.profile.is_friend ? 'Друг' : 'Пользователь'}</div>
                        </div>
                    </div>
                    <div class="public-profile-stats">
                        <div class="public-profile-stat">
                            <div class="public-profile-stat-value">${result.profile.track_count}</div>
                            <div class="public-profile-stat-label">Треки</div>
                        </div>
                        <div class="public-profile-stat">
                            <div class="public-profile-stat-value">${result.profile.playlist_count}</div>
                            <div class="public-profile-stat-label">Плейлисты</div>
                        </div>
                        <div class="public-profile-stat">
                            <div class="public-profile-stat-value">${result.profile.friend_count}</div>
                            <div class="public-profile-stat-label">Друзья</div>
                        </div>
                    </div>
                </section>
            </aside>
            <section class="public-profile-main">
                <div class="public-profile-section">
                    <h3>Плейлисты</h3>
                    <div class="public-playlists-list">${playlistsHtml}</div>
                </div>
                <div class="public-profile-section">
                    <h3>Музыка</h3>
                    <div class="public-library-list">${libraryHtml}</div>
                </div>
            </section>
        </div>
    `;

    attachPublicPlaylistActions(body);
};

setCommunityStatus = function(message) {
    const status = document.getElementById('community-status');
    if (status) {
        status.textContent = message || '';
    }
};

showCommunityModal = async function() {
    if (!current_user) return;
    ensureCommunityUI();
    localizeCommunityUI();
    const modal = document.getElementById('community-modal');
    if (modal) modal.style.display = 'flex';
    await loadCommunityData();
};

const originalShowPlayerLocalized = showPlayer;
showPlayer = function(nick, saved_playlist) {
    originalShowPlayerLocalized(nick, saved_playlist);
    ensureAddTracksButton();
};

togglePlaylistLike = async function(playlistId) {
    const result = await apiPost('/api/playlists/like', {
        nick: current_user,
        playlist_id: playlistId
    });

    if (!result.ok) {
        alert(result.error || 'Не удалось обновить лайк');
        return;
    }

    await loadCommunityData();
    if (activePublicProfileNick) {
        await openPublicProfile(activePublicProfileNick);
    }
    await loadUserPlaylists();
};

copyPublicPlaylist = async function(playlistId) {
    const result = await apiPost('/api/playlists/copy', {
        nick: current_user,
        playlist_id: playlistId
    });

    if (!result.ok) {
        alert(result.error || 'Не удалось добавить плейлист');
        return;
    }

    await loadUserPlaylists();
    await loadCommunityData();
    if (activePublicProfileNick) {
        await openPublicProfile(activePublicProfileNick);
    }
    alert(`Плейлист "${result.playlist.name}" добавлен`);
};

processPendingInvite = async function() {
    if (!current_user || !pendingInviteToken || pendingInviteHandled) return;
    pendingInviteHandled = true;

    const result = await addFriendByToken(pendingInviteToken);
    const url = new URL(window.location.href);
    url.searchParams.delete('invite');
    window.history.replaceState({}, '', url.toString());
    pendingInviteToken = null;

    if (result.ok) {
        alert(`Друг добавлен: ${result.friend.nick}`);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', enhancePlaylistCreation);
    document.addEventListener('DOMContentLoaded', ensureAddTracksButton);
} else {
    enhancePlaylistCreation();
    ensureAddTracksButton();
}

