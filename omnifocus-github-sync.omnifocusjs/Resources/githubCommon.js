(() => {
    const githubCommon = new PlugIn.Library(new Version('1.0'));

    // ─── Constants ───────────────────────────────────────────────────────
    githubCommon.CREDENTIAL_SERVICE = 'com.omnifocus.plugin.github-sync';
    githubCommon.SETTINGS_KEY = 'githubSync.settings';
    githubCommon.MAX_RESULTS_PER_PAGE = 100;
    githubCommon.RETRY_MAX_ATTEMPTS = 3;
    githubCommon.RETRY_MAX_DELAY_MS = 60000;
    githubCommon.GITHUB_API_BASE = 'https://api.github.com';

    // ─── Base64 Encoding ─────────────────────────────────────────────────
    githubCommon.base64Encode = function(str) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
        let result = '';
        const bytes = [];
        for (let i = 0; i < str.length; i++) {
            bytes.push(str.charCodeAt(i) & 0xFF);
        }
        for (let i = 0; i < bytes.length; i += 3) {
            const b0 = bytes[i];
            const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
            const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
            result += chars[(b0 >> 2) & 0x3F];
            result += chars[((b0 << 4) | (b1 >> 4)) & 0x3F];
            if (i + 1 < bytes.length) {
                result += chars[((b1 << 2) | (b2 >> 6)) & 0x3F];
            } else {
                result += '=';
            }
            if (i + 2 < bytes.length) {
                result += chars[b2 & 0x3F];
            } else {
                result += '=';
            }
        }
        return result;
    };

    // ─── Safe Logging ────────────────────────────────────────────────────
    const SENSITIVE_KEYS = ['password', 'token', 'authorization', 'access_token', 'accessToken', 'secret', 'key'];

    function redactSensitive(obj) {
        if (obj === null || obj === undefined || typeof obj !== 'object') {
            return obj;
        }
        if (Array.isArray(obj)) {
            return obj.map(redactSensitive);
        }
        const result = {};
        for (const k of Object.keys(obj)) {
            if (SENSITIVE_KEYS.indexOf(k.toLowerCase()) !== -1) {
                result[k] = '***';
            } else {
                result[k] = redactSensitive(obj[k]);
            }
        }
        return result;
    }

    githubCommon.safeLog = function(label, obj) {
        try {
            const clone = JSON.parse(JSON.stringify(obj));
            const redacted = redactSensitive(clone);
            console.log(label + ': ' + JSON.stringify(redacted, null, 2));
        } catch (e) {
            console.log(label + ': [unable to serialize]');
        }
    };

    // ─── Sleep Helper ────────────────────────────────────────────────────
    function sleep(ms) {
        return new Promise(function(resolve) {
            Timer.once(ms / 1000, resolve);
        });
    }

    // ─── HTTP Fetch with Retry ───────────────────────────────────────────
    const RETRYABLE_STATUS_CODES = [429, 500, 502, 503, 504];
    const NON_RETRYABLE_STATUS_CODES = [400, 401, 403, 404, 422];

    githubCommon.fetchWithRetry = async function(request) {
        let lastError = null;
        const maxAttempts = githubCommon.RETRY_MAX_ATTEMPTS + 1;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
                const response = await request.fetch();

                if (response.statusCode >= 200 && response.statusCode < 300) {
                    return response;
                }

                if (NON_RETRYABLE_STATUS_CODES.indexOf(response.statusCode) !== -1) {
                    const errorMsg = githubCommon.createGitHubErrorMessage(response.statusCode, response.bodyString);
                    throw new Error(errorMsg);
                }

                if (RETRYABLE_STATUS_CODES.indexOf(response.statusCode) !== -1) {
                    lastError = new Error(githubCommon.createGitHubErrorMessage(response.statusCode, response.bodyString));

                    if (attempt < maxAttempts - 1) {
                        let delayMs = 1000 * Math.pow(2, attempt);

                        if (response.statusCode === 429) {
                            const retryAfter = response.headers['Retry-After'] || response.headers['retry-after'];
                            if (retryAfter) {
                                const retrySeconds = parseInt(retryAfter, 10);
                                if (!isNaN(retrySeconds)) {
                                    delayMs = Math.min(retrySeconds * 1000, githubCommon.RETRY_MAX_DELAY_MS);
                                }
                            }
                        }

                        delayMs = Math.min(delayMs, githubCommon.RETRY_MAX_DELAY_MS);
                        console.log('Retrying after ' + delayMs + 'ms (attempt ' + (attempt + 1) + '/' + maxAttempts + ')');
                        await sleep(delayMs);
                        continue;
                    }
                }

                const errorMsg = githubCommon.createGitHubErrorMessage(response.statusCode, response.bodyString);
                throw new Error(errorMsg);

            } catch (e) {
                if (e.message && (e.message.indexOf('GitHub API') !== -1 || e.message.indexOf('Authentication') !== -1 || e.message.indexOf('Rate limit') !== -1 || e.message.indexOf('Not found') !== -1 || e.message.indexOf('Validation') !== -1 || e.message.indexOf('Forbidden') !== -1)) {
                    if (NON_RETRYABLE_STATUS_CODES.some(function(code) { return e.message.indexOf('(' + code + ')') !== -1; })) {
                        throw e;
                    }
                }

                lastError = e;

                if (attempt < maxAttempts - 1) {
                    const delayMs = Math.min(1000 * Math.pow(2, attempt), githubCommon.RETRY_MAX_DELAY_MS);
                    console.log('Network error, retrying after ' + delayMs + 'ms (attempt ' + (attempt + 1) + '/' + maxAttempts + ')');
                    await sleep(delayMs);
                } else {
                    throw lastError;
                }
            }
        }

        throw lastError || new Error('Failed after ' + maxAttempts + ' attempts');
    };

    // ─── Error Message Helper ────────────────────────────────────────────
    githubCommon.createGitHubErrorMessage = function(statusCode, bodyString) {
        let detail = '';
        try {
            const body = JSON.parse(bodyString);
            if (body.message) {
                detail = body.message;
            }
            if (body.errors && Array.isArray(body.errors)) {
                const errorDetails = body.errors.map(function(e) {
                    return e.message || e.code || JSON.stringify(e);
                });
                detail += ' (' + errorDetails.join(', ') + ')';
            }
        } catch (_e) {
            detail = bodyString ? bodyString.substring(0, 200) : 'Unknown error';
        }

        switch (statusCode) {
        case 401:
            return 'Authentication failed (' + statusCode + '): Bad credentials. Check your Personal Access Token.';
        case 403:
            if (detail.toLowerCase().indexOf('rate limit') !== -1) {
                return 'Rate limit exceeded (' + statusCode + '): ' + detail;
            }
            return 'Forbidden (' + statusCode + '): ' + detail;
        case 404:
            return 'Not found (' + statusCode + '): ' + detail;
        case 422:
            return 'Validation failed (' + statusCode + '): ' + detail;
        default:
            return 'GitHub API error (' + statusCode + '): ' + detail;
        }
    };

    // ─── Settings Storage ────────────────────────────────────────────────
    // Preferences must be constructed during plug-in loading, not at call time
    const preferences = new Preferences();

    githubCommon.getSettings = function() {
        const raw = preferences.read(githubCommon.SETTINGS_KEY);
        return raw ? JSON.parse(raw) : null;
    };

    githubCommon.saveSettings = function(settings) {
        preferences.write(githubCommon.SETTINGS_KEY, JSON.stringify(settings));
    };

    // ─── Credentials Storage ─────────────────────────────────────────────
    // Credentials must be constructed during plug-in loading, not at call time
    const credentials = new Credentials();

    githubCommon.getCredentials = function() {
        const credential = credentials.read(githubCommon.CREDENTIAL_SERVICE);
        if (!credential) return null;
        return { username: credential.user, token: credential.password };
    };

    githubCommon.saveCredentials = function(username, token) {
        credentials.remove(githubCommon.CREDENTIAL_SERVICE);
        credentials.write(githubCommon.CREDENTIAL_SERVICE, username, token);
    };

    // ─── API Request Builder ─────────────────────────────────────────────
    function buildApiRequest(url, token) {
        const request = URL.FetchRequest.fromString(url);
        request.method = 'GET';
        request.headers = {
            'Authorization': 'token ' + token,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28'
        };
        return request;
    }

    // ─── Test Connection ─────────────────────────────────────────────────
    githubCommon.testConnection = async function(token, searchQuery) {
        // Verify auth by fetching the authenticated user
        const userRequest = buildApiRequest(githubCommon.GITHUB_API_BASE + '/user', token);
        const userResponse = await githubCommon.fetchWithRetry(userRequest);
        const userData = JSON.parse(userResponse.bodyString);
        const login = userData.login;

        // Validate search query
        const encodedQuery = encodeURIComponent(searchQuery);
        const searchUrl = githubCommon.GITHUB_API_BASE + '/search/issues?q=' + encodedQuery + '&per_page=1';
        const searchRequest = buildApiRequest(searchUrl, token);
        const searchResponse = await githubCommon.fetchWithRetry(searchRequest);
        const searchData = JSON.parse(searchResponse.bodyString);
        const totalCount = searchData.total_count;

        return { login: login, totalCount: totalCount };
    };

    // ─── Fetch GitHub Issues ─────────────────────────────────────────────
    githubCommon.fetchGitHubIssues = async function(token, searchQuery, fullRefresh, lastSyncTime) {
        let query = searchQuery;

        // For incremental sync, append date filter
        if (!fullRefresh && lastSyncTime) {
            query += ' updated:>=' + lastSyncTime;
        }

        const allIssues = [];
        let page = 1;
        const maxPages = 10; // GitHub caps search at 1000 results

        while (page <= maxPages) {
            const encodedQuery = encodeURIComponent(query);
            const url = githubCommon.GITHUB_API_BASE + '/search/issues?q=' + encodedQuery +
                '&per_page=' + githubCommon.MAX_RESULTS_PER_PAGE + '&page=' + page;

            const request = buildApiRequest(url, token);
            const response = await githubCommon.fetchWithRetry(request);
            const data = JSON.parse(response.bodyString);

            if (!data.items || data.items.length === 0) {
                break;
            }

            // Filter out pull requests and normalize
            for (let i = 0; i < data.items.length; i++) {
                const item = data.items[i];

                // Skip pull requests
                if (item.pull_request) {
                    continue;
                }

                // Extract owner/repo from repository_url
                // Format: https://api.github.com/repos/owner/repo
                const repoUrlParts = item.repository_url.split('/');
                const owner = repoUrlParts[repoUrlParts.length - 2];
                const repo = repoUrlParts[repoUrlParts.length - 1];
                const issueKey = owner + '/' + repo + '#' + item.number;

                allIssues.push({
                    key: issueKey,
                    number: item.number,
                    owner: owner,
                    repo: repo,
                    title: item.title,
                    body: item.body || '',
                    state: item.state,
                    htmlUrl: item.html_url,
                    labels: (item.labels || []).map(function(l) { return l.name; }),
                    assignee: item.assignee ? item.assignee.login : null,
                    milestone: item.milestone ? {
                        title: item.milestone.title,
                        dueOn: item.milestone.due_on || null
                    } : null,
                    updatedAt: item.updated_at
                });
            }

            // If we got fewer items than per_page, we're done
            if (data.items.length < githubCommon.MAX_RESULTS_PER_PAGE) {
                break;
            }

            page++;
        }

        if (page > maxPages) {
            console.log('Warning: reached GitHub\'s 1000-result cap. Some issues may not have been fetched. Narrow your search query to get all results.');
        }

        return allIssues;
    };

    // ─── Task Index Building ─────────────────────────────────────────────
    githubCommon.buildTaskIndex = function() {
        const index = new Map();
        const pattern = /^\[([^\]]+#\d+)\]/;

        for (const task of flattenedTasks) {
            const match = task.name.match(pattern);
            if (match) {
                index.set(match[1], task);
            }
        }

        return index;
    };

    // ─── Project Index Building ──────────────────────────────────────────
    githubCommon.buildProjectIndex = function() {
        const index = new Map();
        // Match project names in "owner/repo" format
        const pattern = /^[^/\s]+\/[^/\s]+$/;

        for (const project of flattenedProjects) {
            if (pattern.test(project.name)) {
                index.set(project.name, project);
            }
        }

        return index;
    };

    // ─── Tag Helper ──────────────────────────────────────────────────────
    githubCommon.findOrCreateTag = function(tagName) {
        // Support colon-separated nested tags
        const parts = tagName.split(':');
        let currentTag = null;

        for (let i = 0; i < parts.length; i++) {
            const part = parts[i].trim();
            if (i === 0) {
                currentTag = tagNamed(part);
                if (!currentTag) {
                    currentTag = new Tag(part);
                }
            } else {
                let childTag = null;
                for (const t of currentTag.children) {
                    if (t.name === part) {
                        childTag = t;
                        break;
                    }
                }
                if (!childTag) {
                    childTag = new Tag(part, currentTag);
                }
                currentTag = childTag;
            }
        }

        return currentTag;
    };

    // ─── Nested Folder Navigation ────────────────────────────────────────
    githubCommon.findNestedFolder = function(folderPath) {
        if (!folderPath) return null;

        const parts = folderPath.split(':');
        let currentFolder = folderNamed(parts[0]);
        if (!currentFolder) return null;

        for (let i = 1; i < parts.length; i++) {
            let found = null;
            for (const f of currentFolder.folders) {
                if (f.name === parts[i]) {
                    found = f;
                    break;
                }
            }
            if (!found) return null;
            currentFolder = found;
        }

        return currentFolder;
    };

    // ─── Project Organization ────────────────────────────────────────────
    githubCommon.findOrCreateProject = function(repoKey, tagName, defaultFolder, projectIndex) {
        // repoKey is "owner/repo" — used directly as the project name

        // Check project index first
        if (projectIndex && projectIndex.has(repoKey)) {
            return projectIndex.get(repoKey);
        }

        // Fall back to scanning flattenedProjects
        for (const project of flattenedProjects) {
            if (project.name === repoKey) {
                if (projectIndex) {
                    projectIndex.set(repoKey, project);
                }
                return project;
            }
        }

        // Create new project
        let parentFolder = null;
        if (defaultFolder) {
            parentFolder = githubCommon.findNestedFolder(defaultFolder);
        }

        const project = parentFolder ? new Project(repoKey, parentFolder) : new Project(repoKey);
        project.status = Project.Status.Active;

        // Add tag
        const tag = githubCommon.findOrCreateTag(tagName);
        if (tag) {
            project.addTag(tag);
        }

        if (projectIndex) {
            projectIndex.set(repoKey, project);
        }

        return project;
    };

    // ─── Build Notes ─────────────────────────────────────────────────────
    function buildNotes(issue) {
        let notes = '---\n';
        notes += 'URL: ' + issue.htmlUrl + '\n';
        notes += 'Status: ' + issue.state + '\n';

        if (issue.labels.length > 0) {
            notes += 'Labels: ' + issue.labels.join(', ') + '\n';
        }

        if (issue.milestone) {
            notes += 'Milestone: ' + issue.milestone.title + '\n';
        }

        notes += '---\n';

        if (issue.body) {
            notes += '\n' + issue.body;
        }

        return notes;
    }

    // ─── Task Creation ───────────────────────────────────────────────────
    githubCommon.createTaskFromGitHubIssue = function(issueKey, issue, tagName, enableProjectOrganization, defaultFolder, projectIndex) {
        const taskName = '[' + issueKey + '] ' + issue.title;
        const task = new Task(taskName);

        // Set due date from milestone
        if (issue.milestone && issue.milestone.dueOn) {
            task.dueDate = new Date(issue.milestone.dueOn);
        }

        // Set notes
        task.note = buildNotes(issue);

        // Add tag
        const tag = githubCommon.findOrCreateTag(tagName);
        if (tag) {
            task.addTag(tag);
        }

        // Project organization by repository
        if (enableProjectOrganization) {
            const repoKey = issue.owner + '/' + issue.repo;
            const project = githubCommon.findOrCreateProject(
                repoKey, tagName, defaultFolder, projectIndex
            );
            moveTasks([task], project);
        }

        return task;
    };

    // ─── Task Update ─────────────────────────────────────────────────────
    githubCommon.updateTaskFromGitHubIssue = function(task, issueKey, issue, tagName, enableProjectOrganization, defaultFolder, projectIndex) {
        let changed = false;

        // Update name
        const expectedName = '[' + issueKey + '] ' + issue.title;
        if (task.name !== expectedName) {
            task.name = expectedName;
            changed = true;
        }

        // Update due date
        const expectedDueDate = (issue.milestone && issue.milestone.dueOn)
            ? new Date(issue.milestone.dueOn) : null;

        if (expectedDueDate) {
            if (!task.dueDate || task.dueDate.getTime() !== expectedDueDate.getTime()) {
                task.dueDate = expectedDueDate;
                changed = true;
            }
        } else if (task.dueDate) {
            task.dueDate = null;
            changed = true;
        }

        // Update notes
        const expectedNotes = buildNotes(issue);
        if (task.note !== expectedNotes) {
            task.note = expectedNotes;
            changed = true;
        }

        // Update completion status
        if (issue.state === 'closed' && !task.completed) {
            task.markComplete();
            changed = true;
        } else if (issue.state === 'open' && task.completed) {
            task.markIncomplete();
            changed = true;
        }

        // Update project organization by repository
        if (enableProjectOrganization) {
            const repoKey = issue.owner + '/' + issue.repo;
            const project = githubCommon.findOrCreateProject(
                repoKey, tagName, defaultFolder, projectIndex
            );
            if (!task.containingProject || task.containingProject !== project) {
                moveTasks([task], project);
                changed = true;
            }
        }

        return changed;
    };

    return githubCommon;
})();
