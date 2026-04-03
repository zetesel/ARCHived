// State
let projects = [];
let filteredProjects = [];

// DOM Elements
const projectsContainer = document.getElementById('projects-container');
const languageFilter = document.getElementById('language-filter');
const starsFilter = document.getElementById('stars-filter');
const starsValue = document.getElementById('stars-value');
const sortBy = document.getElementById('sort-by');
const totalCount = document.getElementById('total-count');
const visibleCount = document.getElementById('visible-count');
const lastUpdated = document.getElementById('last-updated');

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
            const starsNum = Number(p.stars);
            p.stars = Number.isFinite(starsNum) ? starsNum : 0;
            const ts = Date.parse(p.last_commit || '');
            p._last_commit_ts = Number.isFinite(ts) ? ts : 0;
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
    const rawQuery = (document.getElementById && document.getElementById('text-search') && document.getElementById('text-search').value) ? document.getElementById('text-search').value.trim() : '';
    const queryLower = rawQuery.toLowerCase();

    // If using a text search input elsewhere in the docs build, allow for its presence
    let fuseMatches = null;
    if (rawQuery && typeof Fuse !== 'undefined') {
        try {
            const limit = projects.length || 10000;
            const results = new Fuse(projects.map(p => ({ name: p.name || '', description: p.description || '', topics: (p.topics || []).join(' ') })), { keys: ['name', 'description', 'topics'], threshold: 0.4 }).search(rawQuery, { limit });
            fuseMatches = new Set(results.map(r => r.item && r.item.name).filter(Boolean));
        } catch (e) {
            console.warn('Fuse (docs) failed, falling back to substring search', e);
            fuseMatches = null;
        }
    }

    // Filter — if a rawQuery exists do text matching, otherwise simple filters
    filteredProjects = projects.filter(project => {
        const matchesLanguage = selectedLanguage === 'all' || project.language === selectedLanguage;
        const matchesStars = project.stars >= minStars;

        if (rawQuery) {
            if (fuseMatches) {
                const matchesText = fuseMatches.has(project.name);
                return matchesLanguage && matchesStars && matchesText;
            }

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

    // Render
    renderProjects();
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

    filteredProjects.forEach(project => {
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
starsFilter.addEventListener('input', function() {
    starsValue.textContent = parseInt(this.value).toLocaleString();
    applyFilters();
});
sortBy.addEventListener('change', applyFilters);

// Initialize
loadProjects();
