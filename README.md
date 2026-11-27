# PEP Order Desk
Veeral Patidar · 22JE1065

Live app: https://pep-po-desk-vp26.dependablemango64.chatgpt.site

## Milestones 2–3 — approval workflow and permission tests
Sign in as creator1 or creator2 to enter purchase orders and attach original PDFs. Sign in as approver1 to review submitted orders. lead1 has both roles. Demo passwords are provided separately. Use synthetic data for this shared demonstration.

Create draft → submit → reject with a reason → edit the same PO → resubmit → approve. Open the original from the PO page. The creator can see the final record and all four actions. The Finance queue shows submitted orders only. Milestone 4 adds editable PDF text extraction; OCR remains out of scope.

## Run and verify
Use Node 24. Run `npm ci`, `npm test`, then `npm run build`. The tests use real local SQLite and an in-memory object-store stand-in. The build bundles the Worker into dist/server/index.js. For an isolated local UI with the same service bindings:

    npm run build
    npx wrangler@4 d1 execute DB --local --config wrangler.local.json --file drizzle/0000_sturdy_mister_fear.sql
    npx wrangler@4 dev --local --config wrangler.local.json

Open the local URL printed by Wrangler. The four demo accounts are initialized on their first successful login. Use the secure localhost origin where supported. The local configuration is for development only. The deployed site provisions DB and BUCKET through .openai/hosting.json, and applies the SQL in drizzle/ at deployment. For schema changes edit db/schema.js and run npm run db:generate.

## Request journey and controls
Browser → Worker → private R2 original → D1 PO record → response with the PO ID. The Worker validates the PDF signature and size, uses a random object key, and checks PO access before streaming the original. The form captures the number, date, vendor, printed total and manual rows. D1 keeps a unique normalized PO number, money in paise, and line items as JSON on the PO so edits replace the entire item set atomically.

worker/auth.js checks bcrypt password hashes (cost 10), issues an eight-hour HttpOnly cookie, and stores a SHA-256 digest of the session token in D1. Roles come from the session's user row. Logout revokes the session. Missing or expired sessions return 401. No plaintext passwords or session tokens belong in source or logs.

worker/orders.js restricts creator reads and writes to owned records. A creator opening another creator's order gets 404 to avoid disclosing its contents. An ineligible decision gets 403. An invalid transition, duplicate number or stale revision gets 409. Approval and rejection require an approver, a different owner, and SUBMITTED status. A D1 batch applies a revision-checked status change and appends one history entry for that successful operation. History has no edit or delete route. Submitted and approved contents are locked.

GET /health issues SELECT 1 against D1. Success returns 200, failure returns a friendly 503 and a timestamped log. For a failing decision, sign in as the affected demo user, inspect the HTTP status and health, then check the PO's owner, role, state and revision before inspecting host logs.

## Trade-offs
This milestone uses manual entry, whole-unit quantities and one immutable original per order. Rows with invalid numbers are refused; draft arithmetic can be corrected before submission. Submission rechecks line and document maths within ₹1. Empty item lists show “Line items not checked”. An uncertain write failure after R2 has stored the file may leave an unreferenced object; old unreferenced objects can be reconciled against D1.

## Milestone 4 — digital PDF review

The authenticated creator can select one PDF up to 5 MB. The Worker reads its text layer using unpdf/PDF.js, groups text by position and prepopulates editable fields. Unreadable PDFs fall back to manual entry. The original file remains in private R2; the initial extracted fields and extraction method are stored separately from the editable order. Server checks use integer paise, exact arithmetic and a ₹1 inclusive tolerance. Duplicate numbers remain globally unique. The parser supports common labels and wrapped descriptions; arbitrary layouts, rotated text, password-protected documents and scans are not guaranteed to extract. No OCR. Review values against the original.

Run npm test and npm run build. To exercise the four assignment files, set SAMPLE_PDF_DIR to the directory holding them and run npm test. Verify the deployed UI and /health separately; do not mark deployment or permission tests as passed until actually run.
