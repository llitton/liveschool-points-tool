# LiveSchool Points Tool - Development Notes

## Overview

This tool helps bulk-assign behaviors (points) to students in LiveSchool. It has four modes:

1. **Assign Points Mode** - Match student names from school spreadsheets to LiveSchool IDs and generate assignment scripts
2. **Demo Data Generator Mode** - Create randomized point history for demo/sales sites
3. **Balance Transfer Mode** - Transfer point balances from other systems to LiveSchool
4. **Merge Students Mode** - Replay behavior transactions from a duplicate student record onto the correct student

**Live URL:** https://points.liveschoolhelp.com

**Deployment:** Vercel (auto-deploys on push to main)

## Quick Start for Team Members

### Assign Points Mode (Default)

1. Open the tool in your browser
2. Upload the school's XLSX file (drag & drop or click)
3. Upload the LiveSchool CSV export
4. Select how names are formatted:
   - **Combined column**: Names in "Last, First" format in one column
   - **Separate columns**: Last Name and First Name in different columns
5. Enter Roster ID, Location ID, and School ID
6. Enter Behavior ID for each tab (or use "Apply to All")
7. Click "Run Matching" to match names
8. Review any unmatched students
9. Click "Generate Scripts"
10. Copy the script and paste into LiveSchool's browser console

### Demo Data Generator Mode

Use this mode to backfill randomized point history for demo sites.

1. Click "Demo Data Generator" toggle at the top
2. Upload the LiveSchool CSV export (to get student IDs)
3. Enter Roster ID, Location ID, and School ID
4. Add behaviors:
   - Click "Show Behavior Discovery Script" to get a helper script
   - Paste the script in LiveSchool's console to list available behaviors
   - Add at least one behavior (merit or demerit - both not required)
5. Configure settings:
   - Start/End dates for the demo period
   - Min/Max points per student
   - Positive:Negative ratio (e.g., 4:1)
6. Click "Generate Demo Script"
7. Copy the script and paste into LiveSchool's browser console

### Balance Transfer Mode

Use this mode to transfer point balances from other student management systems.

1. Click "Balance Transfer" toggle at the top
2. Upload the school's CSV file with student names and point balances
3. Upload the LiveSchool CSV export (to get student IDs)
4. Select which columns contain:
   - Student names (in "FirstName LastName" format)
   - Point amounts to transfer
5. Click "Run Matching" to match names
6. Review any unmatched students and select correct matches
7. Click "Generate Script"
8. Copy the script and paste into LiveSchool's browser console (admin.liveschoolinc.com)

### Merge Students Mode

Use this mode when a school has duplicate student records (e.g., one manually created, one from Clever sync) and needs to replay the original student's behavior transactions onto the correct record.

1. Click "Merge Students" toggle at the top
2. Enter the Original Student ID (source) and New Student ID (target)
3. Enter the Roster ID, Location ID, and School ID
4. Upload the extended data export (TSV) for the original student's transaction history
5. Paste the behavior JSON (from `GET /v2/schools/{schoolId}/behaviors`) to map behavior names to IDs
6. Click "Parse Transactions" to review mapped/unmapped behaviors and transaction groups
7. Resolve any unmapped behaviors using the dropdown
8. Click "Generate Script"
9. Copy the script and paste into LiveSchool's browser console

## File Formats

### School XLSX File
- Multiple tabs allowed (each tab = different behavior to assign)
- Names are usually ALL CAPS
- May include their own student ID column (ignore it - we need LiveSchool IDs)

**Supported name formats:**

1. **Combined column** - Student names in format: `LASTNAME, FIRSTNAME MIDDLENAME`
   - The comma is the delimiter between last name and first name

   **Example:**
   ```
   StudentID    StudentName
   240975409    ABDELMEGUID, ROAA ABDELGHANY
   250112601    ACEVEDO POLO, LUISA
   ```

2. **Separate columns** - Last name and first name in different columns

   **Example:**
   ```
   StudentID    LastName           FirstName
   240975409    ABDELMEGUID        ROAA ABDELGHANY
   250112601    ACEVEDO POLO       LUISA
   ```

### LiveSchool CSV Export
- Row 1: Version ID metadata (skip this row)
- Row 2: Headers - `id`, `First Name*`, `Last Name*`, `Grade*`, then roster columns
- Column 1: Student ID (this is what we need)
- Column 2: First Name (may include middle name)
- Column 3: Last Name

