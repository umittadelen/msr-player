const API_BASE = "http://localhost:5000/api";

const albumGrid = document.getElementById("albumGrid");
const albumDetail = document.getElementById("albumDetail");
const albumInfo = document.getElementById("albumInfo");
const songGrid = document.getElementById("songGrid");
const loadingState = document.getElementById("loadingState");
const noResults = document.getElementById("noResults");
const searchInput = document.getElementById("searchInput");
const backButton = document.getElementById("backButton");
const pageTitle = document.getElementById("pageTitle");

let albums = [];
let allSongs = [];
let activeAlbum = null;
let coverObserver;

function getProxyImageUrl(url) {
	return url ? `${API_BASE}/image?url=${encodeURIComponent(url)}` : "";
}

function ensureCoverObserver() {
	if (coverObserver) {
		return;
	}

	coverObserver = new IntersectionObserver(
		(entries) => {
			entries.forEach((entry) => {
				if (!entry.isIntersecting) {
					return;
				}
				const img = entry.target;
				const src = img.dataset.src;
				if (src) {
					img.src = src;
					img.removeAttribute("data-src");
				}
				coverObserver.unobserve(img);
			});
		},
		{ rootMargin: "200px 0px" }
	);
}

function observeCover(img) {
	ensureCoverObserver();
	coverObserver.observe(img);
}

async function fetchJson(url) {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Request failed: ${response.status}`);
	}
	return await response.json();
}

function showAlbumsView() {
	activeAlbum = null;
	albumGrid.style.display = "grid";
	albumDetail.classList.add("hidden");
	backButton.classList.add("hidden");
	pageTitle.textContent = "Albums";
	searchInput.placeholder = "Search albums...";
	searchInput.setAttribute("aria-label", "Search albums");
}

function showAlbumDetailView() {
	albumGrid.style.display = "none";
	albumDetail.classList.remove("hidden");
	backButton.classList.remove("hidden");
	pageTitle.textContent = "Album";
	searchInput.placeholder = "Search songs...";
	searchInput.setAttribute("aria-label", "Search songs");
}

function renderAlbums(list) {
	albumGrid.innerHTML = "";

	if (!list.length) {
		albumGrid.style.display = "none";
		noResults.style.display = "block";
		return;
	}

	list.forEach((album) => {
		const card = document.createElement("button");
		card.type = "button";
		card.className = "album-card";
		const coverUrl = getProxyImageUrl(album.coverUrl);
		card.innerHTML = `
			<img class="album-cover" data-src="${coverUrl}" alt="Album cover" loading="lazy" />
			<div class="song-info">
				<div class="song-name">${album.name}</div>
				<div class="album-meta">${(album.artistes || []).join(", ")}</div>
			</div>
		`;
		card.addEventListener("click", () => loadAlbumDetail(album.cid));
		albumGrid.appendChild(card);

		const img = card.querySelector(".album-cover");
		if (img) {
			observeCover(img);
		}
	});

	albumGrid.style.display = "grid";
	noResults.style.display = "none";
}

function renderAlbumDetail(album) {
	const coverUrl = getProxyImageUrl(album.coverUrl || album.coverDeUrl);
	albumInfo.innerHTML = `
		<img class="album-cover" data-src="${coverUrl}" alt="Album cover" loading="lazy" />
		<div class="song-info">
			<div class="song-name">${album.name}</div>
			<div class="album-meta">${album.belong || ""}</div>
			<div class="album-meta">${album.intro || ""}</div>
		</div>
	`;

	const albumImg = albumInfo.querySelector(".album-cover");
	if (albumImg) {
		observeCover(albumImg);
	}

	songGrid.innerHTML = "";
	(album.songs || []).forEach((song) => {
		const card = document.createElement("a");
		card.className = "song-card";
		card.href = `/index.html#/${song.cid}`;
		card.innerHTML = `
			<img class="song-cover" data-src="${coverUrl}" alt="Song cover" loading="lazy" />
			<div class="song-info">
				<div class="song-name">${song.name}</div>
				<div class="song-artist">${(song.artistes || []).join(", ")}</div>
			</div>
		`;
		
		const img = card.querySelector(".song-cover");
		if (img) {
			observeCover(img);
		}
		
		songGrid.appendChild(card);
	});
}

function filterAlbums(query) {
	if (!query.trim()) {
		renderAlbums(albums);
		return;
	}

	const lowerQuery = query.toLowerCase();
	
	// Find albums matching by name or artist
	const matchedAlbumCids = new Set();
	
	albums.forEach((album) => {
		if (album.name.toLowerCase().includes(lowerQuery) ||
			(album.artistes || []).some((artist) =>
				artist.toLowerCase().includes(lowerQuery)
			)) {
			matchedAlbumCids.add(album.cid);
		}
	});
	
	// Find albums containing matching songs
	allSongs.forEach((song) => {
		if (song.name.toLowerCase().includes(lowerQuery) ||
			(song.artistes || []).some((artist) =>
				artist.toLowerCase().includes(lowerQuery)
			)) {
			if (song.albumCid) {
				matchedAlbumCids.add(song.albumCid);
			}
		}
	});
	
	const filtered = albums.filter((album) => matchedAlbumCids.has(album.cid));
	renderAlbums(filtered);
}

function filterSongs(query) {
	if (!activeAlbum) {
		return;
	}

	if (!query.trim()) {
		renderAlbumDetail(activeAlbum);
		return;
	}

	const filtered = {
		...activeAlbum,
		songs: (activeAlbum.songs || []).filter((song) =>
			song.name.toLowerCase().includes(query.toLowerCase()) ||
			(song.artistes || []).some((artist) =>
				artist.toLowerCase().includes(query.toLowerCase())
			)
		)
	};

	renderAlbumDetail(filtered);
}

async function loadAlbumDetail(albumCid) {
	try {
		loadingState.style.display = "block";
		loadingState.textContent = "Loading album...";
		const payload = await fetchJson(`${API_BASE}/album/${albumCid}/detail`);
		activeAlbum = payload.data;
		loadingState.style.display = "none";
		renderAlbumDetail(activeAlbum);
		showAlbumDetailView();
	} catch (error) {
		loadingState.textContent = `Failed to load album: ${error.message}`;
	}
}

async function loadAlbums() {
	try {
		// Load albums and songs in parallel
		const [albumsPayload, songsPayload] = await Promise.all([
			fetchJson(`${API_BASE}/albums`),
			fetchJson(`${API_BASE}/songs`)
		]);
		
		albums = albumsPayload.data || [];
		allSongs = songsPayload.data?.list || [];
		
		loadingState.style.display = "none";
		renderAlbums(albums);
		showAlbumsView();
	} catch (error) {
		loadingState.textContent = `Failed to load albums: ${error.message}`;
	}
}

searchInput.addEventListener("input", (event) => {
	if (activeAlbum) {
		filterSongs(event.target.value);
		return;
	}
	filterAlbums(event.target.value);
});

backButton.addEventListener("click", () => {
	searchInput.value = "";
	showAlbumsView();
	renderAlbums(albums);
});

loadAlbums();
