import json
import responses
from scraper import collect


def sample_item():
    return {
        "full_name": "owner/repo",
        "description": "A sample repo",
        "html_url": "https://github.com/owner/repo",
        "stargazers_count": 42,
        "language": "Python",
        "pushed_at": "2024-01-01T00:00:00Z",
        "archived": True,
        "updated_at": "2024-01-01T00:00:00Z",
        "topics": ["sample", "test"],
        "license": {"key": "mit"},
        "forks_count": 1,
        "open_issues_count": 0,
    }


def test_parse_repository_fields():
    item = sample_item()
    repo = collect.parse_repository(item)

    assert repo["name"] == "owner/repo"
    assert repo["description"] == "A sample repo"
    assert repo["url"] == "https://github.com/owner/repo"
    assert repo["stars"] == 42
    assert repo["language"] == "Python"
    assert repo["last_commit"] == "2024-01-01T00:00:00Z"
    assert repo["archived"] is True
    assert repo["topics"] == ["sample", "test"]
    assert repo["license"] == "mit"


def test_should_include_repo_min_stars():
    item = sample_item()
    repo = collect.parse_repository(item)

    assert collect.should_include_repo(repo, 10) is True
    assert collect.should_include_repo(repo, 100) is False


@responses.activate
def test_collect_projects_truncation_and_pagination():
    # Simulate GitHub search API responses with total_count > 1000 to trigger truncation
    base_url = collect.GITHUB_API + '/search/repositories'

    # First page response: total_count huge, items length = PER_PAGE
    first = {
        'total_count': 2000,
        'items': [sample_item() for _ in range(collect.PER_PAGE)]
    }

    # Second page response: also full
    second = {
        'total_count': 2000,
        'items': [sample_item() for _ in range(collect.PER_PAGE)]
    }

    responses.add(responses.GET, base_url, json=first, status=200)
    responses.add(responses.GET, base_url, json=second, status=200)

    projects, truncated = collect.collect_projects(months=1, min_stars=0)

    # Because we mock only two pages of PER_PAGE each, collected length should be 200
    assert isinstance(projects, list)
    assert len(projects) == collect.PER_PAGE * 2
    # truncated should be True because total_count > 1000 (we simulated that)
    assert truncated is True