**Example:**
```
Version ID (do not change)    V1769053254.6213
id    First Name*    Last Name*    Grade*
4083858    ROAA ABDELGHANY    ABDELMEGUID    10
3707920    LUISA    ACEVEDO POLO    10
```

## Name Matching Challenges

### 1. Compound Last Names
School file may have full compound name, LiveSchool may have only first part.
- School: `LLIVISACA MALDONADO, BRIAN`
- LiveSchool: `LLIVISACA, BRIAN`
- **Solution:** Check if first word of school's last name matches LiveSchool's last name

### 2. Truncated Last Names
LiveSchool truncates last names to ~20 characters.
- School: `GARCIALOPEZFERNANDEZ, MARIA`
- LiveSchool: `GARCIALOPEZFERNA, MARIA`
- **Solution:** If school's last name starts with LiveSchool's last name (and LS name is 15+ chars), consider it a match

### 3. Middle Names in First Name Field
Either file may include middle names in the first name field.
- School: `SMITH, JOHN MICHAEL`
- LiveSchool: `SMITH, JOHN`
- **Solution:** Check if first word of first names match, or if one starts with the other

## LiveSchool API

### Endpoint
```
POST https://api.liveschoolapp.com/v2/conducts
```

### Required Headers
```javascript
{
    "accept": "application/json, text/plain, */*",
    "content-type": "application/json"
}
```

### Credentials
Must include `credentials: "include"` to send auth cookies. User must be logged into LiveSchool in the same browser.

### Payload Format
```javascript
{
    "time": "04:42:57",           // HH:MM:SS format
    "date": "2026-01-22",         // YYYY-MM-DD format
    "roster": 2315434,            // Number
    "location": 22465,            // Number
    "students": [3706219, ...],   // Array of student ID numbers
    "school": 4583,               // Number
    "behaviors": {
        "228201": {               // Behavior ID as STRING key
            "type": "merit"       // or "demerit"
        }
    },
    "comment": ""                 // Optional comment string
}
```

### Critical: Behaviors Format
The `behaviors` field must be an **object with behavior ID as the key**, NOT an array:
```javascript
// CORRECT
behaviors: { "228201": { type: "merit" } }

// WRONG - will silently fail
behaviors: [{ id: 228201, type: "merit" }]
```

### Batch Size Limit
The API fails with a generic error if too many students are sent at once.
- **Working batch size:** 50 students per request
- **Delay between batches:** 1000ms to avoid rate limiting
- **Retry logic:** 3 attempts with exponential backoff (2s, 4s, 6s)

### Response Format
The API returns HTTP 200 even on errors. Check the response body:
```javascript
// Success
{ /* conduct data */ }

// Error
{ status: "error", error: "Something went wrong!..." }
```

## Configuration IDs

These IDs are specific to each school and must be obtained from LiveSchool:

| Field | Description | How to Find |
|-------|-------------|-------------|
| `roster` | Roster ID | From LiveSchool URL or network requests |
| `location` | Location ID | From LiveSchool URL or network requests |
| `school` | School ID | From LiveSchool URL or network requests |
| `behaviors.ID` | Behavior ID | Give one point manually, check network request |

These stay the same for a single school but change between schools.

## UI Features

### Header Navigation
- **User email**: Shows logged-in user's email
- **What's New**: Opens changelog modal showing recent updates
- **Help**: Opens welcome/getting started modal
- **Tests**: Links to test suite (tests.html) for verifying functionality
- **Sign Out**: Logs out and returns to login screen

### Progress Tracking
- 6-step wizard with locked progression
- Steps unlock as you complete previous ones
- Progress bar shows current step
- Sticky summary bar at top shows status at a glance

### File Upload
- Drag-and-drop support
- Visual feedback (green border when file loaded)
- Loading spinner while parsing
- Checkmark on successful load

### Behavior Assignment
- "Apply to All Tabs" button for bulk assignment
- Individual behavior ID, type, and comment per tab
- Student count shown per tab

### Matching
- Traffic light indicator for match rate:
  - 🟢 Green: ≥95% matched
  - 🟡 Yellow: ≥80% matched
  - 🔴 Red: <80% matched
- Unmatched students shown with suggested matches
- Dropdown to manually select correct student

### Script Output
- Syntax highlighting (Prism.js)
- Copy button with "Copied!" feedback
- Download as .js file option
- Scrollable code blocks

## Script Features

