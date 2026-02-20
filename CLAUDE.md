# omnifocus-github-sync — Developer Guide

## Project Overview

OmniFocus plugin providing one-way sync from GitHub Issues to OmniFocus. Fetches issues via GitHub's Search API using configurable queries and creates/updates corresponding OmniFocus tasks.

## Plugin Structure

```
omnifocus-github-sync.omnifocusjs/     # Plugin bundle (loaded by OmniFocus)
├── manifest.json                       # Plugin metadata, actions, libraries
└── Resources/
    ├── githubCommon.js                 # Shared library — all core logic
    ├── configureGitHub.js              # Action: configuration UI
    ├── syncGitHub.js                   # Action: incremental sync
    ├── syncGitHubFull.js               # Action: full refresh + orphan cleanup
    └── en.lproj/                       # Localization strings
```

## Architecture

### Three Actions

1. **configureGitHub** — Shows a form for GitHub PAT, search query, tag name, milestone organization. Tests the connection before saving.
2. **syncGitHub** — Incremental sync. Appends `updated:>=<lastSyncTime>` to the search query. Creates new tasks, updates existing ones.
3. **syncGitHubFull** — Full refresh. Fetches all matching issues without date filtering. After processing, marks orphan tasks (present in OmniFocus but not in API results) as complete.

### Shared Library (githubCommon.js)

All core logic lives here:
- HTTP fetch with retry (exponential backoff, rate limit handling)
- GitHub Search API pagination
- Task/project index building (Map-based O(1) lookups)
- Task creation and update logic
- Settings and credentials storage
- Base64 encoding (manual implementation — `btoa()` unavailable)

## Data Storage

### Settings (Preferences)
Key: `githubSync.settings`
```json
{
    "githubUrl": "https://github.com",
    "searchQuery": "is:open assignee:@me repo:owner/repo",
    "tagName": "Work:GitHub",
    "enableProjectOrganization": false,
    "defaultProjectFolder": "",
    "lastSyncTime": "2026-01-15T10:30:00.000Z"
}
```

### Credentials
Service: `com.omnifocus.plugin.github-sync`
- `user`: GitHub username (from /user API)
- `password`: GitHub Personal Access Token

## Task Mapping

- **Task name**: `[owner/repo#123] Issue Title`
- **Issue key regex**: `/^\[([^\]]+#\d+)\]/`
- **Due date**: From `milestone.due_on` (GitHub issues lack native due dates)
- **Notes**: YAML-style frontmatter (URL, status, labels, milestone) + issue body (already Markdown)
- **Status**: `closed` → markComplete(), `open` → markIncomplete()
- **Project**: If milestone organization enabled, tasks grouped under `[milestone-slug] Milestone Title`

## Key Implementation Details

### Authentication
Uses `Authorization: token <PAT>` header (GitHub PAT auth). NOT Basic auth with base64.

Required headers on every request:
```
Accept: application/vnd.github+json
X-GitHub-Api-Version: 2022-11-28
```

### GitHub Search API
- Endpoint: `GET /search/issues?q=<query>&per_page=100&page=N`
- Returns both issues AND pull requests — filter out items with `pull_request` property
- Capped at 1000 results total
- Rate limit: 30 requests/minute for search endpoints
- Incremental sync appends `updated:>=YYYY-MM-DDTHH:MM:SSZ` to query

### Retry Logic
- Max 3 retries (4 total attempts)
- Exponential backoff: 1s, 2s, 4s
- Retryable: 429, 500, 502, 503, 504
- Non-retryable (throw immediately): 400, 401, 403, 404, 422
- Respects `Retry-After` header for 429s (capped at 60s)

### Base64
Custom implementation using 3-bytes-at-a-time bit manipulation. Required because OmniFocus JS runtime lacks `btoa()`.

### Pagination
Pages are 1-indexed. Fetch up to 10 pages (1000 items max — GitHub's limit). Stop when `items.length < per_page` or items is empty.

## OmniFocus API Limitations

- **No `fetch()` or `XMLHttpRequest`** — use `URL.FetchRequest.fromString(url)`
- **No `setTimeout`** — use `Timer.once(seconds, callback)` wrapped in a Promise
- **No `btoa()`** — custom base64 implementation required
- **No Node.js modules** — pure JS only
- **All actions** must be IIFEs returning `PlugIn.Action`
- **Libraries** must be IIFEs returning `PlugIn.Library`
- Access libraries via `this.libraryIdentifier` inside actions

## Testing

1. Copy the `omnifocus-github-sync.omnifocusjs` folder to:
   `~/Library/Mobile Documents/iCloud~com~omnigroup~OmniFocus/Documents/Plug-Ins/`
2. Restart OmniFocus or reload plugins
3. Run **GitHub Settings** from the Automation menu — configure PAT and search query
4. Run **Quick Sync** to test incremental sync
5. Run **Full Refresh** to test full sync with orphan cleanup
6. Check the OmniFocus console (Automation > Show Console) for logs

### Linting
```bash
npm install
npm run lint
```
