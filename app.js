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
        projects = await response.json();
        filteredProjects = [...projects];

        // Update last updated date
        if (projects.length > 0 && projects[0].collected_at) {
            const date = new Date(projects[0].collected_at);
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
    const languages = [...new Set(projects.map(p => p.language).filter(Boolean)].sort();
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

    // Filter
    filteredProjects = projects.filter(project => {
        const matchesLanguage = selectedLanguage === 'all' || project.language === selectedLanguage;
        const matchesStars = project.stars >= minStars;
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

    // Render
    renderProjects();
}

// Render projects to DOM
function renderProjects() {
    if (filteredProjects.length === 0) {
        projectsContainer.innerHTML = `
            <div class="no-results">
                <h3>No projects match your filters</h3>
                <p>Try adjusting your filters to see more results.</p>
            </div>
        `;
        return;
    }

    projectsContainer.innerHTML = filteredProjects.map(project => `
        <article class="project-card">
            <div class="card-header">
                <a href="${project.url}" target="_blank" class="project-name">${escapeHtml(project.name)}</a>
                ${project.language ? `<span class="project-language">${escapeHtml(project.language)}</span>` : ''}
            </div>
            <p class="project-description">${escapeHtml(project.description || 'No description provided')}</p>
            <div class="card-stats">
                <span class="stat-item" title="Stars">
                    ⭐ ${project.stars.toLocaleString()}
                </span>
                <span class="stat-item" title="Last commit">
                    📅 ${formatDateAgo(project.last_commit)}
                </span>
            </div>
            <div class="card-actions">
                <a href="${project.url}" target="_blank" class="btn btn-primary">
                    View on GitHub
                </a>
            </div>
        </article>
    `).join('');
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
