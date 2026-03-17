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

            const profile = await lib.pickProfile(profiles, 'Quick Sync');
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
            const lastSyncTime = profile.lastSyncTime || null;

            // Capture start time before fetching so issues updated mid-sync
            // are picked up on the next incremental run
            const syncStartTime = new Date().toISOString();

            // Fetch issues (incremental)
            console.log('Starting incremental sync for profile: ' + profile.name);
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
                    // New issue
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

            // Update last sync time to when we started (not now), so any issues
            // updated during the sync window are caught next time
            profile.lastSyncTime = syncStartTime;
            lib.saveProfile(profile);

            // Show results
            const alert = new Alert(
                'Sync Complete — ' + profile.name,
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
            console.error('Sync error: ' + e.message);
            const alert = new Alert('Sync Failed', e.message);
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