The generated script includes:
1. **Batching:** Splits students into groups of 50
2. **Retry logic:** 3 attempts with exponential backoff (2s, 4s, 6s delays)
3. **Progress logging:** Shows batch progress in console
4. **Error reporting:** Lists failed student IDs if any batches fail
5. **Auto-generated retry script:** If batches fail, outputs a ready-to-paste script for just the failed students

### Retrying Failed Batches

If any batches fail after all retry attempts, the script automatically outputs a complete retry script in the console:

```
=== COMPLETE ===
Successfully processed: 200/250 students
Failed students (50): [3706219, 3707648, ...]

// ========== RETRY SCRIPT FOR FAILED STUDENTS ==========
// Copy and paste this entire block to retry the 50 failed students

const retryEntry = {
  "roster": 2315434,
  "location": 22465,
  "students": [3706219, 3707648, ...],
  "school": 4583,
  "behaviors": { "228201": { "type": "merit" } }
};

(async () => {
    // ... complete retry logic
})();
// ========== END RETRY SCRIPT ==========
```

**To retry failed students:**
1. Look for the retry script in the console output (between the `=====` lines)
2. Copy the entire retry script
3. Paste it into the console
4. Press Enter

The retry script includes only the failed student IDs with all original settings preserved.

## Project Structure

```
liveschool-points-app/
├── index.html          # Main page with UI
├── styles.css          # All styling
├── tests.html          # Browser-based test suite
├── claude.md           # This documentation
└── js/
    ├── app.js          # Main application logic (App, DemoApp, BalanceApp, MergeApp modules)
    ├── matcher.js      # Name matching with Fuse.js
    └── parser.js       # XLSX and CSV parsing
```

## Dependencies (loaded via CDN)

- **SheetJS (xlsx)** - Parse XLSX files
- **PapaParse** - Parse CSV files
- **Fuse.js** - Fuzzy string matching
- **Prism.js** - Syntax highlighting

## Deployment

This is a static site - no server-side code required.

### Option 1: GitHub Pages (Free)
1. Push code to GitHub repository
2. Go to Settings → Pages
3. Select branch and folder
4. Access at `username.github.io/repo-name`

### Option 2: Netlify (Free)
1. Connect GitHub repo or drag-drop folder
2. Auto-deploys on push
3. Custom domain support

### Option 3: Traditional Web Host
1. Upload all files to web server
2. Point subdomain (points.liveschoolhelp.com) to folder
3. No build step needed

### Option 4: Vercel (Free)
1. Connect GitHub repo
2. Auto-deploys on push
3. Custom domain support

## Local Development

To test locally:
```bash
# Navigate to project folder
cd ~/liveschool-points-app

# Option 1: Open directly in browser
open index.html

# Option 2: Use a local server (if you have Python)
python3 -m http.server 8000
# Then open http://localhost:8000
```

## Testing

The project includes a browser-based test suite at `tests.html`.

### Running Tests

1. Click the "Tests" link in the header navigation (after signing in), or
2. Open `tests.html` directly in a browser (https://points.liveschoolhelp.com/tests.html)
3. Tests run automatically on page load
4. Results show pass/fail for each test with details on failures

### Test Coverage

The test suite covers:

**Parser Module:**
- `parseStudentName()` - Comma-separated "LASTNAME, FIRSTNAME" format
- `parseFirstLastName()` - "FirstName LastName" format (Balance Transfer mode)
- `getColumnInfo()` - Column header extraction
- `extractBalanceData()` - Balance file data extraction
- `parseBehaviorJson()` - LiveSchool behavior API JSON parsing (Merge Students mode)

**Matcher Module:**
- `lastNamesMatch()` - Compound names, truncation handling
- `firstNamesMatch()` - Middle name handling
- `findExactMatch()` - Direct matching
- `matchStudent()` - Single student matching with status
- `matchAllStudents()` - Batch matching
- `getAllStudentsForDropdown()` - Sorted dropdown list

**Integration Tests:**
- End-to-end flow from parsing "FirstName LastName" to matching LiveSchool students

## Security Notes

- All processing happens in the browser - no data sent to external servers
- Student data never leaves the user's machine (except to LiveSchool's API)
- Config (roster/location/school IDs) saved in browser localStorage
- User must be logged into LiveSchool for API calls to work

## Troubleshooting

### "Something went wrong" error from API
- Usually means too many students in one batch (fixed with batching)
- Could be rate limiting - retry logic handles this
- Check that you're logged into LiveSchool

### Students not matching
- Check if names have different formats
- Look for truncated last names
- Try the suggestions dropdown for close matches

### Script runs but no points appear
- Verify behavior ID is correct
- Check roster/location/school IDs
- Refresh LiveSchool - there may be a display delay

