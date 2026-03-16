(() => {
    const action = new PlugIn.Action(async function(_selection) {
        const lib = this.githubCommon;

        try {
            // Migrate legacy settings if needed
            lib.migrateIfNeeded();

            // Load profiles and pick one
            const profiles = lib.getProfiles();
            if (profiles.length === 0) {
                throw new Error('No GitHub profiles configured. Please run "GitHub Settings" first.');
            }

            const profile = await lib.pickProfile(profiles, 'Full Refresh');
            if (!profile) return;

            // Load credentials
            const creds = lib.getCredentials(profile.id);
            if (!creds || !creds.token) {
                throw new Error('Credentials not found for profile "' + profile.name + '". Please reconfigure it.');
            }

            const token = creds.token;
            const searchQuery = profile.searchQuery;
            const tagName = profile.tagName;
            const enableProjectOrganization = profile.enableProjectOrganization || false;
            const defaultFolder = profile.defaultProjectFolder || '';

            // Capture start time before fetching so any issues updated during
            // the sync are picked up by the next incremental run
            const syncStartTime = new Date().toISOString();

            // Fetch all issues (full refresh — no date filter)
            // Replace is:open with is:issue so closed issues are also returned
            // and can be properly marked complete with updated metadata
            const fullQuery = searchQuery.replace(/\bis:open\b/g, 'is:issue');
            console.log('Starting full refresh sync for profile: ' + profile.name);
            const issues = await lib.fetchGitHubIssues(token, fullQuery, true, null);
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
                        enableProjectOrganization, defaultFolder, projectIndex,
                        profile.id
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
                        enableProjectOrganization, defaultFolder, projectIndex,
                        profile.id
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

                    // Scope orphan cleanup to this profile:
                    // only clean up tasks that belong to this profile or have no profile (legacy)
                    const taskProfileId = lib.getProfileIdFromTask(task);
                    if (taskProfileId && taskProfileId !== profile.id) {
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
            profile.lastSyncTime = syncStartTime;
            lib.saveProfile(profile);

            // Show results
            const alert = new Alert(
                'Full Refresh Complete — ' + profile.name,
                'Created: ' + created + '\n' +
                'Updated: ' + updated + '\n' +
                'Reopened: ' + reopened + '\n' +
                'Completed: ' + completed + '\n' +
                'Skipped: ' + skipped
            );
            await alert.show();

        } catch (e) {
            if (e.message && e.message.indexOf('cancelled') !== -1) {
                return;
            }
            console.error('Full refresh error: ' + e.message);
            const alert = new Alert('Full Refresh Failed', e.message);
            await alert.show();
        }
    });

    action.validate = function(_selection) {
        const lib = this.githubCommon;
        lib.migrateIfNeeded();
        const profiles = lib.getProfiles();
        return profiles.length > 0;
    };

    return action;
})();
