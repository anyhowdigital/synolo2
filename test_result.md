# UI batch final handoff — VERIFIED
- Scope delivered: shared filters/page headers/page size25–200 across7remaining lists + responsive invoices at390px. Existing palette/colors/typography tokens unchanged, globals.css sha5016fde68189a2eddbece14ae5e48b37eb23a127d14514bf72a2516882b3682d. No auth/schema/API/AI changes.
- QA55–58 final no open app defects: customer pageSize loss fixed/retested; invoice clamp confirmed32rows on page99 (55false-negative retracted57); real IBAN spaced/unspaced matches; office56fixtures205charges+30tasks+30docs passed and cleaned. Read57/58 for latest.
- Final tabs layout override verified main mobile height62/spill0/overlapfalse/overflow[] and QA58 real mouse+keyboard interactions desktop/mobile. Initial immediate click failure before hydration was test timing, no handler change needed.
- Artifacts caveat: QA55 and57 images exist and main viewed them. QA58 claimed savedimages are NOT local; rely main screenshot+58interactionreport, do not invent asset links. Removed comment-only frontend/tests/iter57_narrow.py marker. iter55_seed.py wrong count-column query fixed; ISOtimezone verified without reseeding.
- Latest typecheckPASS, targeted ESLint0errors6preexisting warnings. All QA55/56 fixtures gone incl2090fee-months (SQL verified). Test credentials unchanged.
- Pending USER clarification only for Astra: specific service/API (needs URL) vs development agent vs desired assistant name. Ask_human failed platform linter engine; question was sent as commentary. DO NOT pretend Astra integrated or choose a provider without this clarification. UI work is independently approved and complete for above scope.


# Final UI retest scope
Reports55/56: business fixtures and30office assertions tested; fixture cleanup verified. Report55 invoice clamp failure is NOT reproduced: main real browser /invoices?pageSize=50&page=99 returned HTTP200, range1–32 από32,32 tbody rows, empty-state0 (1920×800 screenshot). No invoices/page.tsx change needed; tester must wait pagination-range before asserting. Main mobile screenshot found table's intentional horizontal scrolling hid totals; now invoices-table.tsx mobile has fixed3-column layout: checkbox, number+customer, amount+status. Desktop separate columns retained; colors unchanged. Need57: mobile raw right-edge overflow[] & bulk select/unselect without actions, verify invoice clamp after readiness, valid IBAN search spaced/unspaced (55 fixture was wrong), retrieve/retake missing56 office screenshots with target element scrolled into view. Office functional suite passed; no repetition needed. No credential/integration changes.


# Current UI QA checkpoint (supersedes older diagnostics below)
UI seven-list batch implemented, globals.css unchanged. Report53 presence-only; report54 actual55-project pagination PASS, identified customer pageSize loss, invoice out-of-range empty, disabled links invalid href. FIXED awaiting retest: customers/suppliers/expenses callbacks use current size fallback; lib/services/invoices.ts clamps page against count; shared pagination uses real disabled buttons at boundaries. Need business banking/employees + office tasks/docs/fees populated tests, preserving credentials/data/external providers. Parallel suites55/56 use separate fixture prefixes and tables, cleanup required. Astra integration NOT performed pending clarification. No auth/schema/API integration change.


# Current audit evidence override
Reports43/44 are diagnostics only; application issues remain OPEN pending user approval. Never claim full page/tenant coverage from report43. Main viewed report44's four alleged bridge screenshots: ALL depict business dashboards, not the requested bridges. Those images are NOT bridge UX evidence. Main then independently verified real business and office bridge pages at1920×800 and390×844 using real login plus explicit route/bridge-export-card waits, mobile overflow[], and zero-checkbox export href. Main also inspected /invoices/new and /office/alerts at390×844; actual alert-fix href=/office/bulk. Correct screenshots appeared inline in tool output, on REMOTE browser /tmp (not local files). Console logs copied to /app/test_reports/verified_backoffice/. See /app/memory/BACKOFFICE_AUDIT.md for authoritative evidence limits and /app/memory/PROVIDER_READINESS.md for research. Offline actual-function diagnostic log /app/test_reports/iter43/bridge_offline_diag.log:3PASS,7FAIL with MOCKED fetch only. Test VAT assertion must be made exact (24%→1) before final fix regression. No application code, business data, secrets or owner account changed.


#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

## Exploratory audit — current request
user_problem_statement: "Υπάρχουν γενικά θέματα στην τιμολόγηση ειδικά στα b2g, στις ρυθμίσεις και γενικά αρκετά θέματα και λειτουργικά και εμπειρίας χρήσης. Θέλω να μου τα βρεις. Έχει θέματα παντου. Κάνε check και στα νέα και δες και ux."
metadata:
  created_by: main_agent
  test_sequence: 30
  run_ui: true
test_plan:
  current_focus:
    - Reproduce invoicing/B2G lifecycle and settings defects; challenge iteration_29 assumptions
    - Test newer employees, leave requests, payroll, bonuses, SEPA, terminations, ERGANI UI safely
    - Cross-panel navigation and meaningful desktop/mobile UX flows
  test_all: false
  test_priority: high_first
