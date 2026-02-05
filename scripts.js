const API_BASE = "http://localhost:5000/api";

// ============================================
// DOM Elements
// ============================================
const elements = {
	audio: document.getElementById("audio"),
	title: document.querySelector(".title"),
	subtitle: document.querySelector(".subtitle"),
	vinylStack: document.querySelector(".vinyl-stack"),
	vinylTilt: document.querySelector(".vinyl-tilt"),
	vinylWrap: document.querySelector(".vinyl-wrap"),
	lyricsList: document.getElementById("lyricsList"),
	logoImg: document.querySelector(".logo"),
	playerContainer: document.querySelector(".player-container"),
	playPauseBtn: document.getElementById("playPauseBtn"),
	progressSlider: document.getElementById("progressSlider"),
	progressFill: document.getElementById("progressFill"),
	volumeSlider: document.getElementById("volumeSlider"),
	currentTime: document.getElementById("currentTime"),
	totalTime: document.getElementById("totalTime"),
};

// ============================================
// State
// ============================================
let currentLyrics = [];
let isSeeking = false;
let duration = 0;
let isLoading = false;

// ============================================
// Utilities
// ============================================
function formatTime(seconds) {
	if (!seconds || !isFinite(seconds) || seconds < 0) return "0:00";
	const mins = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${mins}:${secs.toString().padStart(2, "0")}`;
}

async function fetchJson(url) {
	const response = await fetch(url);
	if (!response.ok) throw new Error(`Request failed: ${response.status}`);
	return response.json();
}

function getProxyUrl(type, url) {
	return `${API_BASE}/${type}?url=${encodeURIComponent(url)}`;
}

function getCidFromLocation() {
	const hash = window.location.hash.replace(/^#\/?/, "");
	if (hash) return hash;
	
	const path = window.location.pathname.replace(/\/$/, "");
	if (!path || path === "/" || path.endsWith("index.html")) return null;
	return path.split("/").pop();
}

// ============================================
// Lyrics
// ============================================
function parseLrc(text) {
	const lines = text.split(/\r?\n/);
	const parsed = [];
	const timeTag = /\[(\d+):(\d+)(?:\.(\d+))?\]/g;

	for (const line of lines) {
		const tags = [...line.matchAll(timeTag)];
		const lyricText = line.replace(timeTag, "").trim();
		if (!tags.length || !lyricText) continue;

		for (const tag of tags) {
			const time = Number(tag[1]) * 60 + Number(tag[2]) + Number(tag[3] || 0) / 1000;
			parsed.push({ time, text: lyricText });
		}
	}
	return parsed.sort((a, b) => a.time - b.time);
}

function renderLyrics(lyrics) {
	elements.lyricsList.innerHTML = "";
	
	if (!lyrics.length) {
		const li = document.createElement("li");
		li.className = "lyrics-line";
		li.textContent = "No lyrics available";
		elements.lyricsList.appendChild(li);
		return;
	}

	for (const line of lyrics) {
		const li = document.createElement("li");
		li.className = "lyrics-line";
		li.dataset.time = line.time;
		li.textContent = line.text;
		elements.lyricsList.appendChild(li);
	}
}

function updateActiveLyric(time) {
	const lines = elements.lyricsList.children;
	if (!lines.length || !currentLyrics.length) return;

	let activeIndex = -1;
	for (let i = currentLyrics.length - 1; i >= 0; i--) {
		if (time >= currentLyrics[i].time) {
			activeIndex = i;
			break;
		}
	}

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		if (i === activeIndex) {
			if (!line.classList.contains("active")) {
				line.classList.add("active");
				line.scrollIntoView({ block: "center", behavior: "smooth" });
			}
		} else {
			line.classList.remove("active");
		}
	}
}

// ============================================
// Player Controls
// ============================================
function setDuration(seconds) {
	duration = seconds;
	if (elements.totalTime) {
		elements.totalTime.textContent = formatTime(seconds);
	}
	if (elements.progressSlider) {
		elements.progressSlider.max = seconds;
	}
}

function updateProgress() {
	if (isSeeking || !duration) return;
	
	const time = elements.audio.currentTime;
	const percent = (time / duration) * 100;
	
	if (elements.progressFill) {
		elements.progressFill.style.width = percent + "%";
	}
	if (elements.progressSlider) {
		elements.progressSlider.value = time;
	}
	if (elements.currentTime) {
		elements.currentTime.textContent = formatTime(time);
	}
	
	updateActiveLyric(time);
}

function togglePlayPause() {
	if (isLoading) return;
	
	if (elements.audio.paused) {
		elements.audio.play().catch(() => {});
	} else {
		elements.audio.pause();
	}
}

function setPlaying(playing) {
	if (playing) {
		elements.vinylStack?.classList.add("spinning");
		elements.playPauseBtn?.classList.add("playing");
	} else {
		elements.vinylStack?.classList.remove("spinning");
		elements.playPauseBtn?.classList.remove("playing");
	}
}

function seekTo(time) {
	if (isLoading) return;
	elements.audio.currentTime = time;
	if (elements.currentTime) {
		elements.currentTime.textContent = formatTime(time);
	}
	if (elements.progressFill && duration) {
		elements.progressFill.style.width = (time / duration) * 100 + "%";
	}
}

function setVolume(value) {
	elements.audio.volume = Math.max(0, Math.min(1, value / 100));
}

// ============================================
// Song Loading
// ============================================
async function loadSong(cid) {
	// Reset state
	isLoading = true;
	currentLyrics = [];
	duration = 0;
	setDuration(0);
	elements.title.textContent = "Loading...";
	elements.subtitle.textContent = "";
	renderLyrics([]);
	
	// Stop current playback
	elements.audio.pause();
	elements.audio.removeAttribute("src");
	elements.audio.load();

	try {
		const { data: song } = await fetchJson(`${API_BASE}/song/${cid}`);
		
		// Update UI immediately
		elements.title.textContent = song.name;
		elements.subtitle.textContent = song.artists.join(", ");

		// Load audio
		const audioUrl = getProxyUrl("audio", song.sourceUrl);
		elements.audio.src = audioUrl;
		elements.audio.load();

		// Load cover and lyrics in parallel
		const promises = [];

		if (song.albumCid) {
			promises.push(
				fetchJson(`${API_BASE}/album/${song.albumCid}/detail`)
					.then(({ data }) => {
						const cover = data?.coverUrl || data?.coverDeUrl;
						if (cover) {
							const coverUrl = getProxyUrl("image", cover);
							elements.logoImg.src = coverUrl;
							elements.playerContainer.style.setProperty("--bg-image", `url(${coverUrl})`);
						}
					})
					.catch(() => {})
			);
		}

		if (song.lyricUrl) {
			promises.push(
				fetch(`${API_BASE}/lyrics/${encodeURIComponent(song.lyricUrl)}`)
					.then(r => r.ok ? r.text() : Promise.reject())
					.then(text => {
						currentLyrics = parseLrc(text);
						renderLyrics(currentLyrics);
					})
					.catch(() => renderLyrics([]))
			);
		}

		await Promise.all(promises);
		isLoading = false;

	} catch (error) {
		console.error("Failed to load song:", error);
		elements.title.textContent = "Failed to load";
		elements.subtitle.textContent = "Try another song";
		isLoading = false;
	}
}

// ============================================
// Vinyl Tilt Effect
// ============================================
function handleTilt(event) {
	const rect = elements.vinylWrap.getBoundingClientRect();
	const x = event.clientX - rect.left;
	const y = event.clientY - rect.top;
	const centerX = rect.width / 2;
	const centerY = rect.height / 2;

	const rotateY = ((x - centerX) / centerX) * 10 + 30;
	const rotateX = -((y - centerY) / centerY) * 10;

	elements.vinylTilt.style.transform = `rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`;
}

function resetTilt() {
	elements.vinylTilt.style.transform = "rotateX(0deg) rotateY(30deg)";
}

// ============================================
// Event Listeners
// ============================================
function initPlayer() {
	const audio = elements.audio;

	// Audio events
	audio.addEventListener("play", () => setPlaying(true));
	audio.addEventListener("pause", () => setPlaying(false));
	audio.addEventListener("ended", () => setPlaying(false));
	audio.addEventListener("timeupdate", updateProgress);
	
	// Duration detection - try multiple events
	audio.addEventListener("loadedmetadata", () => {
		if (audio.duration && isFinite(audio.duration)) {
			setDuration(audio.duration);
		}
	});
	
	audio.addEventListener("durationchange", () => {
		if (audio.duration && isFinite(audio.duration)) {
			setDuration(audio.duration);
		}
	});
	
	audio.addEventListener("canplay", () => {
		if (audio.duration && isFinite(audio.duration) && duration === 0) {
			setDuration(audio.duration);
		}
	});

	// Play/Pause button
	elements.playPauseBtn?.addEventListener("click", togglePlayPause);

	// Progress slider
	if (elements.progressSlider) {
		elements.progressSlider.addEventListener("mousedown", () => isSeeking = true);
		elements.progressSlider.addEventListener("touchstart", () => isSeeking = true);
		
		elements.progressSlider.addEventListener("input", (e) => {
			const time = parseFloat(e.target.value);
			if (elements.currentTime) {
				elements.currentTime.textContent = formatTime(time);
			}
			if (elements.progressFill && duration) {
				elements.progressFill.style.width = (time / duration) * 100 + "%";
			}
		});
		
		elements.progressSlider.addEventListener("change", (e) => {
			seekTo(parseFloat(e.target.value));
			isSeeking = false;
		});
	}

	// Volume slider
	if (elements.volumeSlider) {
		elements.volumeSlider.addEventListener("input", (e) => {
			setVolume(parseFloat(e.target.value));
		});
		// Set initial volume
		setVolume(parseFloat(elements.volumeSlider.value));
	}

	// Vinyl tilt
	elements.vinylWrap?.addEventListener("mousemove", handleTilt);
	elements.vinylWrap?.addEventListener("mouseleave", resetTilt);

	// Routing
	window.addEventListener("popstate", handleRoute);
	window.addEventListener("hashchange", handleRoute);
}

function handleRoute() {
	const cid = getCidFromLocation();
	if (cid) loadSong(cid);
}

// ============================================
// Initialize
// ============================================
initPlayer();
handleRoute();
