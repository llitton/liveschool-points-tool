/**
 * Google Authentication Module
 */
const Auth = {
    // Configuration
    GOOGLE_CLIENT_ID: '931352700202-p5jilug2454vrapq784jasc7gjkjlgiv.apps.googleusercontent.com',
    ALLOWED_DOMAIN: 'liveschoolinc.com',

    /**
     * Initialize authentication
     */
    init: function() {
        // Check for existing session
        const savedUser = this.getSavedUser();
        if (savedUser) {
            this.showApp(savedUser);
            return;
        }

        // Wait for Google Identity Services to load
        if (typeof google !== 'undefined' && google.accounts) {
            this.initGoogleSignIn();
        } else {
            // Retry after a short delay if GIS isn't loaded yet
            setTimeout(() => this.init(), 100);
        }
    },

    /**
     * Initialize Google Sign-In button
     */
    initGoogleSignIn: function() {
        google.accounts.id.initialize({
            client_id: this.GOOGLE_CLIENT_ID,
            callback: (response) => this.handleCredentialResponse(response),
            auto_select: false,
            cancel_on_tap_outside: true
        });

        google.accounts.id.renderButton(
            document.getElementById('google-signin-btn'),
            {
                theme: 'outline',
                size: 'large',
                type: 'standard',
                text: 'signin_with',
                shape: 'rectangular',
                logo_alignment: 'left',
                width: 280
            }
        );
    },

    /**
     * Handle the credential response from Google
     */
    handleCredentialResponse: function(response) {
        const credential = response.credential;
        const payload = this.parseJwt(credential);

        if (!payload) {
            this.showError('Failed to parse authentication response');
            return;
        }

        const email = payload.email;
        const domain = email.split('@')[1];

        if (domain !== this.ALLOWED_DOMAIN) {
            this.showError(`Access denied. Only @${this.ALLOWED_DOMAIN} accounts are allowed.`);
            return;
        }

        // Save user info and show app
        const user = {
            email: email,
            name: payload.name,
            picture: payload.picture,
            exp: payload.exp
        };

        this.saveUser(user);
        this.showApp(user);
    },

    /**
     * Parse JWT token
     */
    parseJwt: function(token) {
        try {
            const base64Url = token.split('.')[1];
            const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
            const jsonPayload = decodeURIComponent(
                atob(base64)
                    .split('')
                    .map(c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
                    .join('')
            );
            return JSON.parse(jsonPayload);
        } catch (e) {
            console.error('Failed to parse JWT:', e);
            return null;
        }
    },

    /**
     * Save user to sessionStorage
     */
    saveUser: function(user) {
        sessionStorage.setItem('liveschool-points-user', JSON.stringify(user));
    },

    /**
     * Get saved user from sessionStorage
     */
    getSavedUser: function() {
        try {
            const saved = sessionStorage.getItem('liveschool-points-user');
            if (!saved) return null;

            const user = JSON.parse(saved);

            // Check if token is expired
            if (user.exp && user.exp * 1000 < Date.now()) {
                this.clearUser();
                return null;
            }

            return user;
        } catch (e) {
            return null;
        }
    },

    /**
     * Clear saved user
     */
    clearUser: function() {
        sessionStorage.removeItem('liveschool-points-user');
    },

    /**
     * Show error message
     */
    showError: function(message) {
        const errorEl = document.getElementById('login-error');
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    },

    /**
     * Show the main app
     */
    showApp: function(user) {
        // Hide login screen
        document.getElementById('login-screen').classList.add('hidden');

        // Show app container
        document.getElementById('app-container').classList.remove('hidden');

        // Display user email
        document.getElementById('user-email').textContent = user.email;

        // Bind sign out
        document.getElementById('sign-out-btn').addEventListener('click', () => this.signOut());
    },

    /**
     * Sign out
     */
    signOut: function() {
        this.clearUser();

        // Revoke Google credentials if available
        if (typeof google !== 'undefined' && google.accounts && google.accounts.id) {
            google.accounts.id.disableAutoSelect();
        }

        // Reload the page to show login screen
        window.location.reload();
    }
};

/**
 * Main Application Logic
 */

const App = {
    // State
    schoolData: null,
    liveSchoolStudents: [],
    selectedNameColumn: null,
    // New: Support for separate first/last name columns
    columnMode: 'combined', // 'combined' or 'separate'
    selectedLastNameColumn: null,
    selectedFirstNameColumn: null,
    tabConfigs: {},
    matchResults: {},
    manualMatches: {},
    currentStep: 1,

    /**
     * Initialize the application
     */
    init: function() {
        this.bindEvents();
        this.loadSavedConfig();
        this.setupDragAndDrop();
        this.updateProgressBar();
    },

    /**
     * Bind event listeners
     */
    bindEvents: function() {
        // File upload handlers
        document.getElementById('school-file').addEventListener('change', (e) => this.handleSchoolFile(e));
        document.getElementById('liveschool-file').addEventListener('change', (e) => this.handleLiveSchoolFile(e));

        // Column mode toggle
        document.querySelectorAll('input[name="column-mode"]').forEach(radio => {
            radio.addEventListener('change', (e) => this.handleColumnModeChange(e.target.value));
        });

        // Column selection
        document.getElementById('confirm-column').addEventListener('click', () => this.confirmColumnSelection());

        // Config field changes - save to localStorage and update summary
        ['roster-id', 'location-id', 'school-id'].forEach(id => {
            document.getElementById(id).addEventListener('change', () => {
                this.saveConfig();
                this.updateSummary();
            });
        });

        // Apply to All Tabs
        document.getElementById('apply-to-all').addEventListener('click', () => this.applyToAllTabs());

        // Matching
        document.getElementById('run-matching').addEventListener('click', () => this.runMatching());

        // Generate scripts
        document.getElementById('generate-scripts').addEventListener('click', () => this.generateScripts());
    },

    /**
     * Setup drag and drop for file uploads
     */
    setupDragAndDrop: function() {
        const schoolDropzone = document.getElementById('school-dropzone');
        const liveschoolDropzone = document.getElementById('liveschool-dropzone');

        // School file dropzone
        this.setupDropzone(schoolDropzone, 'school-file', (file) => {
            this.handleSchoolFile({ target: { files: [file] } });
        });

        // LiveSchool file dropzone
        this.setupDropzone(liveschoolDropzone, 'liveschool-file', (file) => {
            this.handleLiveSchoolFile({ target: { files: [file] } });
        });
    },

    /**
     * Setup a dropzone element
     */
    setupDropzone: function(dropzone, inputId, onDrop) {
        const input = document.getElementById(inputId);

        // Click to open file dialog
        dropzone.addEventListener('click', () => input.click());

        // Drag events
        dropzone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropzone.classList.add('dragover');
        });

        dropzone.addEventListener('dragleave', () => {
            dropzone.classList.remove('dragover');
        });

        dropzone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropzone.classList.remove('dragover');
            const file = e.dataTransfer.files[0];
            if (file) {
                onDrop(file);
            }
        });
    },

    /**
     * Update the progress bar
     */
    updateProgressBar: function() {
        document.querySelectorAll('.progress-step').forEach(step => {
            const stepNum = parseInt(step.dataset.step);
            step.classList.remove('active', 'completed');
            if (stepNum < this.currentStep) {
                step.classList.add('completed');
            } else if (stepNum === this.currentStep) {
                step.classList.add('active');
            }
        });
    },

    /**
     * Unlock a step
     */
    unlockStep: function(stepNum) {
        const step = document.querySelector(`[data-step="${stepNum}"].step`);
        if (step) {
            step.classList.remove('locked');
            if (stepNum > this.currentStep) {
                this.currentStep = stepNum;
                this.updateProgressBar();
            }
        }
    },

    /**
     * Update the sticky summary bar
     */
    updateSummary: function() {
        // School file status
        const schoolSummary = document.getElementById('summary-school-file');
        if (this.schoolData) {
            schoolSummary.querySelector('.summary-icon').textContent = '✓';
            schoolSummary.querySelector('.summary-icon').classList.add('complete');
            schoolSummary.querySelector('.summary-label').textContent = `${this.schoolData.sheetNames.length} tab(s)`;
        }

        // LiveSchool file status
        const liveschoolSummary = document.getElementById('summary-liveschool-file');
        if (this.liveSchoolStudents.length > 0) {
            liveschoolSummary.querySelector('.summary-icon').textContent = '✓';
            liveschoolSummary.querySelector('.summary-icon').classList.add('complete');
            liveschoolSummary.querySelector('.summary-label').textContent = `${this.liveSchoolStudents.length} students`;
        }

        // Config status
        const configSummary = document.getElementById('summary-config');
        const rosterId = document.getElementById('roster-id').value;
        const locationId = document.getElementById('location-id').value;
        const schoolId = document.getElementById('school-id').value;
        if (rosterId && locationId && schoolId) {
            configSummary.querySelector('.summary-icon').textContent = '✓';
            configSummary.querySelector('.summary-icon').classList.add('complete');
            configSummary.querySelector('.summary-label').textContent = 'Configured';
        }

        // Match status
        const matchSummary = document.getElementById('summary-matched');
        if (Object.keys(this.matchResults).length > 0) {
            let totalMatched = 0;
            let totalStudents = 0;
            for (const sheetName in this.matchResults) {
                totalMatched += this.matchResults[sheetName].matched.length;
                totalStudents += this.matchResults[sheetName].matched.length + this.matchResults[sheetName].unmatched.length;
            }
            matchSummary.querySelector('.summary-icon').textContent = '✓';
            matchSummary.querySelector('.summary-icon').classList.add('complete');
            matchSummary.querySelector('.summary-label').textContent = `${totalMatched}/${totalStudents}`;
        }
    },

    /**
     * Handle school XLSX file upload
     */
    handleSchoolFile: async function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const statusEl = document.getElementById('school-file-status');
        const dropzone = document.getElementById('school-dropzone');

        statusEl.textContent = 'Parsing...';
        statusEl.className = 'file-status loading';

        try {
            this.schoolData = await Parser.parseSchoolFile(file);
            statusEl.textContent = `Loaded ${this.schoolData.sheetNames.length} tab(s): ${this.schoolData.sheetNames.join(', ')}`;
            statusEl.className = 'file-status success';
            dropzone.classList.add('has-file');

            this.unlockStep(2);
            this.showColumnSelector();
            this.updateSummary();
            this.checkReadyForBehaviors();
        } catch (error) {
            statusEl.textContent = 'Error: ' + error.message;
            statusEl.className = 'file-status error';
        }
    },

    /**
     * Handle LiveSchool CSV file upload
     */
    handleLiveSchoolFile: async function(event) {
        const file = event.target.files[0];
        if (!file) return;

        const statusEl = document.getElementById('liveschool-file-status');
        const dropzone = document.getElementById('liveschool-dropzone');

        statusEl.textContent = 'Parsing...';
        statusEl.className = 'file-status loading';

        try {
            this.liveSchoolStudents = await Parser.parseLiveSchoolFile(file);
            Matcher.initialize(this.liveSchoolStudents);

            statusEl.textContent = `Loaded ${this.liveSchoolStudents.length} students`;
            statusEl.className = 'file-status success';
            dropzone.classList.add('has-file');

            this.updateSummary();
            this.checkReadyForBehaviors();
        } catch (error) {
            statusEl.textContent = 'Error: ' + error.message;
            statusEl.className = 'file-status error';
        }
    },

    /**
     * Handle column mode change (combined vs separate)
     */
    handleColumnModeChange: function(mode) {
        this.columnMode = mode;

        // Toggle visibility of column selector sections
        const combinedSection = document.getElementById('combined-column-selector');
        const separateSection = document.getElementById('separate-column-selector');

        if (mode === 'combined') {
            combinedSection.classList.remove('hidden');
            separateSection.classList.add('hidden');
        } else {
            combinedSection.classList.add('hidden');
            separateSection.classList.remove('hidden');
        }

        // Reset selections when mode changes
        this.selectedNameColumn = null;
        this.selectedLastNameColumn = null;
        this.selectedFirstNameColumn = null;

        // Clear selection UI
        document.querySelectorAll('.column-option.selected').forEach(el => {
            el.classList.remove('selected');
        });
    },

    /**
     * Show column selector for name column
     */
    showColumnSelector: function() {
        if (!this.schoolData) return;

        const firstSheet = this.schoolData.sheets[this.schoolData.sheetNames[0]];
        const columns = Parser.getColumnInfo(firstSheet);

        // Populate combined column selector
        const combinedContainer = document.getElementById('column-selector');
        combinedContainer.innerHTML = '';

        columns.forEach((col, idx) => {
            const div = document.createElement('div');
            div.className = 'column-option';
            div.dataset.index = idx;
            div.innerHTML = `
                <strong>${col.header}</strong>
                <span class="column-preview">${col.sample.substring(0, 30)}${col.sample.length > 30 ? '...' : ''}</span>
            `;
            div.addEventListener('click', () => this.selectColumn(idx, 'combined'));
            combinedContainer.appendChild(div);
        });

        // Populate last name column selector
        const lastNameContainer = document.getElementById('last-name-column-selector');
        lastNameContainer.innerHTML = '';

        columns.forEach((col, idx) => {
            const div = document.createElement('div');
            div.className = 'column-option';
            div.dataset.index = idx;
            div.dataset.type = 'lastName';
            div.innerHTML = `
                <strong>${col.header}</strong>
                <span class="column-preview">${col.sample.substring(0, 25)}${col.sample.length > 25 ? '...' : ''}</span>
            `;
            div.addEventListener('click', () => this.selectColumn(idx, 'lastName'));
            lastNameContainer.appendChild(div);
        });

        // Populate first name column selector
        const firstNameContainer = document.getElementById('first-name-column-selector');
        firstNameContainer.innerHTML = '';

        columns.forEach((col, idx) => {
            const div = document.createElement('div');
            div.className = 'column-option';
            div.dataset.index = idx;
            div.dataset.type = 'firstName';
            div.innerHTML = `
                <strong>${col.header}</strong>
                <span class="column-preview">${col.sample.substring(0, 25)}${col.sample.length > 25 ? '...' : ''}</span>
            `;
            div.addEventListener('click', () => this.selectColumn(idx, 'firstName'));
            firstNameContainer.appendChild(div);
        });

        this.unlockStep(2);

        // Auto-select based on mode
        if (this.columnMode === 'combined') {
            // Auto-select column that looks like a combined name (contains comma)
            for (let i = 0; i < columns.length; i++) {
                if (columns[i].sample.includes(',') && columns[i].sample.match(/[A-Za-z]/)) {
                    this.selectColumn(i, 'combined');
                    break;
                }
            }
        } else {
            // Auto-select columns that look like last/first name
            const headerLower = columns.map(c => c.header.toLowerCase());

            // Try to find last name column
            for (let i = 0; i < columns.length; i++) {
                if (headerLower[i].includes('last') && headerLower[i].includes('name')) {
                    this.selectColumn(i, 'lastName');
                    break;
                }
            }

            // Try to find first name column
            for (let i = 0; i < columns.length; i++) {
                if (headerLower[i].includes('first') && headerLower[i].includes('name')) {
                    this.selectColumn(i, 'firstName');
                    break;
                }
            }
        }
    },

    /**
     * Select a column
     * @param {number} index - Column index
     * @param {string} type - 'combined', 'lastName', or 'firstName'
     */
    selectColumn: function(index, type = 'combined') {
        if (type === 'combined') {
            this.selectedNameColumn = index;

            // Update combined selector UI
            document.querySelectorAll('#column-selector .column-option').forEach((el, idx) => {
                el.classList.toggle('selected', idx === index);
            });
        } else if (type === 'lastName') {
            this.selectedLastNameColumn = index;

            // Update last name selector UI
            document.querySelectorAll('#last-name-column-selector .column-option').forEach((el, idx) => {
                el.classList.toggle('selected', idx === index);
            });
        } else if (type === 'firstName') {
            this.selectedFirstNameColumn = index;

            // Update first name selector UI
            document.querySelectorAll('#first-name-column-selector .column-option').forEach((el, idx) => {
                el.classList.toggle('selected', idx === index);
            });
        }
    },

    /**
     * Confirm column selection and proceed
     */
    confirmColumnSelection: function() {
        if (this.columnMode === 'combined') {
            if (this.selectedNameColumn === null) {
                alert('Please select the column containing student names.');
                return;
            }
        } else {
            // Separate mode
            if (this.selectedLastNameColumn === null) {
                alert('Please select the Last Name column.');
                return;
            }
            if (this.selectedFirstNameColumn === null) {
                alert('Please select the First Name column.');
                return;
            }
            if (this.selectedLastNameColumn === this.selectedFirstNameColumn) {
                alert('Last Name and First Name columns must be different.');
                return;
            }
        }

        this.unlockStep(3);
        this.checkReadyForBehaviors();
    },

    /**
     * Check if ready to show behavior assignment
     */
    checkReadyForBehaviors: function() {
        if (!this.schoolData || !this.liveSchoolStudents.length) {
            return;
        }

        // Check column selection based on mode
        if (this.columnMode === 'combined') {
            if (this.selectedNameColumn === null) {
                return;
            }
        } else {
            if (this.selectedLastNameColumn === null || this.selectedFirstNameColumn === null) {
                return;
            }
        }

        this.showBehaviorAssignment();
    },

    /**
     * Apply behavior ID and type to all tabs
     */
    applyToAllTabs: function() {
        const behaviorId = document.getElementById('bulk-behavior-id').value;
        const behaviorType = document.getElementById('bulk-behavior-type').value;

        document.querySelectorAll('.behavior-id').forEach(input => {
            input.value = behaviorId;
            const sheet = input.dataset.sheet;
            if (this.tabConfigs[sheet]) {
                this.tabConfigs[sheet].behaviorId = behaviorId;
            }
        });

        document.querySelectorAll('.behavior-type').forEach(select => {
            select.value = behaviorType;
            const sheet = select.dataset.sheet;
            if (this.tabConfigs[sheet]) {
                this.tabConfigs[sheet].behaviorType = behaviorType;
            }
        });
    },

    /**
     * Show behavior assignment for each tab
     */
    showBehaviorAssignment: function() {
        this.unlockStep(3);
        this.unlockStep(4);

        const container = document.getElementById('tab-behavior-list');
        container.innerHTML = '';

        this.schoolData.sheetNames.forEach(sheetName => {
            const sheetData = this.schoolData.sheets[sheetName];

            // Extract students based on column mode
            let students;
            if (this.columnMode === 'combined') {
                students = Parser.extractStudentsFromSheet(sheetData, this.selectedNameColumn);
            } else {
                students = Parser.extractStudentsFromSeparateColumns(
                    sheetData,
                    this.selectedLastNameColumn,
                    this.selectedFirstNameColumn
                );
            }

            const div = document.createElement('div');
            div.className = 'tab-behavior-item';
            div.innerHTML = `
                <div>
                    <label>${sheetName}</label>
                    <span class="tab-student-count">${students.length} students</span>
                </div>
                <input type="text" placeholder="Behavior ID" class="behavior-id" data-sheet="${sheetName}">
                <select class="behavior-type" data-sheet="${sheetName}">
                    <option value="merit">Merit</option>
                    <option value="demerit">Demerit</option>
                </select>
                <input type="text" placeholder="Comment (optional)" class="behavior-comment" data-sheet="${sheetName}">
            `;
            container.appendChild(div);

            // Store student data for this tab
            this.tabConfigs[sheetName] = {
                students,
                behaviorId: '',
                behaviorType: 'merit',
                comment: ''
            };
        });

        // Bind change events
        container.querySelectorAll('.behavior-id').forEach(input => {
            input.addEventListener('change', (e) => {
                const sheet = e.target.dataset.sheet;
                this.tabConfigs[sheet].behaviorId = e.target.value;
            });
        });

        container.querySelectorAll('.behavior-type').forEach(select => {
            select.addEventListener('change', (e) => {
                const sheet = e.target.dataset.sheet;
                this.tabConfigs[sheet].behaviorType = e.target.value;
            });
        });

        container.querySelectorAll('.behavior-comment').forEach(input => {
            input.addEventListener('change', (e) => {
                const sheet = e.target.dataset.sheet;
                this.tabConfigs[sheet].comment = e.target.value;
            });
        });

        this.unlockStep(5);
    },

    /**
     * Run the matching process
     */
    runMatching: function() {
        const btn = document.getElementById('run-matching');
        const btnText = btn.querySelector('.btn-text');
        const btnSpinner = btn.querySelector('.btn-spinner');

        // Show loading state
        btnText.textContent = 'Matching...';
        btnSpinner.classList.remove('hidden');
        btn.disabled = true;

        // Use setTimeout to allow UI to update
        setTimeout(() => {
            this.matchResults = {};
            this.manualMatches = {};

            let totalMatched = 0;
            let totalUnmatched = 0;

            for (const sheetName of this.schoolData.sheetNames) {
                const config = this.tabConfigs[sheetName];
                const results = Matcher.matchAllStudents(config.students);

                this.matchResults[sheetName] = results;
                totalMatched += results.matched.length;
                totalUnmatched += results.unmatched.length;
            }

            const total = totalMatched + totalUnmatched;
            const percentage = total > 0 ? Math.round((totalMatched / total) * 100) : 0;

            // Update UI
            document.getElementById('matched-count').textContent = totalMatched;
            document.getElementById('unmatched-count').textContent = totalUnmatched;
            document.getElementById('match-percentage').textContent = percentage + '%';

            // Traffic light indicator
            const indicator = document.getElementById('match-indicator');
            indicator.classList.remove('green', 'yellow', 'red');
            if (percentage >= 95) {
                indicator.classList.add('green');
            } else if (percentage >= 80) {
                indicator.classList.add('yellow');
            } else {
                indicator.classList.add('red');
            }

            document.getElementById('match-summary').classList.remove('hidden');

            // Show unmatched items if any
            if (totalUnmatched > 0) {
                this.showUnmatchedItems();
            } else {
                document.getElementById('unmatched-list').classList.add('hidden');
            }

            this.unlockStep(6);
            this.updateSummary();

            // Reset button
            btnText.textContent = 'Run Matching';
            btnSpinner.classList.add('hidden');
            btn.disabled = false;
        }, 100);
    },

    /**
     * Show unmatched items for manual resolution
     */
    showUnmatchedItems: function() {
        const container = document.getElementById('unmatched-items');
        container.innerHTML = '';

        const allStudents = Matcher.getAllStudentsForDropdown();

        for (const sheetName of this.schoolData.sheetNames) {
            const results = this.matchResults[sheetName];

            for (const unmatched of results.unmatched) {
                const div = document.createElement('div');
                div.className = 'unmatched-item';
                div.dataset.sheet = sheetName;
                div.dataset.originalName = unmatched.originalName;

                // Build dropdown options
                let optionsHtml = '<option value="">-- No match (skip) --</option>';

                // Add suggestions first
                if (unmatched.suggestions && unmatched.suggestions.length > 0) {
                    optionsHtml += '<optgroup label="Suggestions">';
                    for (const suggestion of unmatched.suggestions) {
                        const s = suggestion.student;
                        optionsHtml += `<option value="${s.id}">${s.lastName}, ${s.firstName} (${suggestion.confidence}% match)</option>`;
                    }
                    optionsHtml += '</optgroup>';
                }

                // Add all students
                optionsHtml += '<optgroup label="All Students">';
                for (const student of allStudents) {
                    optionsHtml += `<option value="${student.id}">${student.displayName}</option>`;
                }
                optionsHtml += '</optgroup>';

                div.innerHTML = `
                    <div class="original-name">${unmatched.originalName}</div>
                    <div class="tab-name">${sheetName}</div>
                    <select class="manual-match-select">${optionsHtml}</select>
                `;

                // Bind change event
                div.querySelector('select').addEventListener('change', (e) => {
                    const studentId = e.target.value;
                    const key = `${sheetName}:${unmatched.originalName}`;

                    if (studentId) {
                        this.manualMatches[key] = studentId;
                        div.classList.add('resolved');
                    } else {
                        delete this.manualMatches[key];
                        div.classList.remove('resolved');
                    }
                });

                container.appendChild(div);
            }
        }

        document.getElementById('unmatched-list').classList.remove('hidden');
    },

    /**
     * Generate the output scripts
     */
    generateScripts: function() {
        const rosterId = document.getElementById('roster-id').value.trim();
        const locationId = document.getElementById('location-id').value.trim();
        const schoolId = document.getElementById('school-id').value.trim();

        if (!rosterId || !locationId || !schoolId) {
            alert('Please fill in Roster ID, Location ID, and School ID in Step 3.');
            return;
        }

        const container = document.getElementById('scripts-output');
        container.innerHTML = '';

        let scriptsGenerated = 0;

        for (const sheetName of this.schoolData.sheetNames) {
            const config = this.tabConfigs[sheetName];
            const results = this.matchResults[sheetName];

            if (!config.behaviorId) {
                continue; // Skip tabs without behavior ID
            }

            // Collect student IDs
            const studentIds = [];

            // Add matched students
            for (const match of results.matched) {
                studentIds.push(match.match.id);
            }

            // Add manually matched students
            for (const unmatched of results.unmatched) {
                const key = `${sheetName}:${unmatched.originalName}`;
                if (this.manualMatches[key]) {
                    studentIds.push(this.manualMatches[key]);
                }
            }

            if (studentIds.length === 0) {
                continue;
            }

            // Generate script
            const script = this.generateScript({
                rosterId,
                locationId,
                schoolId,
                studentIds,
                behaviorId: config.behaviorId,
                behaviorType: config.behaviorType,
                comment: config.comment || ''
            });

            // Create output block with syntax highlighting
            const block = document.createElement('div');
            block.className = 'script-block';
            block.innerHTML = `
                <h4>
                    <span>${sheetName} (${studentIds.length} students)</span>
                    <div class="script-actions">
                        <button class="copy-btn" data-script="${sheetName}">Copy</button>
                        <button class="download-btn" data-script="${sheetName}">Download</button>
                    </div>
                </h4>
                <pre><code class="language-javascript">${this.escapeHtml(script)}</code></pre>
            `;

            // Bind copy button
            block.querySelector('.copy-btn').addEventListener('click', (e) => {
                navigator.clipboard.writeText(script).then(() => {
                    e.target.textContent = 'Copied!';
                    e.target.classList.add('copied');
                    setTimeout(() => {
                        e.target.textContent = 'Copy';
                        e.target.classList.remove('copied');
                    }, 2000);
                });
            });

            // Bind download button
            block.querySelector('.download-btn').addEventListener('click', () => {
                const blob = new Blob([script], { type: 'text/javascript' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${sheetName.replace(/[^a-z0-9]/gi, '_')}_behavior_script.js`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
            });

            container.appendChild(block);
            scriptsGenerated++;
        }

        if (scriptsGenerated === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">⚠️</div>
                    <p>No scripts generated. Make sure you have entered behavior IDs for at least one tab in Step 4.</p>
                </div>
            `;
        } else {
            // Apply syntax highlighting
            Prism.highlightAll();
        }
    },

    /**
     * Generate the script for a single tab
     */
    generateScript: function({ rosterId, locationId, schoolId, studentIds, behaviorId, behaviorType, comment }) {
        const studentsArray = studentIds.join(',');

        // Build comment line only if comment is provided
        const commentLine = comment ? `,\n        comment: "${comment}"` : '';

        return `const BATCH_SIZE = 50; // Process students in batches to avoid API limits
const RETRY_ATTEMPTS = 3; // Number of retry attempts for failed batches
const BATCH_DELAY = 1000; // Delay between batches in ms

async function sendBatch(entry, studentBatch, batchNum, totalBatches, attempt = 1) {
    const payload = {
        time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
        date: new Date().toISOString().split('T')[0],
        roster: entry.roster,
        location: entry.location,
        students: studentBatch,
        school: entry.school,
        behaviors: entry.behaviors,
        comment: entry.comment || ""
    };

    try {
        const response = await fetch("https://api.liveschoolapp.com/v2/conducts", {
            method: "POST",
            headers: {
                "accept": "application/json, text/plain, */*",
                "content-type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.status === 'error') {
            if (attempt < RETRY_ATTEMPTS) {
                console.warn("Batch " + batchNum + "/" + totalBatches + " failed, retrying (attempt " + (attempt + 1) + ")...");
                await new Promise(resolve => setTimeout(resolve, 2000 * attempt)); // Exponential backoff
                return sendBatch(entry, studentBatch, batchNum, totalBatches, attempt + 1);
            }
            console.error("Batch " + batchNum + "/" + totalBatches + " FAILED after " + RETRY_ATTEMPTS + " attempts:", data.error);
            return { success: false, count: 0, failed: studentBatch };
        } else {
            console.log("Batch " + batchNum + "/" + totalBatches + " SUCCESS: " + studentBatch.length + " students");
            return { success: true, count: studentBatch.length };
        }
    } catch (error) {
        if (attempt < RETRY_ATTEMPTS) {
            console.warn("Batch " + batchNum + "/" + totalBatches + " error, retrying (attempt " + (attempt + 1) + ")...");
            await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
            return sendBatch(entry, studentBatch, batchNum, totalBatches, attempt + 1);
        }
        console.error("Batch " + batchNum + "/" + totalBatches + " ERROR after " + RETRY_ATTEMPTS + " attempts:", error);
        return { success: false, count: 0, failed: studentBatch };
    }
}

async function createBehaviorEntry(entry) {
    const allStudents = entry.students.map(Number);
    const totalStudents = allStudents.length;
    const batches = [];

    // Split into batches
    for (let i = 0; i < allStudents.length; i += BATCH_SIZE) {
        batches.push(allStudents.slice(i, i + BATCH_SIZE));
    }

    console.log("Processing " + totalStudents + " students in " + batches.length + " batches of up to " + BATCH_SIZE + "...");

    let successCount = 0;
    let failedStudents = [];

    for (let i = 0; i < batches.length; i++) {
        const result = await sendBatch(entry, batches[i], i + 1, batches.length);
        if (result.success) {
            successCount += result.count;
        } else if (result.failed) {
            failedStudents = failedStudents.concat(result.failed);
        }
        // Delay between batches to avoid rate limiting
        if (i < batches.length - 1) {
            await new Promise(resolve => setTimeout(resolve, BATCH_DELAY));
        }
    }

    console.log("=== COMPLETE ===");
    console.log("Successfully processed: " + successCount + "/" + totalStudents + " students");

    if (failedStudents.length > 0) {
        console.warn("Failed students (" + failedStudents.length + "):", failedStudents);

        // Generate a retry script for failed students
        const retryEntry = {
            ...entry,
            students: failedStudents
        };

        const retryScript = \`
// ========== RETRY SCRIPT FOR FAILED STUDENTS ==========
// Copy and paste this entire block to retry the \${failedStudents.length} failed students

const retryEntry = \${JSON.stringify(retryEntry, null, 2)};

(async () => {
    const batches = [];
    for (let i = 0; i < retryEntry.students.length; i += 50) {
        batches.push(retryEntry.students.slice(i, i + 50));
    }

    console.log("Retrying " + retryEntry.students.length + " students in " + batches.length + " batch(es)...");

    for (let i = 0; i < batches.length; i++) {
        const payload = {
            time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            date: new Date().toISOString().split('T')[0],
            roster: retryEntry.roster,
            location: retryEntry.location,
            students: batches[i],
            school: retryEntry.school,
            behaviors: retryEntry.behaviors,
            comment: retryEntry.comment || ""
        };

        try {
            const response = await fetch("https://api.liveschoolapp.com/v2/conducts", {
                method: "POST",
                headers: { "accept": "application/json, text/plain, */*", "content-type": "application/json" },
                credentials: "include",
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (data.status === 'error') {
                console.error("Retry batch " + (i+1) + " FAILED:", data.error);
            } else {
                console.log("Retry batch " + (i+1) + " SUCCESS: " + batches[i].length + " students");
            }
        } catch (error) {
            console.error("Retry batch " + (i+1) + " ERROR:", error);
        }

        if (i < batches.length - 1) await new Promise(r => setTimeout(r, 2000));
    }
    console.log("Retry complete!");
})();
// ========== END RETRY SCRIPT ==========
\`;

        console.log(retryScript);
    }

    return { successCount, failedStudents };
}

const entries = [
    {
        roster: ${rosterId},
        location: ${locationId},
        students: [${studentsArray}],
        school: ${schoolId},
        behaviors: { ${behaviorId}: { type: "${behaviorType}" } }${commentLine}
    }
];

// Run for all entries
(async () => {
    for (const entry of entries) {
        await createBehaviorEntry(entry);
    }
    console.log("All entries processed!");
})();`;
    },

    /**
     * Save config to localStorage
     */
    saveConfig: function() {
        const config = {
            rosterId: document.getElementById('roster-id').value,
            locationId: document.getElementById('location-id').value,
            schoolId: document.getElementById('school-id').value
        };
        localStorage.setItem('liveschool-points-config', JSON.stringify(config));
    },

    /**
     * Load saved config from localStorage
     */
    loadSavedConfig: function() {
        try {
            const saved = localStorage.getItem('liveschool-points-config');
            if (saved) {
                const config = JSON.parse(saved);
                if (config.rosterId) document.getElementById('roster-id').value = config.rosterId;
                if (config.locationId) document.getElementById('location-id').value = config.locationId;
                if (config.schoolId) document.getElementById('school-id').value = config.schoolId;
            }
        } catch (e) {
            // Ignore errors
        }
    },

    /**
     * Escape HTML for safe display
     */
    escapeHtml: function(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

/**
 * Demo Data Generator Application Logic
 */
const DemoApp = {
    // State
    currentMode: 'assign',
    students: [],
    behaviors: [],

    /**
     * Initialize demo mode
     */
    init: function() {
        this.bindModeToggle();
        this.bindDemoEvents();
        this.loadSavedDemoConfig();
        this.setDefaultDates();
        this.generateDiscoveryScript();
    },

    /**
     * Bind mode toggle events
     */
    bindModeToggle: function() {
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const mode = e.target.dataset.mode;
                this.switchMode(mode);
            });
        });
    },

    /**
     * Switch between assign, demo, and balance modes
     */
    switchMode: function(mode) {
        this.currentMode = mode;

        // Update toggle buttons
        document.querySelectorAll('.mode-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.mode === mode);
        });

        // Update summary bars
        document.querySelector('.assign-summary').classList.toggle('hidden', mode !== 'assign');
        document.querySelector('.demo-summary').classList.toggle('hidden', mode !== 'demo');
        document.querySelector('.balance-summary').classList.toggle('hidden', mode !== 'balance');

        // Show/hide appropriate sections
        document.querySelectorAll('.assign-step').forEach(el => {
            el.classList.toggle('hidden', mode !== 'assign');
        });
        document.querySelectorAll('.demo-step').forEach(el => {
            el.classList.toggle('hidden', mode !== 'demo');
        });
        document.querySelectorAll('.balance-step').forEach(el => {
            el.classList.toggle('hidden', mode !== 'balance');
        });
    },

    /**
     * Bind demo mode event listeners
     */
    bindDemoEvents: function() {
        // File upload
        const dropzone = document.getElementById('demo-liveschool-dropzone');
        const fileInput = document.getElementById('demo-liveschool-file');

        if (dropzone && fileInput) {
            dropzone.addEventListener('click', () => fileInput.click());

            dropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                dropzone.classList.add('dragover');
            });

            dropzone.addEventListener('dragleave', () => {
                dropzone.classList.remove('dragover');
            });

            dropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropzone.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file) this.handleFileUpload(file);
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files[0]) this.handleFileUpload(e.target.files[0]);
            });
        }

        // Config field changes
        ['demo-roster-id', 'demo-location-id', 'demo-school-id'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => {
                    this.saveDemoConfig();
                    this.updateDemoSummary();
                    this.checkDemoStepsUnlock();
                });
            }
        });

        // Discovery script toggle
        const showDiscoveryBtn = document.getElementById('show-discovery-script');
        if (showDiscoveryBtn) {
            showDiscoveryBtn.addEventListener('click', () => {
                const container = document.getElementById('discovery-script-container');
                const isHidden = container.classList.contains('hidden');
                container.classList.toggle('hidden');
                showDiscoveryBtn.textContent = isHidden ? 'Hide Discovery Script' : 'Show Behavior Discovery Script';
            });
        }

        // Copy discovery script
        const copyDiscoveryBtn = document.getElementById('copy-discovery-script');
        if (copyDiscoveryBtn) {
            copyDiscoveryBtn.addEventListener('click', () => {
                const script = this.getDiscoveryScriptText();
                navigator.clipboard.writeText(script).then(() => {
                    copyDiscoveryBtn.textContent = 'Copied!';
                    copyDiscoveryBtn.classList.add('copied');
                    setTimeout(() => {
                        copyDiscoveryBtn.textContent = 'Copy Script';
                        copyDiscoveryBtn.classList.remove('copied');
                    }, 2000);
                });
            });
        }

        // Import behaviors
        const importBehaviorsBtn = document.getElementById('import-behaviors');
        if (importBehaviorsBtn) {
            importBehaviorsBtn.addEventListener('click', () => this.importBehaviors());
        }

        // Add behavior
        const addBehaviorBtn = document.getElementById('add-behavior');
        if (addBehaviorBtn) {
            addBehaviorBtn.addEventListener('click', () => this.addBehavior());
        }

        // Ratio selector
        const ratioSelect = document.getElementById('demo-ratio');
        if (ratioSelect) {
            ratioSelect.addEventListener('change', (e) => {
                const customInputs = document.getElementById('custom-ratio-inputs');
                customInputs.classList.toggle('hidden', e.target.value !== 'custom');
                this.updatePreview();
            });
        }

        // Settings changes trigger preview update
        ['demo-start-date', 'demo-end-date', 'demo-min-points', 'demo-max-points',
         'demo-custom-positive', 'demo-custom-negative'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => this.updatePreview());
            }
        });

        // Generate demo script
        const generateBtn = document.getElementById('generate-demo-script');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateDemoScript());
        }
    },

    /**
     * Handle file upload
     */
    handleFileUpload: async function(file) {
        const statusEl = document.getElementById('demo-liveschool-file-status');
        const dropzone = document.getElementById('demo-liveschool-dropzone');

        statusEl.textContent = 'Parsing...';
        statusEl.className = 'file-status loading';

        try {
            this.students = await Parser.parseLiveSchoolFile(file);
            statusEl.textContent = `Loaded ${this.students.length} students`;
            statusEl.className = 'file-status success';
            dropzone.classList.add('has-file');

            this.updateDemoSummary();
            this.checkDemoStepsUnlock();
        } catch (error) {
            statusEl.textContent = 'Error: ' + error.message;
            statusEl.className = 'file-status error';
        }
    },

    /**
     * Set default dates
     */
    setDefaultDates: function() {
        const today = new Date();
        const endDateEl = document.getElementById('demo-end-date');
        const startDateEl = document.getElementById('demo-start-date');

        if (endDateEl) {
            endDateEl.value = today.toISOString().split('T')[0];
        }

        // Default start date: 3 months ago
        if (startDateEl) {
            const threeMonthsAgo = new Date(today);
            threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);
            startDateEl.value = threeMonthsAgo.toISOString().split('T')[0];
        }
    },

    /**
     * Generate the behavior discovery script
     */
    generateDiscoveryScript: function() {
        const script = this.getDiscoveryScriptText();
        const codeEl = document.getElementById('discovery-script-code');
        if (codeEl) {
            codeEl.textContent = script;
            if (typeof Prism !== 'undefined') {
                Prism.highlightElement(codeEl);
            }
        }
    },

    /**
     * Get the discovery script text
     */
    getDiscoveryScriptText: function() {
        return `// LiveSchool Behavior Discovery - Paste in console
(async () => {
    const schoolId = (window.location.href.match(/school=(\\d+)/) || [])[1] || prompt('School ID:');
    if (!schoolId) return;
    const r = await fetch(\`https://api.liveschoolapp.com/v2/schools/\${schoolId}/behaviors\`, { credentials: 'include' });
    const d = await r.json();
    const behaviors = (d.items || d.behaviors || d).filter(b => !b.hidden);
    const result = behaviors.map(b => ({ id: String(b.id), name: b.name, type: b.type === 'positive' ? 'merit' : 'demerit' }));
    console.log('=== COPY THIS JSON ===');
    console.log(JSON.stringify(result));
    console.log('=== BEHAVIORS ===');
    result.filter(b => b.type === 'merit').forEach(b => console.log(\`+ \${b.id}: \${b.name}\`));
    result.filter(b => b.type === 'demerit').forEach(b => console.log(\`- \${b.id}: \${b.name}\`));
})();`;
    },

    /**
     * Import behaviors from JSON
     */
    importBehaviors: function() {
        const textarea = document.getElementById('import-behaviors-json');
        const jsonText = textarea.value.trim();

        if (!jsonText) {
            alert('Please paste the JSON from the response tab');
            return;
        }

        try {
            const imported = JSON.parse(jsonText);

            // Handle different formats
            let behaviors = [];

            if (Array.isArray(imported)) {
                // Already an array
                behaviors = imported;
            } else if (imported.items && typeof imported.items === 'object') {
                // LiveSchool format: { items: { "12345": {...}, "12346": {...} } }
                behaviors = Object.values(imported.items);
            } else if (typeof imported === 'object') {
                // Just the items object: { "12345": {...}, "12346": {...} }
                behaviors = Object.values(imported);
            }

            let added = 0;
            let skipped = 0;

            for (const b of behaviors) {
                if (!b.id) continue;

                const id = String(b.id).trim();
                const name = b.name || `Behavior ${id}`;

                // Handle type: "positive", "negative", "both", "merit", "demerit"
                // "both" types will be added as merit (positive) since they can be used either way
                let type;
                if (b.type === 'negative' || b.type === 'demerit') {
                    type = 'demerit';
                } else {
                    type = 'merit'; // positive, both, merit all become merit
                }

                // Skip duplicates
                if (this.behaviors.find(existing => existing.id === id)) {
                    skipped++;
                    continue;
                }

                // Skip hidden behaviors
                if (b.hidden) {
                    continue;
                }

                this.behaviors.push({ id, name, type });
                added++;
            }

            this.renderBehaviorList();
            this.updateDemoSummary();
            this.checkDemoStepsUnlock();

            textarea.value = '';
            alert(`Imported ${added} behaviors` + (skipped > 0 ? ` (${skipped} duplicates skipped)` : ''));

        } catch (error) {
            console.error('Import error:', error);
            alert('Invalid JSON format. Copy the entire response from the Network tab\'s Response section.');
        }
    },

    /**
     * Add a behavior to the list
     */
    addBehavior: function() {
        const idInput = document.getElementById('new-behavior-id');
        const nameInput = document.getElementById('new-behavior-name');
        const typeSelect = document.getElementById('new-behavior-type');

        const id = idInput.value.trim();
        const name = nameInput.value.trim() || `Behavior ${id}`;
        const type = typeSelect.value;

        if (!id) {
            alert('Please enter a behavior ID');
            return;
        }

        // Check for duplicates
        if (this.behaviors.find(b => b.id === id)) {
            alert('This behavior ID is already added');
            return;
        }

        this.behaviors.push({ id, name, type });
        this.renderBehaviorList();
        this.updateDemoSummary();
        this.checkDemoStepsUnlock();

        // Clear inputs
        idInput.value = '';
        nameInput.value = '';
        typeSelect.value = 'merit';
    },

    /**
     * Remove a behavior from the list
     */
    removeBehavior: function(id) {
        this.behaviors = this.behaviors.filter(b => b.id !== id);
        this.renderBehaviorList();
        this.updateDemoSummary();
        this.checkDemoStepsUnlock();
    },

    /**
     * Render the behavior list
     */
    renderBehaviorList: function() {
        const container = document.getElementById('behavior-list');

        if (this.behaviors.length === 0) {
            container.innerHTML = `
                <div class="empty-state small">
                    <p>No behaviors added yet</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.behaviors.map(b => `
            <div class="behavior-item">
                <div class="behavior-item-info">
                    <span class="behavior-item-id">${this.escapeHtml(b.id)}</span>
                    <span class="behavior-item-name">${this.escapeHtml(b.name)}</span>
                    <span class="behavior-item-type ${b.type}">${b.type}</span>
                </div>
                <button class="behavior-item-remove" data-id="${b.id}" title="Remove">&times;</button>
            </div>
        `).join('');

        // Bind remove buttons
        container.querySelectorAll('.behavior-item-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.removeBehavior(e.target.dataset.id);
            });
        });
    },

    /**
     * Check and unlock demo steps based on completion
     */
    checkDemoStepsUnlock: function() {
        // Step 2 (Config) - unlocks when students are loaded
        const configStep = document.getElementById('demo-step-config');
        if (this.students.length > 0) {
            configStep.classList.remove('locked');
        }

        // Step 3 (Behaviors) - unlocks when config is filled
        const rosterId = document.getElementById('demo-roster-id').value.trim();
        const locationId = document.getElementById('demo-location-id').value.trim();
        const schoolId = document.getElementById('demo-school-id').value.trim();

        const behaviorsStep = document.getElementById('demo-step-behaviors');
        if (rosterId && locationId && schoolId) {
            behaviorsStep.classList.remove('locked');
        }

        // Step 4 (Settings) - unlocks when behaviors are added
        const settingsStep = document.getElementById('demo-step-settings');
        const hasMerit = this.behaviors.some(b => b.type === 'merit');
        const hasDemerit = this.behaviors.some(b => b.type === 'demerit');

        if (hasMerit && hasDemerit) {
            settingsStep.classList.remove('locked');
            this.updatePreview();
        }

        // Step 5 (Generate) - unlocks when settings are valid
        const generateStep = document.getElementById('demo-step-generate');
        const startDate = document.getElementById('demo-start-date').value;
        const endDate = document.getElementById('demo-end-date').value;

        if (startDate && endDate && hasMerit && hasDemerit) {
            generateStep.classList.remove('locked');
        }
    },

    /**
     * Update demo summary bar
     */
    updateDemoSummary: function() {
        // Students
        const studentsSummary = document.getElementById('demo-summary-students');
        if (this.students.length > 0) {
            studentsSummary.querySelector('.summary-icon').textContent = '✓';
            studentsSummary.querySelector('.summary-icon').classList.add('complete');
            studentsSummary.querySelector('.summary-label').textContent = `${this.students.length} students`;
        }

        // Config
        const configSummary = document.getElementById('demo-summary-config');
        const rosterId = document.getElementById('demo-roster-id').value.trim();
        const locationId = document.getElementById('demo-location-id').value.trim();
        const schoolId = document.getElementById('demo-school-id').value.trim();

        if (rosterId && locationId && schoolId) {
            configSummary.querySelector('.summary-icon').textContent = '✓';
            configSummary.querySelector('.summary-icon').classList.add('complete');
            configSummary.querySelector('.summary-label').textContent = 'Configured';
        }

        // Behaviors
        const behaviorsSummary = document.getElementById('demo-summary-behaviors');
        if (this.behaviors.length > 0) {
            behaviorsSummary.querySelector('.summary-icon').textContent = '✓';
            behaviorsSummary.querySelector('.summary-icon').classList.add('complete');
            behaviorsSummary.querySelector('.summary-label').textContent = `${this.behaviors.length} behaviors`;
        }

        // Settings
        const settingsSummary = document.getElementById('demo-summary-settings');
        const startDate = document.getElementById('demo-start-date').value;
        const endDate = document.getElementById('demo-end-date').value;

        if (startDate && endDate) {
            settingsSummary.querySelector('.summary-icon').textContent = '✓';
            settingsSummary.querySelector('.summary-icon').classList.add('complete');
            settingsSummary.querySelector('.summary-label').textContent = 'Ready';
        }
    },

    /**
     * Get weekdays between two dates
     */
    getWeekdays: function(startDate, endDate) {
        const weekdays = [];
        const current = new Date(startDate);
        const end = new Date(endDate);

        while (current <= end) {
            const day = current.getDay();
            if (day !== 0 && day !== 6) { // Not Sunday (0) or Saturday (6)
                weekdays.push(new Date(current));
            }
            current.setDate(current.getDate() + 1);
        }

        return weekdays;
    },

    /**
     * Get random time between 8:00 AM and 3:30 PM
     */
    getRandomSchoolTime: function() {
        // 8:00 AM = 8*60 = 480 minutes
        // 3:30 PM = 15*60 + 30 = 930 minutes
        const minMinutes = 480;
        const maxMinutes = 930;
        const randomMinutes = Math.floor(Math.random() * (maxMinutes - minMinutes + 1)) + minMinutes;

        const hours = Math.floor(randomMinutes / 60);
        const minutes = randomMinutes % 60;
        const seconds = Math.floor(Math.random() * 60);

        return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    },

    /**
     * Get the ratio values
     */
    getRatio: function() {
        const ratioSelect = document.getElementById('demo-ratio');

        if (ratioSelect.value === 'custom') {
            const positive = parseInt(document.getElementById('demo-custom-positive').value) || 4;
            const negative = parseInt(document.getElementById('demo-custom-negative').value) || 1;
            return { positive, negative };
        }

        const ratio = parseInt(ratioSelect.value) || 4;
        return { positive: ratio, negative: 1 };
    },

    /**
     * Update the preview section
     */
    updatePreview: function() {
        const previewEl = document.getElementById('demo-preview');
        if (!previewEl) return;

        const startDate = document.getElementById('demo-start-date').value;
        const endDate = document.getElementById('demo-end-date').value;
        const minPoints = parseInt(document.getElementById('demo-min-points').value) || 15;
        const maxPoints = parseInt(document.getElementById('demo-max-points').value) || 40;

        if (!startDate || !endDate || this.students.length === 0) {
            previewEl.classList.add('hidden');
            return;
        }

        const weekdays = this.getWeekdays(startDate, endDate);
        const ratio = this.getRatio();
        const avgPoints = Math.round((minPoints + maxPoints) / 2);
        const totalPoints = this.students.length * avgPoints;

        const positiveRatio = ratio.positive / (ratio.positive + ratio.negative);
        const positivePoints = Math.round(totalPoints * positiveRatio);
        const negativePoints = totalPoints - positivePoints;

        document.getElementById('preview-students').textContent = this.students.length;
        document.getElementById('preview-dates').textContent = `${startDate} to ${endDate}`;
        document.getElementById('preview-weekdays').textContent = weekdays.length;
        document.getElementById('preview-total-points').textContent = `~${totalPoints.toLocaleString()}`;
        document.getElementById('preview-positive').textContent = `~${positivePoints.toLocaleString()}`;
        document.getElementById('preview-negative').textContent = `~${negativePoints.toLocaleString()}`;

        previewEl.classList.remove('hidden');
    },

    /**
     * Generate the demo script
     */
    generateDemoScript: function() {
        const rosterId = document.getElementById('demo-roster-id').value.trim();
        const locationId = document.getElementById('demo-location-id').value.trim();
        const schoolId = document.getElementById('demo-school-id').value.trim();
        const startDate = document.getElementById('demo-start-date').value;
        const endDate = document.getElementById('demo-end-date').value;
        const minPoints = parseInt(document.getElementById('demo-min-points').value) || 15;
        const maxPoints = parseInt(document.getElementById('demo-max-points').value) || 40;
        const ratio = this.getRatio();

        // Validation
        if (!rosterId || !locationId || !schoolId) {
            alert('Please fill in all site configuration fields');
            return;
        }

        if (!startDate || !endDate) {
            alert('Please select start and end dates');
            return;
        }

        const meritBehaviors = this.behaviors.filter(b => b.type === 'merit');
        const demeritBehaviors = this.behaviors.filter(b => b.type === 'demerit');

        if (meritBehaviors.length === 0 || demeritBehaviors.length === 0) {
            alert('Please add at least one merit and one demerit behavior');
            return;
        }

        const studentIds = this.students.map(s => s.id);
        const weekdays = this.getWeekdays(startDate, endDate);

        const script = this.buildDemoScript({
            rosterId,
            locationId,
            schoolId,
            studentIds,
            meritBehaviors,
            demeritBehaviors,
            weekdays,
            minPoints,
            maxPoints,
            ratio
        });

        // Display the script
        const container = document.getElementById('demo-scripts-output');
        container.innerHTML = `
            <div class="script-block">
                <h4>
                    <span>Demo Data Script (${this.students.length} students, ${weekdays.length} days)</span>
                    <div class="script-actions">
                        <button class="copy-btn" id="copy-demo-script">Copy</button>
                        <button class="download-btn" id="download-demo-script">Download</button>
                    </div>
                </h4>
                <pre><code class="language-javascript">${this.escapeHtml(script)}</code></pre>
            </div>
        `;

        // Bind buttons
        document.getElementById('copy-demo-script').addEventListener('click', (e) => {
            navigator.clipboard.writeText(script).then(() => {
                e.target.textContent = 'Copied!';
                e.target.classList.add('copied');
                setTimeout(() => {
                    e.target.textContent = 'Copy';
                    e.target.classList.remove('copied');
                }, 2000);
            });
        });

        document.getElementById('download-demo-script').addEventListener('click', () => {
            const blob = new Blob([script], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `demo_data_${schoolId}_${new Date().toISOString().split('T')[0]}.js`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        if (typeof Prism !== 'undefined') {
            Prism.highlightAll();
        }
    },

    /**
     * Build the demo script content
     */
    buildDemoScript: function({ rosterId, locationId, schoolId, studentIds, meritBehaviors, demeritBehaviors, weekdays, minPoints, maxPoints, ratio }) {
        const weekdayStrings = weekdays.map(d => d.toISOString().split('T')[0]);

        return `/**
 * LiveSchool Demo Data Generator
 * Generated: ${new Date().toISOString()}
 *
 * Students: ${studentIds.length}
 * Date Range: ${weekdayStrings[0]} to ${weekdayStrings[weekdayStrings.length - 1]}
 * Weekdays: ${weekdays.length}
 * Points per student: ${minPoints}-${maxPoints}
 * Ratio: ${ratio.positive}:${ratio.negative} (positive:negative)
 */

const CONFIG = {
    roster: ${rosterId},
    location: ${locationId},
    school: ${schoolId},
    students: [${studentIds.join(',')}],
    meritBehaviors: ${JSON.stringify(meritBehaviors.map(b => b.id))},
    demeritBehaviors: ${JSON.stringify(demeritBehaviors.map(b => b.id))},
    weekdays: ${JSON.stringify(weekdayStrings)},
    minPoints: ${minPoints},
    maxPoints: ${maxPoints},
    positiveRatio: ${ratio.positive},
    negativeRatio: ${ratio.negative},
    batchSize: 50,
    batchDelay: 1000,
    retryAttempts: 3,
    // Random comments for more realistic demo data (PBIS-aligned)
    // 50% chance of comment for positive points (20 empty + 20 behavior-specific praise)
    positiveComments: [
        "", "", "", "", "", "", "", "", "", "",
        "", "", "", "", "", "", "", "", "", "",
        // Behavior-specific praise following PBIS best practices
        "Thank you for following directions the first time",
        "Great job staying focused during the lesson",
        "I appreciate how you worked quietly at your desk",
        "Nice job being prepared with all your materials today",
        "Thank you for raising your hand and waiting to be called on",
        "Excellent job showing respect to your classmates",
        "Great work staying on task during independent work time",
        "I noticed you helping a classmate - great teamwork!",
        "Thank you for transitioning quickly and quietly",
        "Nice job actively participating in the discussion",
        "Great example of being responsible with your materials",
        "I appreciate you following our classroom expectations",
        "Excellent focus during the entire lesson",
        "Thank you for being a positive role model for others",
        "Great job keeping your hands and feet to yourself",
        "I noticed you putting in extra effort today - well done!",
        "Thank you for listening attentively during instruction",
        "Nice work completing your assignment on time",
        "Great job problem-solving independently",
        "Thank you for showing kindness to others today"
    ],
    // 100% chance of comment for negative points (PBIS corrective feedback)
    // Format: Brief, respectful, states expectation
    negativeComments: [
        "Reminder: Please stay focused on the task at hand",
        "Remember to raise your hand before speaking",
        "Redirected to follow classroom expectations",
        "Reminder to keep hands and feet to yourself",
        "Please return to your assigned seat",
        "Reminder: We listen when others are speaking",
        "Needed multiple reminders to stay on task",
        "Please follow directions the first time asked",
        "Reminder to use appropriate voice level",
        "Redirected to work independently",
        "Reminder: Be respectful to classmates and staff",
        "Arrived late to class - reminder to be on time",
        "Missing required materials for class",
        "Reminder to stay focused during instruction",
        "Needed redirection to appropriate behavior",
        "Please put away electronic device during class",
        "Reminder to follow dress code expectations",
        "Disrupting others' learning - please refocus",
        "Reminder to complete work during class time",
        "Conference requested to discuss behavior expectations"
    ]
};

// Utility functions
function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getRandomElement(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function getRandomSchoolTime() {
    const minMinutes = 480; // 8:00 AM
    const maxMinutes = 930; // 3:30 PM
    const randomMinutes = getRandomInt(minMinutes, maxMinutes);
    const hours = Math.floor(randomMinutes / 60);
    const minutes = randomMinutes % 60;
    const seconds = getRandomInt(0, 59);
    return \`\${String(hours).padStart(2, '0')}:\${String(minutes).padStart(2, '0')}:\${String(seconds).padStart(2, '0')}\`;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function getRandomComment(type) {
    const comments = type === 'merit' ? CONFIG.positiveComments : CONFIG.negativeComments;
    return getRandomElement(comments);
}

// Generate all point assignments
function generatePointAssignments() {
    const assignments = [];
    const totalRatio = CONFIG.positiveRatio + CONFIG.negativeRatio;

    for (const studentId of CONFIG.students) {
        const totalPoints = getRandomInt(CONFIG.minPoints, CONFIG.maxPoints);
        const positiveCount = Math.round(totalPoints * (CONFIG.positiveRatio / totalRatio));
        const negativeCount = totalPoints - positiveCount;

        // Generate positive points
        for (let i = 0; i < positiveCount; i++) {
            assignments.push({
                studentId,
                date: getRandomElement(CONFIG.weekdays),
                time: getRandomSchoolTime(),
                behaviorId: getRandomElement(CONFIG.meritBehaviors),
                type: 'merit'
            });
        }

        // Generate negative points
        for (let i = 0; i < negativeCount; i++) {
            assignments.push({
                studentId,
                date: getRandomElement(CONFIG.weekdays),
                time: getRandomSchoolTime(),
                behaviorId: getRandomElement(CONFIG.demeritBehaviors),
                type: 'demerit'
            });
        }
    }

    // Shuffle assignments for more realistic distribution
    for (let i = assignments.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [assignments[i], assignments[j]] = [assignments[j], assignments[i]];
    }

    return assignments;
}

// Group assignments by date and behavior for efficient batching
function groupAssignments(assignments) {
    const groups = {};

    for (const a of assignments) {
        const key = \`\${a.date}|\${a.behaviorId}|\${a.type}|\${a.time.substring(0, 5)}\`; // Group by date, behavior, type, and hour:minute
        if (!groups[key]) {
            groups[key] = {
                date: a.date,
                time: a.time,
                behaviorId: a.behaviorId,
                type: a.type,
                studentIds: []
            };
        }
        groups[key].studentIds.push(a.studentId);
    }

    return Object.values(groups);
}

// Send a batch of students
async function sendBatch(group, batchStudents, batchNum, totalBatches, attempt = 1) {
    const payload = {
        time: group.time,
        date: group.date,
        roster: CONFIG.roster,
        location: CONFIG.location,
        students: batchStudents.map(Number),
        school: CONFIG.school,
        behaviors: { [group.behaviorId]: { type: group.type } },
        comment: getRandomComment(group.type)
    };

    try {
        const response = await fetch("https://api.liveschoolapp.com/v2/conducts", {
            method: "POST",
            headers: {
                "accept": "application/json, text/plain, */*",
                "content-type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify(payload)
        });

        const data = await response.json();

        if (data.status === 'error') {
            if (attempt < CONFIG.retryAttempts) {
                console.warn(\`Batch \${batchNum}/\${totalBatches} failed, retrying (attempt \${attempt + 1})...\`);
                await sleep(2000 * attempt);
                return sendBatch(group, batchStudents, batchNum, totalBatches, attempt + 1);
            }
            console.error(\`Batch \${batchNum}/\${totalBatches} FAILED after \${CONFIG.retryAttempts} attempts:\`, data.error);
            return { success: false, count: 0, failed: batchStudents };
        }

        return { success: true, count: batchStudents.length };
    } catch (error) {
        if (attempt < CONFIG.retryAttempts) {
            console.warn(\`Batch \${batchNum}/\${totalBatches} error, retrying (attempt \${attempt + 1})...\`);
            await sleep(2000 * attempt);
            return sendBatch(group, batchStudents, batchNum, totalBatches, attempt + 1);
        }
        console.error(\`Batch \${batchNum}/\${totalBatches} ERROR after \${CONFIG.retryAttempts} attempts:\`, error);
        return { success: false, count: 0, failed: batchStudents };
    }
}

// Main execution
(async () => {
    console.log('=== DEMO DATA GENERATOR ===');
    console.log(\`Students: \${CONFIG.students.length}\`);
    console.log(\`Date range: \${CONFIG.weekdays[0]} to \${CONFIG.weekdays[CONFIG.weekdays.length - 1]}\`);
    console.log(\`Weekdays: \${CONFIG.weekdays.length}\`);
    console.log(\`Points per student: \${CONFIG.minPoints}-\${CONFIG.maxPoints}\`);
    console.log(\`Ratio: \${CONFIG.positiveRatio}:\${CONFIG.negativeRatio}\`);
    console.log('');

    console.log('Generating point assignments...');
    const assignments = generatePointAssignments();
    console.log(\`Total assignments: \${assignments.length}\`);

    console.log('Grouping by date and behavior...');
    const groups = groupAssignments(assignments);
    console.log(\`Groups to process: \${groups.length}\`);
    console.log('');

    let totalSuccess = 0;
    let totalFailed = 0;
    let failedStudents = [];
    let batchNum = 0;

    // Calculate total batches
    let totalBatches = 0;
    for (const group of groups) {
        totalBatches += Math.ceil(group.studentIds.length / CONFIG.batchSize);
    }

    console.log(\`Total batches: \${totalBatches}\`);
    console.log('Starting...');
    console.log('');

    for (const group of groups) {
        // Split group into batches
        for (let i = 0; i < group.studentIds.length; i += CONFIG.batchSize) {
            batchNum++;
            const batchStudents = group.studentIds.slice(i, i + CONFIG.batchSize);

            const result = await sendBatch(group, batchStudents, batchNum, totalBatches);

            if (result.success) {
                totalSuccess += result.count;
                console.log(\`[Batch \${batchNum}/\${totalBatches}] \${group.date} | \${group.type} \${group.behaviorId} | \${result.count} students ✓\`);
            } else {
                totalFailed += batchStudents.length;
                failedStudents = failedStudents.concat(result.failed || []);
            }

            // Delay between batches
            if (batchNum < totalBatches) {
                await sleep(CONFIG.batchDelay);
            }
        }
    }

    console.log('');
    console.log('=== COMPLETE ===');
    console.log(\`Successfully processed: \${totalSuccess} point assignments\`);

    if (totalFailed > 0) {
        console.warn(\`Failed: \${totalFailed} point assignments\`);
        console.log('Failed student IDs:', [...new Set(failedStudents)]);
    }

    console.log('');
    console.log('Demo data generation complete!');
})();`;
    },

    /**
     * Save demo config to localStorage
     */
    saveDemoConfig: function() {
        const config = {
            rosterId: document.getElementById('demo-roster-id').value,
            locationId: document.getElementById('demo-location-id').value,
            schoolId: document.getElementById('demo-school-id').value
        };
        localStorage.setItem('liveschool-demo-config', JSON.stringify(config));
    },

    /**
     * Load saved demo config from localStorage
     */
    loadSavedDemoConfig: function() {
        try {
            const saved = localStorage.getItem('liveschool-demo-config');
            if (saved) {
                const config = JSON.parse(saved);
                if (config.rosterId) document.getElementById('demo-roster-id').value = config.rosterId;
                if (config.locationId) document.getElementById('demo-location-id').value = config.locationId;
                if (config.schoolId) document.getElementById('demo-school-id').value = config.schoolId;
            }
        } catch (e) {
            // Ignore errors
        }
    },

    /**
     * Escape HTML for safe display
     */
    escapeHtml: function(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

/**
 * Balance Transfer Application Logic
 */
const BalanceApp = {
    // State
    sourceData: null,       // { headers, rows } from balance source CSV
    liveSchoolStudents: [], // Students from LiveSchool CSV
    selectedNameColumn: null,
    selectedPointsColumn: null,
    students: [],           // Extracted students with names and points
    matchResults: null,     // { matched, unmatched }
    manualMatches: {},      // Manual match overrides

    /**
     * Initialize balance transfer mode
     */
    init: function() {
        this.bindEvents();
    },

    /**
     * Bind event listeners
     */
    bindEvents: function() {
        // Source file upload
        const sourceDropzone = document.getElementById('balance-source-dropzone');
        const sourceInput = document.getElementById('balance-source-file');

        if (sourceDropzone && sourceInput) {
            sourceDropzone.addEventListener('click', () => sourceInput.click());

            sourceDropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                sourceDropzone.classList.add('dragover');
            });

            sourceDropzone.addEventListener('dragleave', () => {
                sourceDropzone.classList.remove('dragover');
            });

            sourceDropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                sourceDropzone.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file) this.handleSourceFile(file);
            });

            sourceInput.addEventListener('change', (e) => {
                if (e.target.files[0]) this.handleSourceFile(e.target.files[0]);
            });
        }

        // LiveSchool file upload
        const lsDropzone = document.getElementById('balance-liveschool-dropzone');
        const lsInput = document.getElementById('balance-liveschool-file');

        if (lsDropzone && lsInput) {
            lsDropzone.addEventListener('click', () => lsInput.click());

            lsDropzone.addEventListener('dragover', (e) => {
                e.preventDefault();
                lsDropzone.classList.add('dragover');
            });

            lsDropzone.addEventListener('dragleave', () => {
                lsDropzone.classList.remove('dragover');
            });

            lsDropzone.addEventListener('drop', (e) => {
                e.preventDefault();
                lsDropzone.classList.remove('dragover');
                const file = e.dataTransfer.files[0];
                if (file) this.handleLiveSchoolFile(file);
            });

            lsInput.addEventListener('change', (e) => {
                if (e.target.files[0]) this.handleLiveSchoolFile(e.target.files[0]);
            });
        }

        // Column confirmation
        const confirmColumnsBtn = document.getElementById('balance-confirm-columns');
        if (confirmColumnsBtn) {
            confirmColumnsBtn.addEventListener('click', () => this.confirmColumnSelection());
        }

        // Run matching
        const runMatchingBtn = document.getElementById('balance-run-matching');
        if (runMatchingBtn) {
            runMatchingBtn.addEventListener('click', () => this.runMatching());
        }

        // Generate script
        const generateBtn = document.getElementById('balance-generate-script');
        if (generateBtn) {
            generateBtn.addEventListener('click', () => this.generateScript());
        }
    },

    /**
     * Handle source balance file upload
     */
    handleSourceFile: async function(file) {
        const statusEl = document.getElementById('balance-source-file-status');
        const dropzone = document.getElementById('balance-source-dropzone');

        statusEl.textContent = 'Parsing...';
        statusEl.className = 'file-status loading';

        try {
            this.sourceData = await Parser.parseBalanceSourceFile(file);
            statusEl.textContent = `Loaded ${this.sourceData.rows.length} rows`;
            statusEl.className = 'file-status success';
            dropzone.classList.add('has-file');

            this.updateSummary();
            this.checkStepsUnlock();
        } catch (error) {
            statusEl.textContent = 'Error: ' + error.message;
            statusEl.className = 'file-status error';
        }
    },

    /**
     * Handle LiveSchool CSV file upload
     */
    handleLiveSchoolFile: async function(file) {
        const statusEl = document.getElementById('balance-liveschool-file-status');
        const dropzone = document.getElementById('balance-liveschool-dropzone');

        statusEl.textContent = 'Parsing...';
        statusEl.className = 'file-status loading';

        try {
            this.liveSchoolStudents = await Parser.parseLiveSchoolFile(file);
            Matcher.initialize(this.liveSchoolStudents);

            statusEl.textContent = `Loaded ${this.liveSchoolStudents.length} students`;
            statusEl.className = 'file-status success';
            dropzone.classList.add('has-file');

            this.updateSummary();
            this.checkStepsUnlock();
        } catch (error) {
            statusEl.textContent = 'Error: ' + error.message;
            statusEl.className = 'file-status error';
        }
    },

    /**
     * Check and unlock steps based on completion
     */
    checkStepsUnlock: function() {
        // Step 2 (Columns) - unlocks when both files are loaded
        if (this.sourceData && this.liveSchoolStudents.length > 0) {
            const columnsStep = document.getElementById('balance-step-columns');
            columnsStep.classList.remove('locked');
            this.showColumnSelectors();
        }
    },

    /**
     * Show column selectors
     */
    showColumnSelectors: function() {
        if (!this.sourceData) return;

        const { headers, rows } = this.sourceData;
        const sampleRow = rows[0] || [];

        // Name column selector
        const nameContainer = document.getElementById('balance-name-column-selector');
        nameContainer.innerHTML = '';

        headers.forEach((header, idx) => {
            const sample = String(sampleRow[idx] || '');
            const div = document.createElement('div');
            div.className = 'column-option';
            div.dataset.index = idx;
            div.innerHTML = `
                <strong>${this.escapeHtml(header)}</strong>
                <span class="column-preview">${this.escapeHtml(sample.substring(0, 30))}${sample.length > 30 ? '...' : ''}</span>
            `;
            div.addEventListener('click', () => this.selectColumn(idx, 'name'));
            nameContainer.appendChild(div);
        });

        // Points column selector
        const pointsContainer = document.getElementById('balance-points-column-selector');
        pointsContainer.innerHTML = '';

        headers.forEach((header, idx) => {
            const sample = String(sampleRow[idx] || '');
            const div = document.createElement('div');
            div.className = 'column-option';
            div.dataset.index = idx;
            div.innerHTML = `
                <strong>${this.escapeHtml(header)}</strong>
                <span class="column-preview">${this.escapeHtml(sample.substring(0, 30))}${sample.length > 30 ? '...' : ''}</span>
            `;
            div.addEventListener('click', () => this.selectColumn(idx, 'points'));
            pointsContainer.appendChild(div);
        });

        // Auto-select columns that look like name and points
        const headerLower = headers.map(h => h.toLowerCase());

        // Try to find name column
        for (let i = 0; i < headers.length; i++) {
            if (headerLower[i].includes('name') && !headerLower[i].includes('first') && !headerLower[i].includes('last')) {
                this.selectColumn(i, 'name');
                break;
            }
        }

        // Try to find points column
        for (let i = 0; i < headers.length; i++) {
            if (headerLower[i].includes('point') || headerLower[i].includes('balance') || headerLower[i].includes('amount')) {
                this.selectColumn(i, 'points');
                break;
            }
        }
    },

    /**
     * Select a column
     */
    selectColumn: function(index, type) {
        if (type === 'name') {
            this.selectedNameColumn = index;
            document.querySelectorAll('#balance-name-column-selector .column-option').forEach((el, idx) => {
                el.classList.toggle('selected', idx === index);
            });
        } else if (type === 'points') {
            this.selectedPointsColumn = index;
            document.querySelectorAll('#balance-points-column-selector .column-option').forEach((el, idx) => {
                el.classList.toggle('selected', idx === index);
            });
        }
    },

    /**
     * Confirm column selection and proceed
     */
    confirmColumnSelection: function() {
        const rewardId = document.getElementById('balance-reward-id').value.trim();
        if (!rewardId) {
            alert('Please enter the Reward ID for this school.');
            return;
        }
        if (this.selectedNameColumn === null) {
            alert('Please select the column containing student names.');
            return;
        }
        if (this.selectedPointsColumn === null) {
            alert('Please select the column containing point amounts.');
            return;
        }
        if (this.selectedNameColumn === this.selectedPointsColumn) {
            alert('Name and Points columns must be different.');
            return;
        }

        // Extract student data
        this.students = Parser.extractBalanceData(
            this.sourceData.rows,
            this.selectedNameColumn,
            this.selectedPointsColumn
        );

        // Unlock matching step
        const matchStep = document.getElementById('balance-step-match');
        matchStep.classList.remove('locked');

        this.updateSummary();
    },

    /**
     * Run the matching process
     */
    runMatching: function() {
        const btn = document.getElementById('balance-run-matching');
        const btnText = btn.querySelector('.btn-text');
        const btnSpinner = btn.querySelector('.btn-spinner');

        // Show loading state
        btnText.textContent = 'Matching...';
        btnSpinner.classList.remove('hidden');
        btn.disabled = true;

        // Use setTimeout to allow UI to update
        setTimeout(() => {
            this.matchResults = Matcher.matchAllStudents(this.students);
            this.manualMatches = {};

            const totalMatched = this.matchResults.matched.length;
            const totalUnmatched = this.matchResults.unmatched.length;
            const total = totalMatched + totalUnmatched;
            const percentage = total > 0 ? Math.round((totalMatched / total) * 100) : 0;

            // Calculate total points for matched students
            let totalPoints = 0;
            for (const match of this.matchResults.matched) {
                const student = this.students.find(s => s.originalName === match.originalName);
                if (student) {
                    totalPoints += student.points;
                }
            }

            // Update UI
            document.getElementById('balance-matched-count').textContent = totalMatched;
            document.getElementById('balance-unmatched-count').textContent = totalUnmatched;
            document.getElementById('balance-match-percentage').textContent = percentage + '%';
            document.getElementById('balance-total-points').textContent = totalPoints.toLocaleString();

            // Traffic light indicator
            const indicator = document.getElementById('balance-match-indicator');
            indicator.classList.remove('green', 'yellow', 'red');
            if (percentage >= 95) {
                indicator.classList.add('green');
            } else if (percentage >= 80) {
                indicator.classList.add('yellow');
            } else {
                indicator.classList.add('red');
            }

            document.getElementById('balance-match-summary').classList.remove('hidden');

            // Show unmatched items if any
            if (totalUnmatched > 0) {
                this.showUnmatchedItems();
            } else {
                document.getElementById('balance-unmatched-list').classList.add('hidden');
            }

            // Unlock generate step
            const generateStep = document.getElementById('balance-step-generate');
            generateStep.classList.remove('locked');

            this.updateSummary();

            // Reset button
            btnText.textContent = 'Run Matching';
            btnSpinner.classList.add('hidden');
            btn.disabled = false;
        }, 100);
    },

    /**
     * Show unmatched items for manual resolution
     */
    showUnmatchedItems: function() {
        const container = document.getElementById('balance-unmatched-items');
        container.innerHTML = '';

        const allStudents = Matcher.getAllStudentsForDropdown();

        for (const unmatched of this.matchResults.unmatched) {
            // Find the student's points
            const student = this.students.find(s => s.originalName === unmatched.originalName);
            const points = student ? student.points : 0;

            const div = document.createElement('div');
            div.className = 'unmatched-item';
            div.dataset.originalName = unmatched.originalName;

            // Build dropdown options
            let optionsHtml = '<option value="">-- No match (skip) --</option>';

            // Add suggestions first
            if (unmatched.suggestions && unmatched.suggestions.length > 0) {
                optionsHtml += '<optgroup label="Suggestions">';
                for (const suggestion of unmatched.suggestions) {
                    const s = suggestion.student;
                    optionsHtml += `<option value="${s.id}">${s.lastName}, ${s.firstName} (${suggestion.confidence}% match)</option>`;
                }
                optionsHtml += '</optgroup>';
            }

            // Add all students
            optionsHtml += '<optgroup label="All Students">';
            for (const student of allStudents) {
                optionsHtml += `<option value="${student.id}">${student.displayName}</option>`;
            }
            optionsHtml += '</optgroup>';

            div.innerHTML = `
                <div class="original-name">${this.escapeHtml(unmatched.originalName)}</div>
                <div class="points-badge">${points} pts</div>
                <select class="manual-match-select">${optionsHtml}</select>
            `;

            // Bind change event
            div.querySelector('select').addEventListener('change', (e) => {
                const studentId = e.target.value;
                const key = unmatched.originalName;

                if (studentId) {
                    this.manualMatches[key] = studentId;
                    div.classList.add('resolved');
                } else {
                    delete this.manualMatches[key];
                    div.classList.remove('resolved');
                }

                this.updateTotalPoints();
            });

            container.appendChild(div);
        }

        document.getElementById('balance-unmatched-list').classList.remove('hidden');
    },

    /**
     * Update total points display
     */
    updateTotalPoints: function() {
        let totalPoints = 0;

        // Add points from matched students
        for (const match of this.matchResults.matched) {
            const student = this.students.find(s => s.originalName === match.originalName);
            if (student) {
                totalPoints += student.points;
            }
        }

        // Add points from manually matched students
        for (const originalName of Object.keys(this.manualMatches)) {
            const student = this.students.find(s => s.originalName === originalName);
            if (student) {
                totalPoints += student.points;
            }
        }

        document.getElementById('balance-total-points').textContent = totalPoints.toLocaleString();
    },

    /**
     * Generate the transfer script
     */
    generateScript: function() {
        const rewardId = document.getElementById('balance-reward-id').value.trim();
        if (!rewardId) {
            alert('Please enter the Reward ID in Step 2.');
            return;
        }

        // Collect all student transfers
        const transfers = [];

        // Add matched students
        for (const match of this.matchResults.matched) {
            const student = this.students.find(s => s.originalName === match.originalName);
            if (student && student.points > 0) {
                transfers.push({
                    studentId: match.match.id,
                    name: match.originalName,
                    amount: student.points
                });
            }
        }

        // Add manually matched students
        for (const originalName of Object.keys(this.manualMatches)) {
            const studentId = this.manualMatches[originalName];
            const student = this.students.find(s => s.originalName === originalName);
            if (student && student.points > 0) {
                transfers.push({
                    studentId: studentId,
                    name: originalName,
                    amount: student.points
                });
            }
        }

        if (transfers.length === 0) {
            alert('No students to transfer points to. Make sure students are matched and have points > 0.');
            return;
        }

        const script = this.buildTransferScript(transfers, rewardId);

        // Display the script
        const container = document.getElementById('balance-scripts-output');
        container.innerHTML = `
            <div class="script-block">
                <h4>
                    <span>Balance Transfer Script (${transfers.length} students, ${transfers.reduce((sum, t) => sum + t.amount, 0).toLocaleString()} total points)</span>
                    <div class="script-actions">
                        <button class="copy-btn" id="copy-balance-script">Copy</button>
                        <button class="download-btn" id="download-balance-script">Download</button>
                    </div>
                </h4>
                <pre><code class="language-javascript">${this.escapeHtml(script)}</code></pre>
            </div>
        `;

        // Bind buttons
        document.getElementById('copy-balance-script').addEventListener('click', (e) => {
            navigator.clipboard.writeText(script).then(() => {
                e.target.textContent = 'Copied!';
                e.target.classList.add('copied');
                setTimeout(() => {
                    e.target.textContent = 'Copy';
                    e.target.classList.remove('copied');
                }, 2000);
            });
        });

        document.getElementById('download-balance-script').addEventListener('click', () => {
            const blob = new Blob([script], { type: 'text/javascript' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `balance_transfer_${new Date().toISOString().split('T')[0]}.js`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        });

        if (typeof Prism !== 'undefined') {
            Prism.highlightAll();
        }
    },

    /**
     * Build the transfer script content
     */
    buildTransferScript: function(transfers, rewardId) {
        const transfersJson = JSON.stringify(transfers, null, 2);

        return `/**
 * LiveSchool Balance Transfer Script
 * Generated: ${new Date().toISOString()}
 *
 * Students: ${transfers.length}
 * Total Points: ${transfers.reduce((sum, t) => sum + t.amount, 0).toLocaleString()}
 * Reward ID: ${rewardId}
 */

const TRANSFERS = ${transfersJson};
const REWARD_ID = "${rewardId}";

const BATCH_DELAY = 200; // Delay between requests in ms
const RETRY_ATTEMPTS = 3;

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function transferPoints(studentId, amount, name, attempt = 1) {
    // Use FormData API for proper multipart encoding
    const formData = new FormData();
    formData.append('category', 'adjustment');
    formData.append('name', 'Starting Bank Balance');
    formData.append('reward', REWARD_ID);
    formData.append('amount', amount.toString());
    formData.append('student', studentId.toString());
    formData.append('type', 'credit');

    try {
        const response = await fetch("https://admin.liveschoolinc.com/popup/transaction/add", {
            method: "POST",
            credentials: "include",
            body: formData
        });

        if (response.ok) {
            return { success: true };
        } else {
            if (attempt < RETRY_ATTEMPTS) {
                console.warn(\`Retry \${attempt + 1} for \${name} (ID: \${studentId})...\`);
                await sleep(1000 * attempt);
                return transferPoints(studentId, amount, name, attempt + 1);
            }
            console.error(\`FAILED: \${name} (ID: \${studentId}) - HTTP \${response.status}\`);
            return { success: false, studentId, name, amount };
        }
    } catch (error) {
        if (attempt < RETRY_ATTEMPTS) {
            console.warn(\`Retry \${attempt + 1} for \${name} (ID: \${studentId})...\`);
            await sleep(1000 * attempt);
            return transferPoints(studentId, amount, name, attempt + 1);
        }
        console.error(\`FAILED: \${name} (ID: \${studentId}) - \${error.message}\`);
        return { success: false, studentId, name, amount };
    }
}

(async () => {
    console.log('=== BALANCE TRANSFER ===');
    console.log(\`Processing \${TRANSFERS.length} students...\`);
    console.log(\`Reward ID: \${REWARD_ID}\`);
    console.log('');

    let successCount = 0;
    let failedTransfers = [];

    for (let i = 0; i < TRANSFERS.length; i++) {
        const t = TRANSFERS[i];
        const result = await transferPoints(t.studentId, t.amount, t.name);

        if (result.success) {
            successCount++;
            console.log(\`[\${i + 1}/\${TRANSFERS.length}] \${t.name}: \${t.amount} points ✓\`);
        } else {
            failedTransfers.push(result);
        }

        // Delay between requests
        if (i < TRANSFERS.length - 1) {
            await sleep(BATCH_DELAY);
        }
    }

    console.log('');
    console.log('=== COMPLETE ===');
    console.log(\`Successfully transferred: \${successCount}/\${TRANSFERS.length} students\`);

    if (failedTransfers.length > 0) {
        console.warn(\`Failed: \${failedTransfers.length} students\`);
        console.log('Failed transfers:', failedTransfers);

        // Generate retry script
        const retryScript = \`
// ========== RETRY SCRIPT FOR FAILED TRANSFERS ==========
const RETRY_TRANSFERS = \${JSON.stringify(failedTransfers.map(f => ({ studentId: f.studentId, name: f.name, amount: f.amount })), null, 2)};
const REWARD_ID = "\${REWARD_ID}";

(async () => {
    for (let i = 0; i < RETRY_TRANSFERS.length; i++) {
        const t = RETRY_TRANSFERS[i];
        const formData = new FormData();
        formData.append('category', 'adjustment');
        formData.append('name', 'Starting Bank Balance');
        formData.append('reward', REWARD_ID);
        formData.append('amount', t.amount.toString());
        formData.append('student', t.studentId.toString());
        formData.append('type', 'credit');

        try {
            const response = await fetch("https://admin.liveschoolinc.com/popup/transaction/add", {
                method: "POST",
                credentials: "include",
                body: formData
            });
            if (response.ok) {
                console.log(\\\`[\\\${i + 1}/\\\${RETRY_TRANSFERS.length}] \\\${t.name}: \\\${t.amount} points ✓\\\`);
            } else {
                console.error(\\\`FAILED: \\\${t.name} - HTTP \\\${response.status}\\\`);
            }
        } catch (e) {
            console.error(\\\`FAILED: \\\${t.name} - \\\${e.message}\\\`);
        }
        if (i < RETRY_TRANSFERS.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    console.log('Retry complete!');
})();
// ========== END RETRY SCRIPT ==========
\`;
        console.log(retryScript);
    }

    console.log('');
    console.log('Balance transfer complete!');
})();`;
    },

    /**
     * Update summary bar
     */
    updateSummary: function() {
        // Source file
        const sourceSummary = document.getElementById('balance-summary-source');
        if (this.sourceData) {
            sourceSummary.querySelector('.summary-icon').textContent = '✓';
            sourceSummary.querySelector('.summary-icon').classList.add('complete');
            sourceSummary.querySelector('.summary-label').textContent = `${this.sourceData.rows.length} rows`;
        }

        // LiveSchool file
        const lsSummary = document.getElementById('balance-summary-liveschool');
        if (this.liveSchoolStudents.length > 0) {
            lsSummary.querySelector('.summary-icon').textContent = '✓';
            lsSummary.querySelector('.summary-icon').classList.add('complete');
            lsSummary.querySelector('.summary-label').textContent = `${this.liveSchoolStudents.length} students`;
        }

        // Matched
        const matchedSummary = document.getElementById('balance-summary-matched');
        if (this.matchResults) {
            const matched = this.matchResults.matched.length + Object.keys(this.manualMatches).length;
            const total = this.students.length;
            matchedSummary.querySelector('.summary-icon').textContent = '✓';
            matchedSummary.querySelector('.summary-icon').classList.add('complete');
            matchedSummary.querySelector('.summary-label').textContent = `${matched}/${total}`;
        }
    },

    /**
     * Escape HTML for safe display
     */
    escapeHtml: function(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
};

/**
 * Onboarding and Modals
 */
const Onboarding = {
    init: function() {
        this.bindModalEvents();
        this.checkFirstVisit();
    },

    bindModalEvents: function() {
        // Welcome modal
        const closeWelcome = document.getElementById('close-welcome');
        const startUsing = document.getElementById('start-using');
        if (closeWelcome) closeWelcome.addEventListener('click', () => this.closeModal('welcome-modal'));
        if (startUsing) startUsing.addEventListener('click', () => this.closeModal('welcome-modal'));

        // Changelog modal
        const showChangelog = document.getElementById('show-changelog');
        const closeChangelog = document.getElementById('close-changelog');
        const closeChangelogBtn = document.getElementById('close-changelog-btn');
        if (showChangelog) showChangelog.addEventListener('click', () => this.openModal('changelog-modal'));
        if (closeChangelog) closeChangelog.addEventListener('click', () => this.closeModal('changelog-modal'));
        if (closeChangelogBtn) closeChangelogBtn.addEventListener('click', () => this.closeModal('changelog-modal'));

        // Help button - opens welcome modal
        const showHelp = document.getElementById('show-help');
        if (showHelp) showHelp.addEventListener('click', () => this.openModal('welcome-modal'));

        // Close modals on backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.closeModal(modal.id);
            });
        });

        // Close modals on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document.querySelectorAll('.modal:not(.hidden)').forEach(modal => {
                    this.closeModal(modal.id);
                });
            }
        });
    },

    checkFirstVisit: function() {
        const hasVisited = localStorage.getItem('liveschool-points-visited');
        const lastVersion = localStorage.getItem('liveschool-points-version');
        const currentVersion = '2.2.2';

        if (!hasVisited) {
            // First visit - show welcome
            this.openModal('welcome-modal');
            localStorage.setItem('liveschool-points-visited', 'true');
            localStorage.setItem('liveschool-points-version', currentVersion);
        } else if (lastVersion !== currentVersion) {
            // Returning user, new version - show changelog
            this.openModal('changelog-modal');
            localStorage.setItem('liveschool-points-version', currentVersion);
        }
    },

    openModal: function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.remove('hidden');
    },

    closeModal: function(modalId) {
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('hidden');
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize authentication first
    Auth.init();

    // Initialize app modules (they're hidden until auth succeeds)
    App.init();
    DemoApp.init();
    BalanceApp.init();
    Onboarding.init();

    // Settings dropdown toggle
    const settingsToggle = document.getElementById('settings-toggle');
    const settingsMenu = document.getElementById('settings-menu');

    if (settingsToggle && settingsMenu) {
        // Toggle menu on button click
        settingsToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            settingsMenu.classList.toggle('hidden');
        });

        // Close menu when clicking outside
        document.addEventListener('click', (e) => {
            if (!settingsMenu.classList.contains('hidden') &&
                !settingsMenu.contains(e.target) &&
                e.target !== settingsToggle) {
                settingsMenu.classList.add('hidden');
            }
        });

        // Close menu when clicking a menu item (except for links which navigate)
        settingsMenu.querySelectorAll('.settings-item:not(a)').forEach(item => {
            item.addEventListener('click', () => {
                settingsMenu.classList.add('hidden');
            });
        });
    }
});
