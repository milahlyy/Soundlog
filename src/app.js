// SoundLog SPA — Vanilla JS + Tailwind CDN
// Data model in localStorage
const STORAGE_KEY = 'soundlog_entries_v1';

/** @typedef {Object} Entry
 * @property {number} id
 * @property {string} apiId
 * @property {string} title
 * @property {string} artist
 * @property {string} coverUrl
 * @property {number} rating // 1-10
 * @property {string[]} tags // expressive tags
 * @property {string} review
 * @property {string} favTrack
 * @property {string} dateLogged // YYYY-MM-DD
 */

let entries = loadEntries();
let currentSort = 'newest';
let selectedAlbum = null; // from search (result object)
let editingId = null; // when editing existing entry
let navFilter = '';
let inspirationLoaded = false;

// DOM refs
const gridEl = document.getElementById('grid');
const emptyStateEl = document.getElementById('empty-state');
const statCountEl = document.getElementById('stat-count');
const statAvgEl = document.getElementById('stat-avg');
const navSearch = document.getElementById('navSearch');
const inspBackdrop = document.getElementById('inspiration-backdrop');
const overlayPrompt = document.getElementById('overlay-prompt');

const fab = document.getElementById('fab');
const sortSelect = document.getElementById('sort-select');

// Search modal refs
const searchModal = document.getElementById('searchModal');
const closeSearchBtn = document.getElementById('closeSearch');
const searchState = document.getElementById('searchState');
const formState = document.getElementById('formState');
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');

// Form refs
const formCover = document.getElementById('formCover');
const formTitle = document.getElementById('formTitle');
const formArtist = document.getElementById('formArtist');
const formDate = document.getElementById('formDate');
const ratingValue = document.getElementById('ratingValue');
const ratingStars = document.getElementById('ratingStars');
let currentStarRating = 3;
// tag input system
const tagContainer = document.getElementById('tagContainer');
const formTagsInput = document.getElementById('formTagsInput');
let formTags = [];
const formReview = document.getElementById('formReview');
const formFav = document.getElementById('formFav');
const saveEntryBtn = document.getElementById('saveEntry');
const backToSearchBtn = document.getElementById('backToSearch');

// Detail modal refs
const detailModal = document.getElementById('detailModal');
const closeDetailBtn = document.getElementById('closeDetail');
const detailCover = document.getElementById('detailCover');
const detailTitle = document.getElementById('detailTitle');
const detailArtist = document.getElementById('detailArtist');
const detailMeta = document.getElementById('detailMeta');
const detailReview = document.getElementById('detailReview');
const detailFav = document.getElementById('detailFav');
const detailTags = document.getElementById('detailTags');
const editEntryBtn = document.getElementById('editEntry');
const deleteEntryBtn = document.getElementById('deleteEntry');

// Init
renderAll();
attachHandlers();

