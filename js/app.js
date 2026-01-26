/**
 * Main Application Logic
 */

const App = {
    // State
    schoolData: null,
    liveSchoolStudents: [],
    selectedNameColumn: null,
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
     * Show column selector for name column
     */
    showColumnSelector: function() {
        if (!this.schoolData) return;

        const firstSheet = this.schoolData.sheets[this.schoolData.sheetNames[0]];
        const columns = Parser.getColumnInfo(firstSheet);

        const container = document.getElementById('column-selector');
        container.innerHTML = '';

        columns.forEach((col, idx) => {
            const div = document.createElement('div');
            div.className = 'column-option';
            div.dataset.index = idx;
            div.innerHTML = `
                <strong>${col.header}</strong>
                <span class="column-preview">${col.sample.substring(0, 30)}${col.sample.length > 30 ? '...' : ''}</span>
            `;
            div.addEventListener('click', () => this.selectColumn(idx));
            container.appendChild(div);
        });

        this.unlockStep(2);

        // Auto-select column that looks like a name (contains comma)
        for (let i = 0; i < columns.length; i++) {
            if (columns[i].sample.includes(',') && columns[i].sample.match(/[A-Za-z]/)) {
                this.selectColumn(i);
                break;
            }
        }
    },

    /**
     * Select a column
     */
    selectColumn: function(index) {
        this.selectedNameColumn = index;

        document.querySelectorAll('.column-option').forEach((el, idx) => {
            el.classList.toggle('selected', idx === index);
        });
    },

    /**
     * Confirm column selection and proceed
     */
    confirmColumnSelection: function() {
        if (this.selectedNameColumn === null) {
            alert('Please select the column containing student names.');
            return;
        }

        this.unlockStep(3);
        this.checkReadyForBehaviors();
    },

    /**
     * Check if ready to show behavior assignment
     */
    checkReadyForBehaviors: function() {
        if (!this.schoolData || !this.liveSchoolStudents.length || this.selectedNameColumn === null) {
            return;
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
            const students = Parser.extractStudentsFromSheet(sheetData, this.selectedNameColumn);

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
     * Switch between assign and demo modes
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

        // Show/hide appropriate sections
        document.querySelectorAll('.assign-step').forEach(el => {
            el.classList.toggle('hidden', mode !== 'assign');
        });
        document.querySelectorAll('.demo-step').forEach(el => {
            el.classList.toggle('hidden', mode !== 'demo');
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
    retryAttempts: 3
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
        comment: ""
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
        const currentVersion = '2.0.0';

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
    App.init();
    DemoApp.init();
    Onboarding.init();
});
