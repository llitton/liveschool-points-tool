/**
 * Parser module for handling file parsing
 */

const Parser = {
    /**
     * Parse the school's XLSX file
     * @param {File} file - The XLSX file
     * @returns {Promise<{sheets: Object, sheetNames: string[]}>}
     */
    parseSchoolFile: function(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = function(e) {
                try {
                    const data = new Uint8Array(e.target.result);
                    const workbook = XLSX.read(data, { type: 'array' });

                    const sheets = {};
                    const sheetNames = workbook.SheetNames;

                    sheetNames.forEach(name => {
                        const worksheet = workbook.Sheets[name];
                        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
                        sheets[name] = jsonData;
                    });

                    resolve({ sheets, sheetNames });
                } catch (error) {
                    reject(new Error('Failed to parse XLSX file: ' + error.message));
                }
            };

            reader.onerror = function() {
                reject(new Error('Failed to read file'));
            };

            reader.readAsArrayBuffer(file);
        });
    },

    /**
     * Parse the LiveSchool CSV export
     * @param {File} file - The CSV file
     * @returns {Promise<Array<{id: string, firstName: string, lastName: string}>>}
     */
    parseLiveSchoolFile: function(file) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                complete: function(results) {
                    try {
                        const rows = results.data;
                        const students = [];

                        // Find the header row (contains "id", "First Name*", "Last Name*")
                        let headerRowIndex = -1;
                        for (let i = 0; i < Math.min(rows.length, 10); i++) {
                            const row = rows[i];
                            if (row && row.length >= 3) {
                                const firstCell = String(row[0] || '').toLowerCase().trim();
                                if (firstCell === 'id') {
                                    headerRowIndex = i;
                                    break;
                                }
                            }
                        }

                        if (headerRowIndex === -1) {
                            reject(new Error('Could not find header row in LiveSchool CSV'));
                            return;
                        }

                        // Parse student data starting after header
                        for (let i = headerRowIndex + 1; i < rows.length; i++) {
                            const row = rows[i];
                            if (row && row.length >= 3 && row[0]) {
                                const id = String(row[0]).trim();
                                const firstName = String(row[1] || '').trim().toUpperCase();
                                const lastName = String(row[2] || '').trim().toUpperCase();

                                if (id && (firstName || lastName)) {
                                    students.push({ id, firstName, lastName });
                                }
                            }
                        }

                        resolve(students);
                    } catch (error) {
                        reject(new Error('Failed to parse CSV data: ' + error.message));
                    }
                },
                error: function(error) {
                    reject(new Error('Failed to parse CSV: ' + error.message));
                }
            });
        });
    },

    /**
     * Parse a student name in "LASTNAME, FIRSTNAME MIDDLENAME" format
     * @param {string} nameString - The name string to parse
     * @returns {{firstName: string, lastName: string, fullName: string}}
     */
    parseStudentName: function(nameString) {
        if (!nameString || typeof nameString !== 'string') {
            return { firstName: '', lastName: '', fullName: '' };
        }

        const normalized = nameString.trim().toUpperCase();

        // Split on comma
        const commaIndex = normalized.indexOf(',');

        if (commaIndex === -1) {
            // No comma - try space-based parsing (first word = last name)
            const parts = normalized.split(/\s+/);
            if (parts.length >= 2) {
                return {
                    lastName: parts[0],
                    firstName: parts.slice(1).join(' '),
                    fullName: normalized
                };
            }
            return { firstName: normalized, lastName: '', fullName: normalized };
        }

        // Comma-separated: "LASTNAME, FIRSTNAME MIDDLENAME"
        const lastName = normalized.substring(0, commaIndex).trim();
        const firstName = normalized.substring(commaIndex + 1).trim();

        return {
            lastName,
            firstName,
            fullName: normalized
        };
    },

    /**
     * Extract students from a sheet based on a combined name column
     * @param {Array} sheetData - 2D array of sheet data
     * @param {number} nameColumnIndex - Index of the name column
     * @returns {Array<{originalName: string, parsedName: Object, rowIndex: number}>}
     */
    extractStudentsFromSheet: function(sheetData, nameColumnIndex) {
        const students = [];

        // Skip header row (row 0)
        for (let i = 1; i < sheetData.length; i++) {
            const row = sheetData[i];
            if (row && row[nameColumnIndex]) {
                const originalName = String(row[nameColumnIndex]).trim();
                if (originalName) {
                    students.push({
                        originalName,
                        parsedName: this.parseStudentName(originalName),
                        rowIndex: i
                    });
                }
            }
        }

        return students;
    },

    /**
     * Extract students from a sheet based on separate last name and first name columns
     * @param {Array} sheetData - 2D array of sheet data
     * @param {number} lastNameColumnIndex - Index of the last name column
     * @param {number} firstNameColumnIndex - Index of the first name column
     * @returns {Array<{originalName: string, parsedName: Object, rowIndex: number}>}
     */
    extractStudentsFromSeparateColumns: function(sheetData, lastNameColumnIndex, firstNameColumnIndex) {
        const students = [];

        // Skip header row (row 0)
        for (let i = 1; i < sheetData.length; i++) {
            const row = sheetData[i];
            if (row) {
                const lastName = String(row[lastNameColumnIndex] || '').trim().toUpperCase();
                const firstName = String(row[firstNameColumnIndex] || '').trim().toUpperCase();

                if (lastName || firstName) {
                    // Create original name in "LASTNAME, FIRSTNAME" format for display
                    const originalName = lastName && firstName
                        ? `${lastName}, ${firstName}`
                        : (lastName || firstName);

                    students.push({
                        originalName,
                        parsedName: {
                            lastName,
                            firstName,
                            fullName: originalName
                        },
                        rowIndex: i
                    });
                }
            }
        }

        return students;
    },

    /**
     * Get column headers and sample data from first sheet
     * @param {Array} sheetData - 2D array of sheet data
     * @returns {Array<{index: number, header: string, sample: string}>}
     */
    getColumnInfo: function(sheetData) {
        if (!sheetData || sheetData.length < 2) {
            return [];
        }

        const headerRow = sheetData[0] || [];
        const sampleRow = sheetData[1] || [];

        const columns = [];
        for (let i = 0; i < headerRow.length; i++) {
            columns.push({
                index: i,
                header: String(headerRow[i] || `Column ${i + 1}`),
                sample: String(sampleRow[i] || '')
            });
        }

        return columns;
    },

    /**
     * Parse a balance source CSV file
     * @param {File} file - The CSV file with student names and point balances
     * @returns {Promise<{headers: string[], rows: Array}>}
     */
    parseBalanceSourceFile: function(file) {
        return new Promise((resolve, reject) => {
            Papa.parse(file, {
                complete: function(results) {
                    try {
                        const rows = results.data;

                        if (rows.length < 2) {
                            reject(new Error('File must have at least a header row and one data row'));
                            return;
                        }

                        // First row is headers
                        const headers = rows[0].map(h => String(h || '').trim());
                        const dataRows = rows.slice(1).filter(row => row && row.some(cell => cell));

                        resolve({ headers, rows: dataRows });
                    } catch (error) {
                        reject(new Error('Failed to parse CSV: ' + error.message));
                    }
                },
                error: function(error) {
                    reject(new Error('Failed to parse CSV: ' + error.message));
                }
            });
        });
    },

    /**
     * Parse a student name in "FirstName LastName" format
     * Where LastName can be multiple words (e.g., "Fabiola Murillo Martinez")
     * @param {string} nameString - The name string to parse
     * @returns {{firstName: string, lastName: string, fullName: string}}
     */
    parseFirstLastName: function(nameString) {
        if (!nameString || typeof nameString !== 'string') {
            return { firstName: '', lastName: '', fullName: '' };
        }

        const normalized = nameString.trim().toUpperCase();
        const parts = normalized.split(/\s+/);

        if (parts.length === 0) {
            return { firstName: '', lastName: '', fullName: '' };
        }

        if (parts.length === 1) {
            // Only one word - treat as first name
            return {
                firstName: parts[0],
                lastName: '',
                fullName: normalized
            };
        }

        // First word is first name, rest is last name
        const firstName = parts[0];
        const lastName = parts.slice(1).join(' ');

        return {
            firstName,
            lastName,
            fullName: normalized
        };
    },

    /**
     * Extract balance data from parsed CSV
     * @param {Array} rows - The data rows
     * @param {number} nameColIndex - Index of the name column
     * @param {number} pointsColIndex - Index of the points column
     * @returns {Array<{originalName: string, parsedName: Object, points: number, rowIndex: number}>}
     */
    extractBalanceData: function(rows, nameColIndex, pointsColIndex) {
        const students = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            const nameValue = row[nameColIndex];
            const pointsValue = row[pointsColIndex];

            if (!nameValue) continue;

            const originalName = String(nameValue).trim();
            const points = parseInt(String(pointsValue).replace(/[^0-9-]/g, ''), 10) || 0;

            if (originalName) {
                students.push({
                    originalName,
                    parsedName: this.parseFirstLastName(originalName),
                    points,
                    rowIndex: i + 1 // +1 because we skipped header
                });
            }
        }

        return students;
    }
};