function attachHandlers() {
  fab.addEventListener('click', () => openSearchModal());
  closeSearchBtn.addEventListener('click', () => closeSearchModal());
  closeDetailBtn.addEventListener('click', () => closeDetailModal());

  sortSelect.addEventListener('change', () => {
    currentSort = sortSelect.value;
    renderGrid();
  });

  if (navSearch) {
    let navTimer = null;
    navSearch.addEventListener('input', (e) => {
      clearTimeout(navTimer);
      navTimer = setTimeout(() => {
        navFilter = String(e.target.value || '').trim().toLowerCase();
        renderGrid();
      }, 150);
    });
  }

  // live search debounce
  let searchTimer = null;
  searchInput.addEventListener('input', (e) => {
    const q = e.target.value.trim();
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      if (q.length === 0) {
        searchResults.innerHTML = '';
        return;
      }
      searchITunes(q);
    }, 250);
  });

  backToSearchBtn.addEventListener('click', () => {
    switchToSearch();
  });

  // Star rating listeners
  if (ratingStars) {
    ratingStars.querySelectorAll('.star').forEach(btn => {
      btn.classList.add('text-stone-300');
      btn.addEventListener('click', () => {
        const v = Number(btn.getAttribute('data-v')) || 1;
        setStarRating(v);
      });
    });
  }

  // Tag input: add on Enter
  if (formTagsInput) {
    formTagsInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const t = sanitizeTag(formTagsInput.value);
        if (t) { addTag(t); }
        formTagsInput.value = '';
      }
    });
  }

  // Tag suggestions
  document.querySelectorAll('.tag-suggest').forEach(btn => {
    btn.addEventListener('click', () => {
      const t = sanitizeTag(btn.getAttribute('data-tag') || '');
      if (t) { addTag(t); }
    });
  });

  saveEntryBtn.addEventListener('click', () => {
    if (!selectedAlbum && !editingId) return; // need selection or editing target

    const id = editingId ?? genId();
    const apiId = selectedAlbum?.collectionId?.toString() ?? findEntry(editingId)?.apiId ?? '';
    const title = selectedAlbum?.collectionName ?? findEntry(editingId)?.title ?? '';
    const artist = selectedAlbum?.artistName ?? findEntry(editingId)?.artist ?? '';
    const coverUrl = (selectedAlbum ? hiResArtwork(selectedAlbum.artworkUrl100) : findEntry(editingId)?.coverUrl) ?? '';

    /** @type {Entry} */
    const entry = {
      id,
      apiId,
      title,
      artist,
      coverUrl,
      rating: Number(currentStarRating),
      tags: [...formTags],
      review: formReview.value.trim(),
      favTrack: formFav.value.trim(),
      dateLogged: formDate.value || todayStr(),
    };

    upsertEntry(entry);
    closeSearchModal();
    renderAll();
  });

  // modal backdrop close (optional: click outside)
  [searchModal, detailModal].forEach((modal) => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal === searchModal ? closeSearchModal() : closeDetailModal();
      }
    });
  });

  editEntryBtn.addEventListener('click', () => {
    const id = editEntryBtn.dataset.id ? Number(editEntryBtn.dataset.id) : null;
    if (!id) return;
    const entry = findEntry(id);
    if (!entry) return;
    openSearchModal('edit', entry);
  });

  deleteEntryBtn.addEventListener('click', () => {
    const id = deleteEntryBtn.dataset.id ? Number(deleteEntryBtn.dataset.id) : null;
    if (!id) return;
    entries = entries.filter(e => e.id !== id);
    saveEntries(entries);
    closeDetailModal();
    renderAll();
  });
}

function renderAll() {
  renderStats();
  renderGrid();
}

function renderStats() {
  const count = entries.length;
  const avg = count ? (entries.reduce((a, e) => a + Number(e.rating || 0), 0) / count) : 0;
  statCountEl.textContent = `${count} Albums Logged`;
  statAvgEl.textContent = `Avg Rating: ${avg.toFixed(1)}`;
}

function renderGrid() {
  // filter
  let arr = [...entries];
  if (navFilter) {
    arr = arr.filter(e => {
      const hay = [e.title, e.artist, ...(e.tags || [])].join(' ').toLowerCase();
      return hay.includes(navFilter);
    });
  }

  // sort
  if (currentSort === 'newest') arr.sort((a, b) => (b.dateLogged || '').localeCompare(a.dateLogged || ''));
  else if (currentSort === 'rating') arr.sort((a, b) => (Number(b.rating) - Number(a.rating)) || (b.dateLogged || '').localeCompare(a.dateLogged || ''));
  else if (currentSort === 'title') arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));

  gridEl.innerHTML = '';

  if (arr.length === 0) {
    emptyStateEl.classList.remove('hidden');
    // Alive Empty State
    if (!inspirationLoaded) fetchInspiration();
  } else {
    emptyStateEl.classList.add('hidden');
    clearInspiration();
  }

  for (const e of arr) {
    const card = document.createElement('div');
    card.className = 'card-hover rounded-2xl bg-white border border-stone-200 shadow-sm overflow-hidden cursor-pointer';

    const wrapper = document.createElement('div');
    wrapper.className = 'relative';

    const img = document.createElement('img');
    img.src = e.coverUrl;
    img.alt = `${e.title} cover`;
    img.className = 'w-full aspect-square object-cover';

    // rating badge
    const badge = document.createElement('div');
    badge.className = 'absolute top-2 left-2 px-2 py-1 rounded-full bg-white border border-stone-200 text-xs text-stone-700';
    badge.textContent = `★ ${Number(e.rating).toFixed(1)}`;

    wrapper.appendChild(img);
    wrapper.appendChild(badge);

    const meta = document.createElement('div');
    meta.className = 'p-3 space-y-1';

    const titleEl = document.createElement('div');
    titleEl.className = 'truncate font-serif font-semibold';
    titleEl.textContent = e.title;

    const artistEl = document.createElement('div');
    artistEl.className = 'truncate text-sm text-stone-500';
    artistEl.textContent = e.artist;

    // tags row
    const tagsWrap = document.createElement('div');
    tagsWrap.className = 'flex flex-wrap gap-1';
    (e.tags || []).slice(0, 3).forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'px-2 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-xs';
      chip.textContent = t;
      tagsWrap.appendChild(chip);
    });

    meta.appendChild(titleEl);
    meta.appendChild(artistEl);
    if ((e.tags || []).length) meta.appendChild(tagsWrap);

    card.appendChild(wrapper);
    card.appendChild(meta);

    card.addEventListener('click', () => openDetailModal(e.id));

    gridEl.appendChild(card);
  }
}

