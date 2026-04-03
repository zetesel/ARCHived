// State
let projects = [];
let filteredProjects = [];
let fuse = null;

// DOM Elements
const projectsContainer = document.getElementById('projects-container');
const languageFilter = document.getElementById('language-filter');
const textSearch = document.getElementById('text-search');
const starsFilter = document.getElementById('stars-filter');
const starsValue = document.getElementById('stars-value');
const sortBy = document.getElementById('sort-by');
const totalCount = document.getElementById('total-count');
const visibleCount = document.getElementById('visible-count');
const lastUpdated = document.getElementById('last-updated');
const pageSizeSelect = document.getElementById('page-size');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');
const pageInfo = document.getElementById('page-info');

let currentPage = 1;
let pageSize = parseInt(pageSizeSelect.value || '50', 10);

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
    const query = rawQuery.toLowerCase();

    // Filter
    filteredProjects = projects.filter(project => {
        const matchesLanguage = selectedLanguage === 'all' || project.language === selectedLanguage;
        const matchesStars = project.stars >= minStars;
        // Text search: use Fuse.js if available for fuzzy search
        if (rawQuery) {
            if (fuse) {
                // Fuse is built on a separate lightweight list; perform a fuzzy search to get matches
                const results = fuse.search(rawQuery, { limit: 10000 }).map(r => r.item && r.item.name).filter(Boolean);
                const matchesText = results.indexOf(project.name) !== -1;
                return matchesLanguage && matchesStars && matchesText;
            }

            // Fallback: simple substring search across name/description/topics
            const hay = [project.name, project.description, (project.topics || []).join(' ')].filter(Boolean).join(' ').toLowerCase();
            const matchesText = hay.indexOf(query) !== -1;
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
                return new Date(b.last_commit) - new Date(a.last_commit);
            case 'date-asc':
                return new Date(a.last_commit) - new Date(b.last_commit);
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
    const maxPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
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

    // Determine slice for current page
    const start = (currentPage - 1) * pageSize;
    const end = start + pageSize;
    const pageItems = filteredProjects.slice(start, end);

    pageItems.forEach(project => {
        const card = document.createElement('article');
        card.className = 'project-card';

        // Header with name link and language badge
        const header = document.createElement('div');
        header.className = 'card-header';

        const nameLink = document.createElement('a');
        nameLink.href = project.url;
        nameLink.target = '_blank';
        nameLink.className = 'project-name';
        nameLink.textContent = project.name;
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
        viewBtn.href = project.url;
        viewBtn.target = '_blank';
        viewBtn.className = 'btn btn-primary';
        viewBtn.textContent = 'View on GitHub';
        actions.appendChild(viewBtn);

        // Express interest button: opens a prefilled issue on the repo
        const interestBtn = document.createElement('a');
        // Prefill issue title and body using GitHub's query params
        const issueTitle = encodeURIComponent(`I would like to help maintain ${project.name}`);
        const issueBody = encodeURIComponent(`Hi,\n\nI am interested in helping maintain **${project.name}**.\n\nReasons:\n- \n\nPlease let me know if there are any steps to transfer or collaborate on maintenance.\n\nThanks!`);
        // Use the repo's issues/new URL
        const issueUrl = project.url.replace(/\/$/, '') + `/issues/new?title=${issueTitle}&body=${issueBody}`;
        interestBtn.href = issueUrl;
        interestBtn.target = '_blank';
        interestBtn.className = 'btn btn-secondary';
        interestBtn.textContent = 'Express interest';
        actions.appendChild(interestBtn);

        card.appendChild(actions);
        fragment.appendChild(card);
    });

    projectsContainer.appendChild(fragment);
}

// Utility: Escape HTML to prevent XSS
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Utility: Format date as "X months ago"
function formatDateAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMonths = Math.floor(diffMs / (1000 * 60 * 60 * 24 * 30));

    if (diffMonths < 1) {
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    }
    return `${diffMonths} month${diffMonths !== 1 ? 's' : ''} ago`;
}

// Event Listeners
languageFilter.addEventListener('change', applyFilters);
if (textSearch) textSearch.addEventListener('input', applyFilters);
starsFilter.addEventListener('input', function() {
    starsValue.textContent = parseInt(this.value).toLocaleString();
    applyFilters();
});
sortBy.addEventListener('change', applyFilters);
pageSizeSelect.addEventListener('change', function() {
    pageSize = parseInt(this.value, 10) || 50;
    currentPage = 1;
    applyFilters();
});
prevPageBtn.addEventListener('click', function() {
    if (currentPage > 1) {
        currentPage -= 1;
        applyFilters();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});
nextPageBtn.addEventListener('click', function() {
    const maxPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
    if (currentPage < maxPages) {
        currentPage += 1;
        applyFilters();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
});

function updatePaginationInfo() {
    const maxPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
    pageInfo.textContent = `Page ${currentPage} of ${maxPages}`;
}

// Initialize
loadProjects();