### Batch failed after retries
- The script automatically generates a retry script in the console
- Copy and paste the retry script to try again with just the failed students
- If retries keep failing:
  - Wait a few minutes (API might be rate limiting)
  - Try with smaller batches
  - Check if student IDs are valid in LiveSchool
  - Could be a temporary LiveSchool API issue

## Demo Data Generator

The Demo Data Generator mode allows you to create realistic point history for demo sites. This is useful for sales demos where you need a site to have existing data.

### How It Works

1. **Upload Students**: Upload a LiveSchool CSV export to get student IDs
2. **Configure Site**: Enter the Roster ID, Location ID, and School ID
3. **Add Behaviors**: Add behaviors to use for demo data (can be all merits, all demerits, or a mix)
4. **Set Parameters**:
   - **Date Range**: Points will only be assigned on weekdays (Mon-Fri)
   - **Points Per Student**: Random number between min and max
   - **Ratio**: Positive to negative point ratio (e.g., 4:1 = 80% positive). Auto-adjusts to 100% if only one behavior type is present.
5. **Generate**: Creates a script that randomizes everything:
   - Different behaviors per student
   - Random dates within the range
   - Random times within school hours (8:00 AM - 3:30 PM)
   - Random comments (positive for merits, constructive for demerits)

### Importing Behaviors

**Option 1: From API Response (Recommended)**
1. Log into LiveSchool in your browser
2. Open DevTools (F12) → Network tab
3. Refresh the page or navigate to the points screen
4. Look for a request to `/behaviors`
5. Click it and go to the Response tab
6. Copy the entire JSON response
7. Paste into the "Import from Discovery Script" textarea
8. Click Import

The tool handles the LiveSchool API format automatically, including:
- Behaviors with type "positive", "negative", or "both"
- Hidden behaviors (automatically skipped)
- Object format `{ items: { "12345": {...} } }`

**Option 2: Discovery Script**
1. Click "Show Behavior Discovery Script"
2. Copy the script
3. Paste in LiveSchool's browser console
4. Copy the JSON output
5. Paste into the Import textarea

### Demo Script Features

The generated demo script includes:
- **Batching**: Groups requests to avoid API limits (50 students per batch)
- **Retry Logic**: 3 attempts with exponential backoff
- **Progress Logging**: Shows progress in the console
- **Random Distribution**: Points are shuffled for realistic variety
- **Random Comments**: Contextually appropriate comments for each point

### Random Comments (PBIS-Aligned)

The demo data includes realistic comments following PBIS (Positive Behavioral Interventions and Supports) best practices:

**Behavior-Specific Praise (50% of positive points):**

PBIS research shows effective praise should be specific and observable, stating exactly what behavior the student demonstrated. Our comments follow the formula: [Praise word] + [specific behavior observed]

Examples:
- "Thank you for following directions the first time"
- "Great job staying focused during the lesson"
- "I appreciate how you worked quietly at your desk"
- "Nice job being prepared with all your materials today"
- "Thank you for raising your hand and waiting to be called on"
- ...and 15 more behavior-specific variations

**Corrective Feedback (100% of negative points):**

PBIS corrective feedback should be brief, respectful, and state the expectation. Our comments follow this pattern:

Examples:
- "Reminder: Please stay focused on the task at hand"
- "Remember to raise your hand before speaking"
- "Redirected to follow classroom expectations"
- "Please follow directions the first time asked"
- "Reminder to use appropriate voice level"
- ...and 15 more respectful redirections

**Why These Patterns:**
- Positive: 50% have comments because teachers often give quick acknowledgments without detailed notes
- Negative: 100% have comments because documentation is important for behavior tracking and parent communication
- All comments are specific to observable behaviors, not vague praise like "Good job!"

