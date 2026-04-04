// Defer initialization until the DOM is ready and guard missing elements.
let projects = [];
let filteredProjects = [];
let fuse = null;

// Elements and UI state will be initialized on DOMContentLoaded
let projectsContainer;
let languageFilter;
let textSearch;
let starsFilter;
let starsValue;
let sortBy;
let totalCount;
let visibleCount;
let lastUpdated;
let pageSizeSelect;
let prevPageBtn;
let nextPageBtn;
let pageInfo;

let currentPage = 1;
let pageSizeRaw = '50';
let pageSize = 50; // number or 'all'
let virtualized = false;
let virtualWindow = { start: 0, end: 20 };
let cardHeight = 140; // px estimate; we'll measure after first render
let _virtualRaf = null;

document.addEventListener('DOMContentLoaded', () => {
    // Query DOM elements now that the document is ready. If critical elements
    // are missing, bail gracefully to avoid runtime exceptions in environments
    // where the script is loaded on a page without the app markup.
    projectsContainer = document.getElementById('projects-container');
    if (!projectsContainer) return; // nothing to do

    languageFilter = document.getElementById('language-filter');
    textSearch = document.getElementById('text-search');
    starsFilter = document.getElementById('stars-filter');
    starsValue = document.getElementById('stars-value');
    sortBy = document.getElementById('sort-by');
    totalCount = document.getElementById('total-count');
    visibleCount = document.getElementById('visible-count');
    lastUpdated = document.getElementById('last-updated');
    pageSizeSelect = document.getElementById('page-size');
    prevPageBtn = document.getElementById('prev-page');
    nextPageBtn = document.getElementById('next-page');
    pageInfo = document.getElementById('page-info');

    // Initial page size
    if (pageSizeSelect && pageSizeSelect.value) {
        pageSizeRaw = pageSizeSelect.value;
        pageSize = pageSizeRaw === 'all' ? 'all' : parseInt(pageSizeRaw, 10) || 50;
        virtualized = pageSize === 'all';
    }

    // Attach event listeners that depend on the DOM
    languageFilter && languageFilter.addEventListener('change', applyFilters);
    if (textSearch) textSearch.addEventListener('input', applyFilters);
    starsFilter && starsFilter.addEventListener('input', function() {
        starsValue && (starsValue.textContent = parseInt(this.value).toLocaleString());
        applyFilters();
    });
    sortBy && sortBy.addEventListener('change', applyFilters);
    pageSizeSelect && pageSizeSelect.addEventListener('change', function() {
        pageSizeRaw = this.value;
        pageSize = pageSizeRaw === 'all' ? 'all' : parseInt(pageSizeRaw, 10) || 50;
        virtualized = pageSize === 'all';
        currentPage = 1;
        // Reset virtual window
        virtualWindow = { start: 0, end: 20 };
        applyFilters();
    });
    prevPageBtn && prevPageBtn.addEventListener('click', function() {
        if (currentPage > 1) {
            currentPage -= 1;
            applyFilters();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });
    nextPageBtn && nextPageBtn.addEventListener('click', function() {
        const maxPages = computeMaxPages();
        if (currentPage < maxPages) {
            currentPage += 1;
            applyFilters();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    // Kick off loading data
    loadProjects();
});

// Load data
async function loadProjects() {
    try {
        const response = await fetch('dead-projects.json');
        if (!response.ok) {
            throw new Error('Failed to load projects data');
        }
        const data = await response.json();
        projects = data.projects || [];
        filteredProjects = [...projects];

        // Coerce numeric/date fields once to avoid repeated work during sorting/filtering
        projects.forEach(p => {
            // Ensure stars is a number
            const starsNum = Number(p.stars);
            p.stars = Number.isFinite(starsNum) ? starsNum : 0;

            // Parse last_commit into a timestamp for fast sorting; keep original string for display
            const ts = Date.parse(p.last_commit || '');
            p._last_commit_ts = Number.isFinite(ts) ? ts : 0;

            // Ensure name is a string
            p.name = p.name || '';
        });

        // Update last updated date
        // Find collected_at in metadata or first project
        const collectedAt = data.metadata?.generated_at || projects[0]?.collected_at;
        if (collectedAt) {
            const date = new Date(collectedAt);
            lastUpdated.textContent = date.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } else {
            lastUpdated.textContent = 'Unknown';
        }

        populateLanguages();

        // Initialize Fuse (fuzzy search) if available
        initFuse();

        // Set stars slider max dynamically from data to improve UX
        const maxStars = projects.reduce((max, p) => Math.max(max, p.stars || 0), 0);
        // Ensure a reasonable minimum max
        const sliderMax = Math.max(100, Math.ceil(maxStars / 100) * 100);
        starsFilter.max = sliderMax;
        starsFilter.value = 0;
        starsValue.textContent = parseInt(starsFilter.value).toLocaleString();

        applyFilters();
    } catch (error) {
        console.error('Error loading projects:', error);
        projectsContainer.innerHTML = `
            <div class="no-results">
                <h3>Error loading projects</h3>
                <p>Please try again later.</p>
            </div>
        `;
    }
}

// Initialize Fuse.js if available to provide fuzzy search
function initFuse() {
    if (typeof Fuse === 'undefined' || !projects.length) return;

    // Configure Fuse to search name, description, and topics
    const options = {
        keys: [
            { name: 'name', weight: 0.7 },
            { name: 'description', weight: 0.2 },
            { name: 'topics', weight: 0.1 }
        ],
        threshold: 0.4,
        ignoreLocation: true,
    };

    // Create a lightweight copy of projects for Fuse
    const fuseList = projects.map(p => ({
        name: p.name || '',
        description: p.description || '',
        topics: (p.topics || []).join(' '),
    }));

    try {
        fuse = new Fuse(fuseList, options);
    } catch (e) {
        // If Fuse initialization fails, fall back to substring search
        console.warn('Fuse initialization failed, falling back to substring search', e);
        fuse = null;
    }
}

// Populate language filter with available languages
function populateLanguages() {
    const languages = [...new Set(projects.map(p => p.language).filter(Boolean))].sort();
    languageFilter.innerHTML = '<option value="all">All Languages</option>';

    languages.forEach(lang => {
        const option = document.createElement('option');
        option.value = lang;
        option.textContent = lang;
        languageFilter.appendChild(option);
    });
}

// Apply all filters
function applyFilters() {
    const selectedLanguage = languageFilter.value;
    const minStars = parseInt(starsFilter.value);
    const rawQuery = (textSearch && textSearch.value) ? textSearch.value.trim() : '';
    const queryLower = rawQuery.toLowerCase();

    // If using Fuse.js, run the fuzzy search once per query and cache the matching names
    let fuseMatches = null;
    if (rawQuery && fuse) {
        try {
            // Limit to projects.length for reasonable bounds; Fuse will handle internal limits
            const limit = projects.length || 10000;
            const results = fuse.search(rawQuery, { limit });
            fuseMatches = new Set(results.map(r => r.item && r.item.name).filter(Boolean));
        } catch (e) {
            // If Fuse fails for any reason, fall back to substring matching
            console.warn('Fuse search failed, falling back to substring search', e);
            fuseMatches = null;
        }
    }

    // Filter — use the precomputed fuseMatches set if available to avoid repeated expensive searches
    filteredProjects = projects.filter(project => {
        const matchesLanguage = selectedLanguage === 'all' || project.language === selectedLanguage;
        const matchesStars = project.stars >= minStars;

        if (rawQuery) {
            if (fuse && fuseMatches) {
                const matchesText = fuseMatches.has(project.name);
                return matchesLanguage && matchesStars && matchesText;
            }

            // Fallback: simple substring search across name/description/topics
            const hay = [project.name, project.description, (project.topics || []).join(' ')].filter(Boolean).join(' ').toLowerCase();
            const matchesText = hay.indexOf(queryLower) !== -1;
            return matchesLanguage && matchesStars && matchesText;
        }

        return matchesLanguage && matchesStars;
    });

    // Sort
    const sortValue = sortBy.value;
    filteredProjects.sort((a, b) => {
        switch (sortValue) {
            case 'stars-desc':
                return b.stars - a.stars;
            case 'stars-asc':
                return a.stars - b.stars;
            case 'date-desc':
                return (b._last_commit_ts || 0) - (a._last_commit_ts || 0);
            case 'date-asc':
                return (a._last_commit_ts || 0) - (b._last_commit_ts || 0);
            case 'name-asc':
                return a.name.localeCompare(b.name);
            case 'name-desc':
                return b.name.localeCompare(a.name);
            default:
                return 0;
        }
    });

    // Update counts
    totalCount.textContent = projects.length.toLocaleString();
    visibleCount.textContent = filteredProjects.length.toLocaleString();

    // Reset pagination if current page would be out of range
    const maxPages = computeMaxPages();
    if (currentPage > maxPages) currentPage = maxPages;

    // Render paginated view
    renderProjects();
    updatePaginationInfo();
}

// Render projects to DOM using safe DOM APIs
function renderProjects() {
    if (filteredProjects.length === 0) {
        projectsContainer.innerHTML = '';
        const noResults = document.createElement('div');
        noResults.className = 'no-results';
        noResults.innerHTML = `
            <h3>No projects match your filters</h3>
            <p>Try adjusting your filters to see more results.</p>
        `;
        projectsContainer.appendChild(noResults);
        return;
    }

    projectsContainer.innerHTML = '';

    const fragment = document.createDocumentFragment();

    // Determine items to render depending on pagination vs virtualization
    let pageItems;
    if (pageSize === 'all') {
        // Virtualized window — render virtualWindow.start..end
        const start = Math.max(0, virtualWindow.start);
        const end = Math.min(filteredProjects.length, virtualWindow.end);
        pageItems = filteredProjects.slice(start, end);
    } else {
        // Paginated slice
        const start = (currentPage - 1) * pageSize;
        const end = start + pageSize;
        pageItems = filteredProjects.slice(start, end);
    }

    pageItems.forEach(project => {
        const card = document.createElement('article');
        card.className = 'project-card';

        // Header with name link and language badge
        const header = document.createElement('div');
        header.className = 'card-header';

        const nameLink = document.createElement('a');
        const safeUrl = sanitizeUrl(project.url);
        if (safeUrl) {
            nameLink.href = safeUrl;
            nameLink.target = '_blank';
            nameLink.rel = 'noopener noreferrer';
        } else {
            nameLink.href = '#';
            nameLink.addEventListener('click', e => e.preventDefault());
        }
        nameLink.className = 'project-name';
        nameLink.textContent = project.name || 'Unnamed';
        header.appendChild(nameLink);

        if (project.language) {
            const langSpan = document.createElement('span');
            langSpan.className = 'project-language';
            langSpan.textContent = project.language;
            header.appendChild(langSpan);
        }

        card.appendChild(header);

        // Description
        const desc = document.createElement('p');
        desc.className = 'project-description';
        desc.textContent = project.description || 'No description provided';
        card.appendChild(desc);

        // Stats
        const stats = document.createElement('div');
        stats.className = 'card-stats';

        const starsStat = document.createElement('span');
        starsStat.className = 'stat-item';
        starsStat.title = 'Stars';
        starsStat.textContent = `⭐ ${project.stars.toLocaleString()}`;
        stats.appendChild(starsStat);

        const dateStat = document.createElement('span');
        dateStat.className = 'stat-item';
        dateStat.title = 'Last commit';
        dateStat.textContent = `📅 ${formatDateAgo(project.last_commit)}`;
        stats.appendChild(dateStat);

        card.appendChild(stats);

        // Actions
        const actions = document.createElement('div');
        actions.className = 'card-actions';

        const viewBtn = document.createElement('a');
        const safeView = sanitizeUrl(project.url);
        if (safeView) {
            viewBtn.href = safeView;
            viewBtn.target = '_blank';
            viewBtn.rel = 'noopener noreferrer';
        } else {
            viewBtn.href = '#';
            viewBtn.addEventListener('click', e => e.preventDefault());
        }
        viewBtn.className = 'btn btn-primary';
        viewBtn.textContent = 'View on GitHub';
        actions.appendChild(viewBtn);

        // Express interest button: opens a prefilled issue on the repo
        const interestBtn = document.createElement('a');
        // Prefill issue title and body using GitHub's query params
        const issueTitle = encodeURIComponent(`I would like to help maintain ${project.name}`);
        const issueBody = encodeURIComponent(`Hi,\n\nI am interested in helping maintain **${project.name}**.\n\nReasons:\n- \n\nPlease let me know if there are any steps to transfer or collaborate on maintenance.\n\nThanks!`);
        // Safely construct issue URL only if project.url is a valid repo URL
        const parsed = sanitizeUrl(project.url);
        if (parsed) {
            try {
                const u = new URL(parsed);
                // Build issues URL from origin + pathname to avoid injection
                const base = `${u.origin}${u.pathname.replace(/\/$/, '')}`;
                const issueUrl = `${base}/issues/new?title=${issueTitle}&body=${issueBody}`;
                interestBtn.href = issueUrl;
                interestBtn.target = '_blank';
                interestBtn.rel = 'noopener noreferrer';
            } catch (e) {
                interestBtn.href = '#';
                interestBtn.addEventListener('click', ev => ev.preventDefault());
            }
        } else {
            interestBtn.href = '#';
            interestBtn.addEventListener('click', ev => ev.preventDefault());
        }
        interestBtn.className = 'btn btn-secondary';
        interestBtn.textContent = 'Express interest';
        actions.appendChild(interestBtn);

        card.appendChild(actions);
        fragment.appendChild(card);
    });

    projectsContainer.appendChild(fragment);

    // If using virtualization, ensure a scroll listener is attached to update window
    if (pageSize === 'all') {
        attachVirtualScroll();
        // Use spacers to preserve overall scroll height
        const total = filteredProjects.length;
        const topHeight = (virtualWindow.start || 0) * cardHeight;
        const bottomHeight = Math.max(0, (total - (virtualWindow.end || 0)) * cardHeight);

        let topSpacer = document.getElementById('virtual-top');
        let bottomSpacer = document.getElementById('virtual-bottom');

        if (!topSpacer) {
            topSpacer = document.createElement('div');
            topSpacer.id = 'virtual-top';
            projectsContainer.insertBefore(topSpacer, projectsContainer.firstChild);
        }
        if (!bottomSpacer) {
            bottomSpacer = document.createElement('div');
            bottomSpacer.id = 'virtual-bottom';
            projectsContainer.appendChild(bottomSpacer);
        }

        topSpacer.style.height = topHeight + 'px';
        bottomSpacer.style.height = bottomHeight + 'px';

        // Measure card height after rendering cards and adjust if necessary
        requestAnimationFrame(() => {
            const firstCard = projectsContainer.querySelector('.project-card');
            if (firstCard) {
                const measured = firstCard.getBoundingClientRect().height;
                if (measured > 10 && Math.abs(measured - cardHeight) / cardHeight > 0.1) {
                    cardHeight = measured;
                    // Recompute window and re-render with updated height
                    const scrollTop = window.scrollY || window.pageYOffset;
                    const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
                    const itemsPerViewport = Math.ceil(viewportHeight / cardHeight) + 2;
                    const firstVisibleIndex = Math.floor(scrollTop / cardHeight) - 2;
                    virtualWindow.start = Math.max(0, firstVisibleIndex);
                    virtualWindow.end = Math.min(filteredProjects.length, virtualWindow.start + itemsPerViewport * 3);
                    // Re-render
                    projectsContainer.innerHTML = '';
                    renderProjects();
                }
            }
        });
    } else {
        detachVirtualScroll();
        // Remove spacers if present
        const topSpacer = document.getElementById('virtual-top');
        const bottomSpacer = document.getElementById('virtual-bottom');
        if (topSpacer) topSpacer.remove();
        if (bottomSpacer) bottomSpacer.remove();
    }
}

function attachVirtualScroll() {
    if (window._virtualScrollAttached) return;
    window._virtualScrollAttached = true;
    window.addEventListener('scroll', onVirtualScroll, { passive: true });
}

function detachVirtualScroll() {
    if (!window._virtualScrollAttached) return;
    window._virtualScrollAttached = false;
    window.removeEventListener('scroll', onVirtualScroll);
}

function onVirtualScroll() {
    // Use requestAnimationFrame to debounce rapid scroll events
    if (_virtualRaf) return;
    _virtualRaf = requestAnimationFrame(() => {
        _virtualRaf = null;
        const scrollTop = window.scrollY || window.pageYOffset;
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
        const itemsPerViewport = Math.ceil(viewportHeight / cardHeight) + 2;
        const firstVisibleIndex = Math.floor(scrollTop / cardHeight) - 2;
        const start = Math.max(0, firstVisibleIndex);
        const end = start + itemsPerViewport * 3;

        // Update virtual window and re-render only if changed
        if (start !== virtualWindow.start || end !== virtualWindow.end) {
            virtualWindow.start = start;
            virtualWindow.end = Math.min(filteredProjects.length, end);
            // Re-render content only (spacers handled in renderProjects)
            projectsContainer.innerHTML = '';
            renderProjects();
        }
    });
}

// Utility: Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Utility: sanitize external URLs to avoid javascript: or other unsafe schemes
function sanitizeUrl(raw) {
    if (!raw) return null;
    try {
        const url = new URL(raw, window.location.href);
        if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
        return url.toString();
    } catch (e) {
        return null;
    }
}

// Utility: Format date as "X months ago"
function formatDateAgo(dateString) {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Unknown';
    const now = new Date();
    const diffMs = now - date;
    if (diffMs < 0) return 'In the future';
    const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));

    if (diffMonths < 1) {
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    }
    return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
}

function computeMaxPages() {
    if (!pageSize || pageSize === 'all') return 1;
    return Math.max(1, Math.ceil(filteredProjects.length / pageSize));
}

function updatePaginationInfo() {
    if (!pageInfo) return;
    const maxPages = computeMaxPages();
    pageInfo.textContent = `Page ${currentPage} of ${maxPages}`;
}

// Note: event listeners and initial load are attached on DOMContentLoaded