// Modals
function openSearchModal(mode = 'create', entry = null) {
  searchModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  if (mode === 'create') {
    editingId = null;
    selectedAlbum = null;
    searchInput.value = '';
    searchResults.innerHTML = '';
    formTags = [];
    renderTagChips();
    setStarRating(3);
    switchToSearch();
  } else {
    // edit existing
    editingId = entry.id;
    selectedAlbum = null; // keep null to preserve original meta unless user reselects from search
    // populate form
    formCover.src = entry.coverUrl;
    formTitle.textContent = entry.title;
    formArtist.textContent = entry.artist;
    formDate.value = entry.dateLogged || todayStr();
    // convert old 10-scale to 5 if needed
    const r = Number(entry.rating);
    const five = Math.max(1, Math.min(5, Math.round(r > 5 ? r / 2 : r)));
    setStarRating(five);
    formTags = Array.isArray(entry.tags) ? [...entry.tags] : [];
    renderTagChips();
    formFav.value = entry.favTrack || '';
    formReview.value = entry.review || '';
    switchToForm();
  }
}
function closeSearchModal() {
  searchModal.classList.add('hidden');
  document.body.style.overflow = '';
}
function switchToSearch() {
  searchState.classList.remove('hidden');
  formState.classList.add('hidden');
}
function switchToForm() {
  searchState.classList.add('hidden');
  formState.classList.remove('hidden');
}

function openDetailModal(id) {
  const e = findEntry(id);
  if (!e) return;
  detailCover.src = e.coverUrl;
  detailTitle.textContent = e.title;
  detailArtist.textContent = e.artist;
  detailMeta.textContent = `★ ${Number(e.rating).toFixed(1)} • ${formatDate(e.dateLogged)}`;
  detailReview.textContent = e.review || '—';
  detailFav.textContent = e.favTrack || '—';
  // tags
  if (detailTags) {
    detailTags.innerHTML = '';
    (e.tags || []).forEach(t => {
      const chip = document.createElement('span');
      chip.className = 'px-2 py-0.5 rounded-full bg-stone-100 border border-stone-200 text-xs';
      chip.textContent = t;
      detailTags.appendChild(chip);
    });
  }
  editEntryBtn.dataset.id = String(e.id);
  deleteEntryBtn.dataset.id = String(e.id);

  detailModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}
function closeDetailModal() {
  detailModal.classList.add('hidden');
  document.body.style.overflow = '';
}

// Storage
function loadEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    // migrate older entries lacking tags
    return Array.isArray(arr) ? arr.map(e => ({ ...e, tags: Array.isArray(e.tags) ? e.tags : [] })) : [];
  } catch (e) { return []; }
}
function saveEntries(list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
}
function upsertEntry(entry) {
  const idx = entries.findIndex(x => x.id === entry.id);
  if (idx >= 0) entries[idx] = entry; else entries.push(entry);
  saveEntries(entries);
}
function findEntry(id) { return entries.find(e => e.id === id) || null; }

function genId() { return Date.now() + Math.floor(Math.random() * 1000); }
function todayStr() { return new Date().toISOString().slice(0,10); }
function formatDate(iso) {
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

// iTunes API search per spec
async function searchITunes(query) {
  const term = query.replace(/\s+/g, '+');
  const url = `https://itunes.apple.com/search?term=${term}&entity=album&limit=5`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    displaySearchResults(data.results);
  } catch (error) {
    console.error('Search failed:', error);
  }
}

