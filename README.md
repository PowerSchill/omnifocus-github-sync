# omnifocus-github-sync

One-way sync from GitHub Issues to OmniFocus using search queries.

## Features

- Sync GitHub issues to OmniFocus tasks via configurable search queries
- Incremental sync — only fetches recently updated issues
- Full refresh with orphan cleanup — completes tasks for issues no longer matching
- Optional grouping of tasks into OmniFocus projects by repository
- Automatic retry with exponential backoff and rate limit handling
- Secure credential storage via the OmniFocus Credentials API

## Requirements

- OmniFocus 3.10 or later (macOS or iOS)
- A GitHub account with a Personal Access Token

## Installation

1. Download or clone this repository

2. Copy the `omnifocus-github-sync.omnifocusjs` folder to your OmniFocus Plug-Ins directory:

   ```text
   ~/Library/Mobile Documents/iCloud~com~omnigroup~OmniFocus/Documents/Plug-Ins/
   ```

3. Restart OmniFocus (or choose **Automation → Reload All Plug-Ins**)

## Setup

### 1. Create a GitHub Personal Access Token

Go to [GitHub Settings → Tokens](https://github.com/settings/tokens) and create a token with at minimum:

- **Classic token**: `repo` scope (or `public_repo` for public repos only)
- **Fine-grained token**: `Issues: Read-only` permission on the relevant repositories

### 2. Configure the plugin

In OmniFocus, open the **Automation** menu and run **GitHub Settings**. Fill in the following fields:

| Field | Description |
| ----- | ----------- |
| **GitHub URL** | Your GitHub instance URL (default: `https://github.com`) |
| **Personal Access Token** | The PAT you created above |
| **Search Query** | A GitHub issues search query (see examples below) |
| **OmniFocus Tag** | Tag to apply to all synced tasks (e.g., `Work:GitHub`) |
| **Organize by Repository** | Group tasks into OmniFocus projects by `owner/repo` |
| **Default Folder** | Optional: folder to create repository projects in |

Click **Save** — the plugin verifies your token and query before saving.

## Usage

### Quick Sync (Incremental)

Run **Automation → Sync Recent Changes**.

Fetches only issues updated since the last sync. Fast and suitable for frequent use. Creates new tasks for open issues and updates existing ones.

### Full Refresh

Run **Automation → Full Refresh from GitHub**.

Fetches all issues matching your query regardless of last sync time. Also performs **orphan cleanup**: any task tagged with your sync tag whose issue key no longer appears in the API results is marked complete.

Run a Full Refresh after changing your search query or after a long gap between syncs.

## Task Format

Tasks are created with the format:

```text
[owner/repo#123] Issue Title
```

The task note contains a YAML metadata header followed by the issue body:

```yaml
---
URL: https://github.com/owner/repo/issues/123
Status: open
Labels: bug, enhancement
Milestone: v1.0
---

Issue body in Markdown...
```

**Due dates** are set from the milestone's due date (GitHub issues don't have native due dates).

## Search Query Examples

| Query | Description |
| ----- | ----------- |
| `is:open assignee:@me` | All open issues assigned to you |
| `is:open repo:owner/repo` | All open issues in a specific repo |
| `is:open label:bug org:myorg` | All open bugs in an organization |
| `is:open assignee:@me repo:owner/repo1 repo:owner/repo2` | Issues across multiple repos |
| `is:open assignee:@me -label:wontfix` | Exclude issues with a specific label |

See [GitHub's issue search syntax](https://docs.github.com/en/search-github/searching-on-github/searching-issues-and-pull-requests) for the full reference.

## Limitations

- **One-way sync only** — changes made in OmniFocus are not written back to GitHub.
- **Issues only** — pull requests are filtered out automatically.
- **1000-issue cap** — GitHub's Search API returns at most 1000 results. If your query matches more than 1000 issues, narrow it (e.g., add `repo:` or `assignee:` filters). The OmniFocus console logs a warning if this cap is hit.
- **No real-time sync** — run Quick Sync or Full Refresh manually, or use OmniFocus automation to schedule it.

## Troubleshooting

### "Authentication failed" or "Bad credentials"

- Verify your PAT hasn't expired in [GitHub Settings → Tokens](https://github.com/settings/tokens).
- For fine-grained tokens, confirm the token has `Issues: Read-only` permission on the correct repositories.
- Re-run **GitHub Settings** to save a new token.

### No issues are created

- Test your search query directly on [github.com/search](https://github.com/search?type=issues) — the plugin uses the same syntax.
- Check the OmniFocus console (**Automation → Show Console**) for error messages.
- If you changed the query, run a **Full Refresh** rather than Quick Sync.

### Tasks aren't being updated

Quick Sync only fetches issues updated since the last sync. If an issue was updated before the last sync, run a **Full Refresh**.

### Rate limit errors

The plugin automatically retries with exponential backoff when rate-limited (HTTP 429). GitHub's Search API allows 30 requests per minute; a full refresh of 1000 issues requires ~10 requests and is well within the limit under normal use.

### "Sync is not configured"

Run **GitHub Settings** from the Automation menu to complete setup.

## Development

See [CLAUDE.md](CLAUDE.md) for architecture details, API notes, and OmniFocus runtime constraints.

```bash
npm install
npm run lint
```

## License

MIT — see [LICENSE](LICENSE).
