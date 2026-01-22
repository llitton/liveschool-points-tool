/**
 * Matcher module for matching students between school and LiveSchool lists
 */

const Matcher = {
    fuse: null,
    liveSchoolStudents: [],

    /**
     * Initialize the matcher with LiveSchool student data
     * @param {Array} students - Array of {id, firstName, lastName} objects
     */
    initialize: function(students) {
        this.liveSchoolStudents = students;

        // Create searchable keys for each student
        const studentsWithKeys = students.map(s => ({
            ...s,
            // Multiple search keys for flexible matching
            fullNameFL: `${s.firstName} ${s.lastName}`.trim(),
            fullNameLF: `${s.lastName} ${s.firstName}`.trim(),
            fullNameLCF: `${s.lastName}, ${s.firstName}`.trim()
        }));

        // Initialize Fuse.js for fuzzy matching
        this.fuse = new Fuse(studentsWithKeys, {
            keys: ['fullNameFL', 'fullNameLF', 'fullNameLCF', 'firstName', 'lastName'],
            threshold: 0.3, // Lower = more strict
            includeScore: true,
            ignoreLocation: true
        });
    },

    /**
     * Check if two last names match, accounting for truncation
     * LiveSchool truncates last names to ~20 characters
     * @param {string} schoolLast - Last name from school file (may be longer)
     * @param {string} lsLast - Last name from LiveSchool (may be truncated)
     * @returns {boolean}
     */
    lastNamesMatch: function(schoolLast, lsLast) {
        // Exact match
        if (schoolLast === lsLast) {
            return true;
        }

        // School has compound last name, LiveSchool might have just the first part
        // e.g., "LLIVISACA MALDONADO" vs "LLIVISACA"
        const schoolLastParts = schoolLast.split(' ');
        if (schoolLastParts.length > 1 && schoolLastParts[0] === lsLast) {
            return true;
        }

        // School's last name starts with LiveSchool's (truncation case)
        // e.g., "GARCIALOPEZFERNANDEZ" vs "GARCIALOPEZFERNAN" (truncated at 20 chars)
        if (schoolLast.startsWith(lsLast) && lsLast.length >= 15) {
            return true;
        }

        return false;
    },

    /**
     * Check if two first names match, accounting for middle names
     * @param {string} schoolFirst - First name from school file (may include middle)
     * @param {string} lsFirst - First name from LiveSchool
     * @returns {boolean}
     */
    firstNamesMatch: function(schoolFirst, lsFirst) {
        // Exact match
        if (schoolFirst === lsFirst) {
            return true;
        }

        // School first name starts with LiveSchool first name (school has middle name)
        // e.g., "ROAA ABDELGHANY" vs "ROAA"
        if (schoolFirst.startsWith(lsFirst + ' ')) {
            return true;
        }

        // LiveSchool first name starts with school first name (LS has middle name)
        // e.g., "ROAA" vs "ROAA ABDELGHANY"
        if (lsFirst.startsWith(schoolFirst + ' ')) {
            return true;
        }

        // First word of school first matches first word of LS first
        const schoolFirstWord = schoolFirst.split(' ')[0];
        const lsFirstWord = lsFirst.split(' ')[0];
        if (schoolFirstWord === lsFirstWord) {
            return true;
        }

        return false;
    },

    /**
     * Find exact match for a student
     * @param {Object} parsedName - {firstName, lastName} from school file
     * @returns {Object|null} - Matched student or null
     */
    findExactMatch: function(parsedName) {
        const schoolFirst = parsedName.firstName.toUpperCase();
        const schoolLast = parsedName.lastName.toUpperCase();

        // Try matching with flexible rules for truncation and middle names
        for (const student of this.liveSchoolStudents) {
            const lsFirst = student.firstName.toUpperCase();
            const lsLast = student.lastName.toUpperCase();

            // Check if both first and last names match (with flexible matching)
            if (this.lastNamesMatch(schoolLast, lsLast) && this.firstNamesMatch(schoolFirst, lsFirst)) {
                return student;
            }
        }

        return null;
    },

    /**
     * Find fuzzy match for a student
     * @param {Object} parsedName - {firstName, lastName} from school file
     * @param {number} limit - Maximum number of suggestions
     * @returns {Array} - Array of potential matches with scores
     */
    findFuzzyMatches: function(parsedName, limit = 5) {
        const searchString = `${parsedName.firstName} ${parsedName.lastName}`.trim();

        if (!searchString) {
            return [];
        }

        const results = this.fuse.search(searchString, { limit });

        return results.map(r => ({
            student: r.item,
            score: r.score,
            confidence: Math.round((1 - r.score) * 100)
        }));
    },

    /**
     * Match a single student
     * @param {Object} schoolStudent - {originalName, parsedName} from school file
     * @returns {Object} - Match result with status and data
     */
    matchStudent: function(schoolStudent) {
        const { parsedName, originalName } = schoolStudent;

        // Try exact match first
        const exactMatch = this.findExactMatch(parsedName);
        if (exactMatch) {
            return {
                status: 'matched',
                originalName,
                parsedName,
                match: exactMatch,
                confidence: 100
            };
        }

        // Try fuzzy match
        const fuzzyMatches = this.findFuzzyMatches(parsedName);
        if (fuzzyMatches.length > 0 && fuzzyMatches[0].confidence >= 80) {
            // High confidence fuzzy match - treat as matched
            return {
                status: 'matched',
                originalName,
                parsedName,
                match: fuzzyMatches[0].student,
                confidence: fuzzyMatches[0].confidence
            };
        }

        // No good match found
        return {
            status: 'unmatched',
            originalName,
            parsedName,
            suggestions: fuzzyMatches,
            match: null,
            confidence: 0
        };
    },

    /**
     * Match all students from a sheet
     * @param {Array} schoolStudents - Array of students from school file
     * @returns {{matched: Array, unmatched: Array}}
     */
    matchAllStudents: function(schoolStudents) {
        const matched = [];
        const unmatched = [];

        for (const student of schoolStudents) {
            const result = this.matchStudent(student);

            if (result.status === 'matched') {
                matched.push(result);
            } else {
                unmatched.push(result);
            }
        }

        return { matched, unmatched };
    },

    /**
     * Get all LiveSchool students for dropdown selection
     * @returns {Array} - Sorted array of students
     */
    getAllStudentsForDropdown: function() {
        return this.liveSchoolStudents
            .map(s => ({
                id: s.id,
                displayName: `${s.lastName}, ${s.firstName}`,
                firstName: s.firstName,
                lastName: s.lastName
            }))
            .sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
};
