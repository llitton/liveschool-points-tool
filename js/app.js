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
    }
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

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());
