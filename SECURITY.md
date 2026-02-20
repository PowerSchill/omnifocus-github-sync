# Security Policy

## Credential Handling

Your GitHub Personal Access Token is stored using the **OmniFocus Credentials API**, which persists credentials in the macOS Keychain. The token is never written to disk in plaintext, stored in `Preferences`, or logged to the OmniFocus console.

Logs are scrubbed of sensitive values (`password`, `token`, `authorization`, etc.) before being written to the console.

## Supported Versions

Security fixes are applied to the latest release only.

## Reporting a Vulnerability

Please **do not** open a public GitHub issue for security vulnerabilities.

Instead, report them privately via [GitHub's private vulnerability reporting](https://github.com/powerschill/omnifocus-github-sync/security/advisories/new).

Include:

- A description of the vulnerability
- Steps to reproduce
- Potential impact
- Any suggested mitigations

You can expect an acknowledgement within a few days.
