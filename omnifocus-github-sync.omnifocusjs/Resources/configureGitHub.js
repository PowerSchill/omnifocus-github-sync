(() => {
    const action = new PlugIn.Action(async function(_selection) {
        const lib = this.githubCommon;

        try {
            // Migrate legacy settings if needed
            lib.migrateIfNeeded();

            const profiles = lib.getProfiles();

            if (profiles.length === 0) {
                // No profiles — go straight to add form
                await showProfileForm(lib, null);
            } else {
                await showProfilePicker(lib, profiles);
            }

        } catch (e) {
            if (e.message && e.message.indexOf('cancelled') !== -1) {
                return;
            }
            console.error('Configure GitHub error: ' + e.message);
        }
    });

    async function showProfilePicker(lib, profiles) {
        const form = new Form();

        const optionValues = profiles.map(function(p) { return p.id; });
        optionValues.push('__add_new__');

        const optionLabels = profiles.map(function(p) { return p.name; });
        optionLabels.push('+ Add New Profile');

        form.addField(new Form.Field.Option(
            'selection',
            'Profile',
            optionValues,
            optionLabels,
            optionValues[0]
        ));

        await form.show('GitHub Profiles', 'Select');

        const selected = form.values.selection;

        if (selected === '__add_new__') {
            await showProfileForm(lib, null);
        } else {
            const profile = lib.getProfile(selected);
            if (profile) {
                await showProfileForm(lib, profile);
            }
        }
    }

    async function showProfileForm(lib, existingProfile) {
        const isEditing = !!existingProfile;
        const existingCredentials = isEditing ? lib.getCredentials(existingProfile.id) : null;

        const form = new Form();

        form.addField(new Form.Field.String(
            'profileName',
            'Profile Name',
            isEditing ? existingProfile.name : '',
            null
        ));

        form.addField(new Form.Field.String(
            'githubUrl',
            'GitHub URL',
            isEditing ? existingProfile.githubUrl : 'https://github.com',
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
            isEditing ? existingProfile.searchQuery : 'is:open assignee:@me',
            null
        ));

        form.addField(new Form.Field.String(
            'tagName',
            'OmniFocus Tag',
            isEditing ? existingProfile.tagName : '',
            null
        ));

        form.addField(new Form.Field.Checkbox(
            'enableProjectOrganization',
            'Organize by Repository',
            isEditing ? existingProfile.enableProjectOrganization : false
        ));

        form.addField(new Form.Field.String(
            'defaultProjectFolder',
            'Default Folder (optional)',
            isEditing ? (existingProfile.defaultProjectFolder || '') : '',
            null
        ));

        if (isEditing) {
            form.addField(new Form.Field.Checkbox(
                'deleteProfile',
                'Delete This Profile',
                false
            ));
        }

        const formTitle = isEditing ? 'Edit Profile: ' + existingProfile.name : 'Add GitHub Profile';
        await form.show(formTitle, 'Save');

        // Handle deletion
        if (isEditing && form.values.deleteProfile) {
            lib.deleteProfile(existingProfile.id);
            const alert = new Alert('Profile Deleted', 'Profile "' + existingProfile.name + '" has been removed.');
            await alert.show();
            return;
        }

        // Extract values
        const profileName = form.values.profileName;
        const githubUrl = form.values.githubUrl || 'https://github.com';
        const token = form.values.token || (existingCredentials && existingCredentials.token);
        const searchQuery = form.values.searchQuery;
        const tagName = form.values.tagName;
        const enableProjectOrganization = form.values.enableProjectOrganization;
        const defaultProjectFolder = form.values.defaultProjectFolder || '';

        // Validate required fields
        if (!profileName) {
            const alert = new Alert('Validation Error', 'Profile Name is required.');
            await alert.show();
            return;
        }

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

        if (tagName.indexOf('/') !== -1 || tagName.indexOf('\\') !== -1) {
            const alert = new Alert('Validation Error', 'Tag name cannot contain / or \\ characters.');
            await alert.show();
            return;
        }

        // Test connection
        try {
            const result = await lib.testConnection(token, searchQuery);

            const profileId = isEditing ? existingProfile.id : lib.generateProfileId(profileName);

            // Save credentials
            lib.saveCredentials(profileId, result.login, token);

            // Save profile
            const profile = {
                id: profileId,
                name: profileName,
                githubUrl: githubUrl,
                searchQuery: searchQuery,
                tagName: tagName,
                enableProjectOrganization: enableProjectOrganization,
                defaultProjectFolder: defaultProjectFolder,
                lastSyncTime: isEditing ? existingProfile.lastSyncTime : null
            };
            lib.saveProfile(profile);

            // Show success
            const alert = new Alert(
                'Profile Saved',
                'Profile: ' + profileName + '\n' +
                'Authenticated as: ' + result.login + '\n' +
                'Issues matching query: ' + result.totalCount
            );
            await alert.show();

        } catch (e) {
            const alert = new Alert('Connection Failed', e.message);
            await alert.show();
        }
    }

    action.validate = function(_selection) {
        return true;
    };

    return action;
})();
