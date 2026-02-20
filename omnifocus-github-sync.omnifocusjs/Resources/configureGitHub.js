(() => {
    const action = new PlugIn.Action(async function(_selection) {
        const lib = this.githubCommon;

        try {
            // Load existing settings and credentials
            const existingSettings = lib.getSettings();
            const existingCredentials = lib.getCredentials();

            // Build the form
            const form = new Form();

            form.addField(new Form.Field.String(
                'githubUrl',
                'GitHub URL',
                (existingSettings && existingSettings.githubUrl) || 'https://github.com',
                null
            ));

            form.addField(new Form.Field.Password(
                'token',
                'Personal Access Token',
                null,
                null
            ));

            form.addField(new Form.Field.String(
                'searchQuery',
                'Search Query',
                (existingSettings && existingSettings.searchQuery) || 'is:open assignee:@me',
                null
            ));

            form.addField(new Form.Field.String(
                'tagName',
                'OmniFocus Tag',
                (existingSettings && existingSettings.tagName) || '',
                null
            ));

            form.addField(new Form.Field.Checkbox(
                'enableProjectOrganization',
                'Organize by Repository',
                (existingSettings && existingSettings.enableProjectOrganization) || false
            ));

            form.addField(new Form.Field.String(
                'defaultProjectFolder',
                'Default Folder (optional)',
                (existingSettings && existingSettings.defaultProjectFolder) || '',
                null
            ));

            // Show form
            await form.show('Configure GitHub Sync', 'Save');

            // Extract values
            const githubUrl = form.values.githubUrl || 'https://github.com';
            const token = form.values.token || (existingCredentials && existingCredentials.token);
            const searchQuery = form.values.searchQuery;
            const tagName = form.values.tagName;
            const enableProjectOrganization = form.values.enableProjectOrganization;
            const defaultProjectFolder = form.values.defaultProjectFolder || '';

            // Validate required fields
            if (!token) {
                const alert = new Alert('Validation Error', 'Personal Access Token is required.');
                await alert.show();
                return;
            }

            if (!searchQuery) {
                const alert = new Alert('Validation Error', 'Search Query is required.');
                await alert.show();
                return;
            }

            if (!tagName) {
                const alert = new Alert('Validation Error', 'OmniFocus Tag is required.');
                await alert.show();
                return;
            }

            // Validate tag name
            if (tagName.indexOf('/') !== -1 || tagName.indexOf('\\') !== -1) {
                const alert = new Alert('Validation Error', 'Tag name cannot contain / or \\ characters.');
                await alert.show();
                return;
            }

            // Test connection
            try {
                const result = await lib.testConnection(token, searchQuery);

                // Save credentials
                lib.saveCredentials(result.login, token);

                // Save settings
                const settings = {
                    githubUrl: githubUrl,
                    searchQuery: searchQuery,
                    tagName: tagName,
                    enableProjectOrganization: enableProjectOrganization,
                    defaultProjectFolder: defaultProjectFolder,
                    lastSyncTime: (existingSettings && existingSettings.lastSyncTime) || null
                };
                lib.saveSettings(settings);

                // Show success
                const alert = new Alert(
                    'Configuration Saved',
                    'Authenticated as: ' + result.login + '\n' +
                    'Issues matching query: ' + result.totalCount
                );
                await alert.show();

            } catch (e) {
                const alert = new Alert('Connection Failed', e.message);
                await alert.show();
            }

        } catch (e) {
            // Ignore user cancellation
            if (e.message && e.message.indexOf('cancelled') !== -1) {
                return;
            }
            console.error('Configure GitHub error: ' + e.message);
        }
    });

    action.validate = function(_selection) {
        return true;
    };

    return action;
})();
