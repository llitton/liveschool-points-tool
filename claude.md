# LiveSchool Points Tool - Development Notes

## Overview

This tool helps bulk-assign behaviors (points) to students in LiveSchool by:
1. Parsing a school-provided XLSX file with student names
2. Matching names against a LiveSchool CSV export to get student IDs
3. Generating a script to batch-submit behaviors via the LiveSchool API

**Live URL:** https://points.liveschoolhelp.com (if deployed)

## Quick Start for Team Members

1. Open the tool in your browser
2. Upload the school's XLSX file (drag & drop or click)
3. Upload the LiveSchool CSV export
4. Select the column containing student names
5. Enter Roster ID, Location ID, and School ID
6. Enter Behavior ID for each tab (or use "Apply to All")
7. Click "Run Matching" to match names
8. Review any unmatched students
9. Click "Generate Scripts"
10. Copy the script and paste into LiveSchool's browser console

## File Formats

### School XLSX File
- Multiple tabs allowed (each tab = different behavior to assign)
- Student names typically in format: `LASTNAME, FIRSTNAME MIDDLENAME`
- The comma is the delimiter between last name and first name
- Names are usually ALL CAPS
- May include their own student ID column (ignore it - we need LiveSchool IDs)

**Example:**
```
StudentID    StudentName
240975409    ABDELMEGUID, ROAA ABDELGHANY
250112601    ACEVEDO POLO, LUISA
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
2. **Retry logic:** 3 attempts with exponential backoff
3. **Progress logging:** Shows batch progress in console
4. **Error reporting:** Lists failed student IDs if any batches fail

## Project Structure

```
liveschool-points-app/
├── index.html          # Main page with UI
├── styles.css          # All styling
├── claude.md           # This documentation
└── js/
    ├── app.js          # Main application logic
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
- The specific student IDs are logged in console
- May need to run those manually
- Could be invalid student IDs

## Future Improvements

- [ ] Persist matched results in localStorage to survive page refresh
- [ ] Save/recall school configurations by name
- [ ] Export unmatched students list as CSV
- [ ] Real-time progress bar during script execution
- [ ] Dry-run mode to preview without submitting
- [ ] Dark mode support
