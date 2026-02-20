(() => {
    const action = new PlugIn.Action(async function(_selection) {
        const lib = this.githubCommon;

        try {
            // Load settings
            const settings = lib.getSettings();
            if (!settings || !settings.searchQuery || !settings.tagName) {
                throw new Error('GitHub Sync is not configured. Please run "GitHub Settings" first.');
            }

            // Load credentials
            const creds = lib.getCredentials();
            if (!creds || !creds.token) {
                throw new Error('GitHub credentials not found. Please run "GitHub Settings" first.');
            }

            const token = creds.token;
            const searchQuery = settings.searchQuery;
            const tagName = settings.tagName;
            const enableProjectOrganization = settings.enableProjectOrganization || false;
            const defaultFolder = settings.defaultProjectFolder || '';

            // Capture start time before fetching so any issues updated during
            // the sync are picked up by the next incremental run
            const syncStartTime = new Date().toISOString();

            // Fetch all issues (full refresh — no date filter)
            console.log('Starting full refresh sync...');
            const issues = await lib.fetchGitHubIssues(token, searchQuery, true, null);
            console.log('Fetched ' + issues.length + ' issues from GitHub');

            // Build indexes
            const taskIndex = lib.buildTaskIndex();
            let projectIndex = null;
            if (enableProjectOrganization) {
                projectIndex = lib.buildProjectIndex();
            }

            // Track all issue keys from the API for orphan detection
            const apiIssueKeys = new Set();

            // Process issues
            let created = 0;
            let updated = 0;
            let completed = 0;
            let reopened = 0;
            let skipped = 0;

            for (const issue of issues) {
                apiIssueKeys.add(issue.key);
                const existingTask = taskIndex.get(issue.key);

                if (existingTask) {
                    const wasCompleted = existingTask.completed;

                    const changed = lib.updateTaskFromGitHubIssue(
                        existingTask, issue.key, issue, tagName,
                        enableProjectOrganization, defaultFolder, projectIndex
                    );

                    if (changed) {
                        if (issue.state === 'closed' && !wasCompleted) {
                            completed++;
                        } else if (issue.state === 'open' && wasCompleted) {
                            reopened++;
                        } else {
                            updated++;
                        }
                    }
                } else {
                    if (issue.state === 'closed') {
                        skipped++;
                        continue;
                    }

                    lib.createTaskFromGitHubIssue(
                        issue.key, issue, tagName,
                        enableProjectOrganization, defaultFolder, projectIndex
                    );
                    created++;
                }
            }

            // ─── Orphan Cleanup ──────────────────────────────────────────
            const tag = lib.findOrCreateTag(tagName);
            const keyPattern = /^\[([^\]]+#\d+)\]/;

            if (tag) {
                for (const task of flattenedTasks) {
                    // Only consider tasks with this tag
                    if (!task.tags.includes(tag)) {
                        continue;
                    }

                    // Skip non-Task objects or tasks with sub-tasks (projects)
                    if (!(task instanceof Task) || (task.children && task.children.length > 0)) {
                        continue;
                    }

                    const match = task.name.match(keyPattern);
                    if (!match) {
                        continue;
                    }

                    const key = match[1];

                    // If key not in API results and task is not completed, mark it complete
                    if (!apiIssueKeys.has(key) && !task.completed) {
                        task.markComplete();
                        completed++;
                    }
                }
            }

            // Update last sync time to when we started (not now)
            settings.lastSyncTime = syncStartTime;
            lib.saveSettings(settings);

            // Show results
            const alert = new Alert(
                'Full Refresh Complete',
                'Created: ' + created + '\n' +
                'Updated: ' + updated + '\n' +
                'Reopened: ' + reopened + '\n' +
                'Completed: ' + completed + '\n' +
                'Skipped: ' + skipped
            );
            await alert.show();

        } catch (e) {
            console.error('Full refresh error: ' + e.message);
            const alert = new Alert('Full Refresh Failed', e.message);
            await alert.show();
        }
    });

    action.validate = function(_selection) {
        const lib = this.githubCommon;
        const settings = lib.getSettings();
        const creds = lib.getCredentials();
        return !!(settings && settings.searchQuery && creds && creds.token);
    };

    return action;
})();
