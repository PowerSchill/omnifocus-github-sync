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
            const lastSyncTime = settings.lastSyncTime || null;

            // Capture start time before fetching so issues updated mid-sync
            // are picked up on the next incremental run
            const syncStartTime = new Date().toISOString();

            // Fetch issues (incremental)
            console.log('Starting incremental sync...');
            const issues = await lib.fetchGitHubIssues(token, searchQuery, false, lastSyncTime);
            console.log('Fetched ' + issues.length + ' issues from GitHub');

            // Build indexes
            const taskIndex = lib.buildTaskIndex();
            let projectIndex = null;
            if (enableProjectOrganization) {
                projectIndex = lib.buildProjectIndex();
            }

            // Process issues
            let created = 0;
            let updated = 0;
            let completed = 0;
            let reopened = 0;
            let skipped = 0;

            for (const issue of issues) {
                const existingTask = taskIndex.get(issue.key);

                if (existingTask) {
                    // Track completion state before update
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
                    // New issue
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

            // Update last sync time to when we started (not now), so any issues
            // updated during the sync window are caught next time
            settings.lastSyncTime = syncStartTime;
            lib.saveSettings(settings);

            // Show results
            const alert = new Alert(
                'Sync Complete',
                'Created: ' + created + '\n' +
                'Updated: ' + updated + '\n' +
                'Reopened: ' + reopened + '\n' +
                'Completed: ' + completed + '\n' +
                'Skipped: ' + skipped
            );
            await alert.show();

        } catch (e) {
            console.error('Sync error: ' + e.message);
            const alert = new Alert('Sync Failed', e.message);
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