**Sources:**
- [IRIS Center - Behavior-Specific Praise](https://iris.peabody.vanderbilt.edu/module/bi2-elem/cresource/q1/p02/)
- [Understood.org - Respectful Redirection](https://www.understood.org/en/articles/behavior-strategy-respectful-redirection)
- [PBIS.org](https://www.pbis.org/)

### Example Output

```
=== DEMO DATA GENERATOR ===
Students: 150
Date range: 2025-08-01 to 2025-12-15
Weekdays: 98
Points per student: 15-40
Ratio: 4:1

Generating point assignments...
Total assignments: 4125

[Batch 1/83] 2025-08-05 | merit 228201 | 50 students ✓
[Batch 2/83] 2025-08-12 | demerit 228203 | 35 students ✓
...

=== COMPLETE ===
Successfully processed: 4125 point assignments
Demo data generation complete!
```

## Balance Transfer Mode

The Balance Transfer mode allows you to transfer point balances from other student management systems to LiveSchool. This is useful when schools are migrating to LiveSchool and want to preserve their students' existing point balances.

### How It Works

1. **Upload Source File**: Upload the school's CSV with student names and point balances
2. **Upload LiveSchool CSV**: Upload a LiveSchool CSV export to get student IDs
3. **Select Columns**: Choose which columns contain student names and point amounts
4. **Review Matches**: See matched students, resolve unmatched with fuzzy suggestions
5. **Generate Script**: Get an async script with retry logic

### Input File Formats

**School Balance CSV:**
```
studentId,grade,studentName,availablePoints
1043136,1,Arianna Martinez,73
1043525,1,Fabiola Murillo Martinez,59
1043719,1,Pedro Plancarte Abarca,14
```

- `studentName`: Names in "FirstName LastName" format (last name can be multiple words)
- `availablePoints`: The point balance to transfer
- Other columns (studentId, grade) are ignored - we need LiveSchool IDs

**LiveSchool CSV:** Standard export format (same as other modes)

### Name Matching

For "FirstName LastName" format where last name can be multiple words:
- Input: "Fabiola Murillo Martinez"
- Parsed as: firstName = "Fabiola", lastName = "Murillo Martinez"
- Uses fuzzy matching to handle variations

### Transfer API

```
POST https://admin.liveschoolinc.com/popup/transaction/add
Content-Type: multipart/form-data (handled automatically by FormData API)

Fields:
- category: "adjustment"
- name: "Starting Bank Balance"
- reward: [school-specific reward ID - user must enter this]
- amount: [point amount]
- student: [LiveSchool student ID]
- type: "credit"
```

**Finding the Reward ID:** To find the reward ID for a school:
1. Log into LiveSchool admin (admin.liveschoolinc.com)
2. Go to Banking > Transactions
3. Manually add a transaction for any student
4. Open DevTools (F12) > Network tab
5. Look for the POST request to `/popup/transaction/add`
6. Find the `reward` field in the request body

### Generated Script Features

- Async/await with proper delays (200ms between requests)
- Retry logic (3 attempts with exponential backoff)
- Progress logging: `[1/150] StudentName: 73 points ✓`
- Error collection and retry script generation
- Summary with success/failure counts

## Merge Students Mode

The Merge Students mode replays behavior transactions from a duplicate student record onto the correct student. This is needed when a school manually creates a student who later comes through Clever sync, resulting in two separate records with transaction history split between them.

### How It Works

1. **Enter IDs**: Enter the Original Student ID (source of transactions) and the New Student ID (target to replay onto), plus the Roster ID, Location ID, and School ID
2. **Upload Points Log**: Upload the extended data export (TSV) from LiveSchool containing the original student's transaction history
3. **Import Behavior Map**: Paste the JSON output from `GET /v2/schools/{schoolId}/behaviors` so behavior names can be mapped to numeric IDs
4. **Review Transactions**: Click "Parse Transactions" to see mapped/unmapped behaviors, API call count, and skipped rewards
5. **Resolve Unmapped**: If any behavior names don't match, select the correct behavior from the dropdown
6. **Generate Script**: Creates a sequential console script that replays each transaction group

### Extended Data Export Format (TSV)

The input file is a tab-separated export from LiveSchool with these key columns:

| Column | Used For |
|--------|----------|
| `Record ID` | Groups rows into single API calls (same Record ID = one original point-giving action) |
| `Behavior / Reward Name` | Matched to behavior IDs via the imported JSON |
| `Type` | "Behavior" rows are replayed; "Reward" rows are skipped |
| `Official Date` | Used as the `date` field in the API call |
| `Official Time` | Used as the `time` field in the API call |
| `Comment` | Passed through to the API call if present |
| `Student LiveSchool ID` | For validation (should match the original student ID) |

### Behavior Name Matching

Behavior names from the export are matched to IDs from the behavior JSON using case-insensitive, whitespace-trimmed comparison. If a name doesn't match (e.g., the behavior was renamed or has trailing spaces), the user can manually map it using a dropdown.

### Generated Script Features

- Sequential processing (one API call at a time, since we're targeting a single student)
- 1.5 second delay between API calls
- 3 retry attempts with exponential backoff (2s, 4s, 6s)
- Progress logging with behavior names and dates
- Failure collection and summary
- Uses `POST /v2/conducts` with `credentials: "include"`

### Important Notes

- **Store purchases are skipped**: Rows where `Type = "Reward"` use a different API endpoint and are not replayed
- **Teacher attribution**: All replayed transactions will be attributed to whoever is logged into LiveSchool, not the original teacher
- **The API accepts backdated dates**: The `date` field can be set to historical dates
- **Multiple behaviors per Record ID**: When a teacher gave multiple behaviors at once (same Record ID), they are combined into a single API call with multiple entries in the `behaviors` object

## Onboarding & Help

The tool includes built-in onboarding for new users:

- **Welcome Modal**: Shows automatically on first visit with getting started guide
- **Changelog Modal**: Shows automatically when returning users encounter a new version
- **Help Button**: Click "Help" in the header to re-open the welcome guide anytime
- **What's New Button**: Click to see the changelog and recent updates

First-visit and version tracking uses localStorage keys:
- `liveschool-points-visited`: Whether user has seen welcome modal
- `liveschool-points-version`: Last version user has seen

## Changelog

### v2.3.0 (February 2026)
- **New: Merge Students Mode** - Replay behavior transactions from a duplicate student onto the correct record
- Upload the extended data export (TSV) of the original student's transaction history
- Import behavior JSON to map behavior names to IDs
- Review and resolve unmapped behaviors before generating script
- Generated script processes transactions sequentially with 1.5s delay and retry logic
- Added `Parser.parsePointsLog()` for TSV parsing and `Parser.parseBehaviorJson()` for behavior API JSON parsing
- Added `MergeApp` module in app.js

### v2.2.3 (January 2026)
- **Improved: Demo Data Generator** - No longer requires demerit behaviors
- Can now generate demo data with only merit behaviors (or only demerits)
- Ratio auto-adjusts to 100% positive/negative when only one behavior type is present

### v2.2.2 (January 2026)
- **Improved: UX/UI overhaul** - Enhanced visual design and usability
- Settings dropdown menu replaces loose utility links (gear icon)
- Stronger active state for mode toggle (bold text + underline indicator)
- SVG file type icons in upload zones (green for XLSX, blue for CSV)
- "Select File" buttons inside dropzones for clearer interaction
- Help tooltips with format requirements (hover on "?" icon)
- Progress stepper improvements (clickable completed steps, colored connecting lines)
- Lock icons with title tooltips for locked steps
- Improved text contrast for WCAG AA accessibility

### v2.2.1 (January 2026)
- **Improved: Balance Transfer script** - Now uses browser's FormData API for proper multipart encoding
- Added school-specific Reward ID field (required - varies by school)
- Added test suite (`tests.html`) for Parser and Matcher modules
- Added "Tests" link in header navigation for easy access to test suite

### v2.2.0 (January 2026)
- **New: Balance Transfer Mode** - Transfer point balances from other systems to LiveSchool
- Upload school CSV with student names and point amounts
- Match students using fuzzy name matching (handles "FirstName LastName" format)
- Manual match resolution for unmatched students
- Generates async script with retry logic for reliable transfers

### v2.1.0 (January 2026)
- **New: Separate column support** - Now supports school files with names in separate "Last Name" and "First Name" columns
- Choose between "Combined column" (Last, First format) or "Separate columns" when selecting name columns
- Auto-detects column headers when using separate column mode

### v2.0.0 (January 2026)
- **New: Demo Data Generator Mode** - Create randomized point history for demo sites
- Configurable positive:negative ratios (3:1, 4:1, 5:1, etc.)
- Date range selection with weekday-only distribution
- PBIS-aligned random comments:
  - Behavior-specific praise for positive points (50% include comments)
  - Respectful corrective feedback for negative points (100% include comments)
- Import behaviors directly from LiveSchool API response
- Behavior discovery script
- Welcome modal for first-time visitors
- Changelog modal for returning users

### v1.1.0 (January 2026)
- Added retry script generation for failed batches
- Improved error handling and progress logging

### v1.0.0 (January 2026)
- Initial release
- Name matching with fuzzy search
- Batch processing with retry logic
- Manual match resolution for unmatched students

## Future Improvements

- [ ] Persist matched results in localStorage to survive page refresh
- [ ] Save/recall school configurations by name
- [ ] Export unmatched students list as CSV
- [ ] Real-time progress bar during script execution
- [ ] Dry-run mode to preview without submitting
- [ ] Dark mode support
