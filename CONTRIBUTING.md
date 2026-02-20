# Contributing

Contributions are welcome! Please open an issue to discuss a bug or feature before submitting a pull request.

## Development Setup

```bash
git clone https://github.com/powerschill/omnifocus-github-sync
cd omnifocus-github-sync
npm install
```

Copy the plugin bundle to your OmniFocus Plug-Ins directory (see [README](README.md)) and reload plugins during development via **Automation → Reload All Plug-Ins**.

## Code Style

- Linting is enforced via ESLint. Run `npm run lint` before committing.
- The plugin runs in the OmniFocus JavaScript runtime — no Node.js APIs, no `fetch()`, no `btoa()`. See [CLAUDE.md](CLAUDE.md) for the full list of constraints.
- Prefer explicit `for` loops over `forEach` for compatibility with the OmniFocus runtime.
- Keep all shared logic in `githubCommon.js`. Action files should be thin orchestrators.

## Pull Request Guidelines

- One logical change per PR.
- Include a clear description of what changed and why.
- Run `npm run lint` and confirm it passes before opening the PR.
- If your change affects sync behaviour, test it against a real GitHub account (incremental sync, full refresh, and orphan cleanup).

## Reporting Bugs

Please include:

- OmniFocus version
- macOS version
- The error message from **Automation → Show Console**
- Your search query (redact any sensitive parts)