agent_communication:
  - agent: main
    message: "Diagnostic audit only requested; no application changes made. Batch tests, use existing demo accounts, isolate disposable records. NEVER submit to live ERGANI/AADE/B2G, send emails, charge cards, rotate tokens, or modify stored credentials. ERGANI may be LIVE. Verify pending issue claims, distinguish actual bugs from unsupported assumptions and gaps. Need reproducible evidence and prioritized findings, plus tested/not-tested scope."


## Resume — lightweight completion audit
- User: «Συνέχισε με όλους τους ελέγχους αλλά με πιο ελαφρύ τρόπο»; prioritize UI/navigation.
- Diagnostic only: no application changes, credential changes or live submissions. Reuse reports 30/31, no repetition of proven checks.
- Remaining: authenticated desktop/mobile business/office/staff navigation; settings history; employee month/search preservation; sidebar active states; safe forms, new exports and secondary module smoke checks.
- Wait for hydration before login. If blocked, reuse existing authorized demo session read-only from SQLite for UI coverage; report workaround, not login PASS.
- Evidence corrections: valid-AFM cancelled B2G fixture; actual workCardPayload import; actual SEPA/PDF output. Record all external verification limitations.


## Approved read-only back-office / bridges diagnostic audit
- User: «Άσε το super admin πάμε στα back offices (και πελατών). Τρέξε τρομακτικά τεστ σε θέματα design και ux consistency. Βρες μου προβλήματα, δυσνόητα και δίπλα πράγματα. Κάνε όλες τις γέφυρες να δουλεύουν και τέλος ετοίμασε μας να κάνουμε δικό μας πάροχο ηλεκτρονικής τιμολόγησης. Πριν προχωρήσεις με ρωτάς».
- Approval: «Ναι αλλά βρες μου τρόπο να μην αργήσεις πάρα πολύ» to first diagnostic package only, no application changes.
- Scope: batched desktop/mobile business + office UX, navigation, consistency, confusing/duplicate workflows, read-only bridge export/parser/adapter diagnostics. Super-admin and ChatGPT excluded.
- MUST NOT: modify application source or existing business data; issue/cancel invoices; call live bridge/AADE/ERGANI/B2G; send email or charge cards; change credentials. Offline request stubs are allowed ONLY for adapter contract tests and must be labelled MOCKED, not live evidence.
- Prioritize confirmed high-impact findings, preserve reproducible scripts and report iteration_43.json, distinguish runtime bugs from static risks and untested external blockers. Existing data / authorized demo sessions may be used read-only; disclose if login was bypassed.
- Current preview comes from frontend/.env REACT_APP_BACKEND_URL. Reports 30–42 are historical, do not repeat every past test.


## Current approved UI homogenization — implementation pending QA
- User: «Ενσωμάτωση Astra με το καταλληλότερο διαθέσιμο μοντέλο / Ομογενοποίηση UI με τον διαθέσιμο Design Agent, με ακριβώς τα σημερινά χρώματα».
- Astra meaning is ambiguous (service vs development agent vs assistant name). Clarification requested; ask_human tool rejected by platform linter engine. NO Astra/Claude integration or AI rename performed. Only independently approved UI work implemented.
- Design Agent provided updated design_guidelines.json. Actual existing names, permissions, workflows and all color classes/tokens retained rather than invented blueprint states/actions (e.g. employees remain read-only, banking lists accounts not transactions).
- Implemented FilterBar + ListPagination 25/50/100/200 in projects, banking, employees, office clients/tasks/fees/documents. Query-backed filters, page reset on filter change, clamped page ranges, empty states, explicit date meaning, existing PageHeader reuse, TableShell reuse. Fees now separates editable client fees vs charges into two views with independent applicable filters. Existing document current-org scope is explicitly named; removed old 20-request cap, fee 200-charge cap for real pagination.
- Shared changes: min-w-0 on headers/table shells/filter/date range containers; search/date form remount on query/reset; filtersActive for clearing status-only filters. No color token/style palette changes, no schema/auth/actions/API integrations changed.
- Baseline globals.css SHA256 MUST remain 5016fde68189a2eddbece14ae5e48b37eb23a127d14514bf72a2516882b3682d.
- Initial typecheck passed. Targeted ESLint has 0 errors; 6 pre-existing ternary expression warnings in client-link-panel/fees-panel.
- QA focus: real authenticated frontend flows at 1920x800 and 390x844, palette unchanged both modes, query search/status/date/from/to/month/reset/page size/next-prev including >25 realistic rows, long texts and preserved summary totals. Fees filter month must NOT change generation month; do NOT generate actual charges. Tasks complete/reopen isolated record only; no real email sends, do not approve/link/unlink clients. Test document filter without uploading. Existing /invoices and /customers shared-component regressions. Test credentials in memory/test_credentials.md; no accounts modified.