function displaySearchResults(results) {
  searchResults.innerHTML = '';
  for (const r of results) {
    const item = document.createElement('button');
    item.className = 'w-full flex items-center gap-3 px-3 py-2 rounded-lg bg-stone-100 hover:bg-stone-200 border border-stone-200 text-left';

    const img = document.createElement('img');
    img.src = r.artworkUrl100;
    img.alt = r.collectionName;
    img.className = 'h-12 w-12 rounded-md object-cover';

    const block = document.createElement('div');
    block.className = 'text-left';

    const t = document.createElement('div');
    t.className = 'text-sm font-medium';
    t.textContent = r.collectionName;

    const a = document.createElement('div');
    a.className = 'text-xs text-stone-500';
    a.textContent = r.artistName;

    block.appendChild(t); block.appendChild(a);
    item.appendChild(img); item.appendChild(block);

    item.addEventListener('click', () => {
      selectedAlbum = r;
      // populate form state
      formCover.src = hiResArtwork(r.artworkUrl100);
      formTitle.textContent = r.collectionName;
      formArtist.textContent = r.artistName;
      formDate.value = todayStr();
      setStarRating(3);
      formTags = [];
      renderTagChips();
      formReview.value = '';
      formFav.value = '';
      switchToForm();
    });

    searchResults.appendChild(item);
  }
}

function hiResArtwork(url100) {
  try { return url100.replace('100x100bb', '1000x1000bb'); } catch { return url100; }
}

function setStarRating(v) {
  currentStarRating = Math.max(1, Math.min(5, Number(v) || 1));
  if (ratingStars) {
    ratingStars.querySelectorAll('.star').forEach(btn => {
      const val = Number(btn.getAttribute('data-v')) || 1;
      btn.classList.toggle('text-orange-600', val <= currentStarRating);
      btn.classList.toggle('text-stone-300', val > currentStarRating);
    });
  }
  if (ratingValue) ratingValue.textContent = String(currentStarRating);
}

// Tag helpers
function sanitizeTag(t) { return (t || '').trim().replace(/\s+/g, ' ').slice(0, 24); }
function addTag(t) {
  if (!formTags.includes(t)) {
    formTags.push(t);
    renderTagChips();
  }
}
function removeTag(t) {
  formTags = formTags.filter(x => x !== t);
  renderTagChips();
}
function renderTagChips() {
  if (!tagContainer) return;
  // preserve input element at end
  const input = formTagsInput;
  tagContainer.innerHTML = '';
  formTags.forEach(t => {
    const chip = document.createElement('span');
    chip.className = 'inline-flex items-center gap-1 px-2 py-1 rounded-full bg-stone-200 text-sm';
    chip.textContent = t;
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'text-stone-600 hover:text-stone-800';
    x.textContent = '×';
    x.addEventListener('click', () => removeTag(t));
    chip.appendChild(x);
    tagContainer.appendChild(chip);
  });
  tagContainer.appendChild(input);
}

// Alive Empty State
async function fetchInspiration() {
  try {
    const url = 'https://itunes.apple.com/search?term=classic+rock&entity=album&limit=24';
    const res = await fetch(url);
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    renderInspiration(results);
    inspirationLoaded = true;
  } catch (e) {
    inspirationLoaded = true; // avoid spamming
  }
}
function renderInspiration(results) {
  if (!inspBackdrop) return;
  const imgs = results.map(r => `<img src="${hiResArtwork(r.artworkUrl100)}" alt="" class="w-full h-full object-cover opacity-10 grayscale" />`);
  // 6 x 4 grid
  inspBackdrop.innerHTML = `
    <div class="absolute inset-0">
      <div class="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-2 p-4">
        ${imgs.join('')}
      </div>
      <div class="pointer-events-none absolute inset-0 bg-gradient-to-b from-white via-white/70 to-transparent"></div>
    </div>
  `;
  if (overlayPrompt) overlayPrompt.classList.remove('hidden');
}
function clearInspiration() {
  if (inspBackdrop) inspBackdrop.innerHTML = '';
  if (overlayPrompt) overlayPrompt.classList.add('hidden');
  inspirationLoaded = false;
}
