# BookingCSTU Canonical Database Schema

This directory contains a fresh-schema design for a dedicated test database.
It is not a migration for an existing database and contains no production
records. The schema files do not select a database, create a database, or drop
database/table objects.

## Review design decision

Two designs were considered:

1. A single `reviews` table with a `review_type` and a nullable `booking_id`.
   This needs a conditional rule requiring a booking for room reviews and
   forbidding it for system reviews. The project MySQL server version is not
   recorded, so relying on enforced `CHECK` constraints would be version
   dependent. A unique nullable booking key alone does not enforce the
   relationship-type rule.
2. Separate `room_reviews` and `system_reviews` tables. A room review has a
   required, unique `booking_id`; a system review has a required `user_id` and
   no booking column. Both use the same `visible`/`hidden` moderation state.

This design uses separate tables. A normal `UNIQUE` constraint enforces at
most one room review per booking without conditional constraints or nullable
relationship columns. Backend validation must still require that the booking
is completed and belongs to the authenticated user. It also keeps room-review
and system-review queries explicit. Review author and room names are derived
through the booking/user/room relationships rather than trusted from request
fields or duplicated in the review row.

## Tables and relationships

`schema/` is the canonical home for current table definitions. Do not create
parallel definitions under a `tables/` directory. Legacy table scripts were
removed after their current DDL was consolidated into these schema files.
Legacy room catalog rows are retained separately in `seeds/rooms.sql`; the
old review maintenance/query script is retained under
`migrations/legacy_reviews_reference.sql` and is not part of fresh schema setup.

- `users`: TU identity, profile, application role/access level, no-show count,
  suspension, and timestamps. Passwords are not stored.
- `rooms`: room details, availability, type, optional image URL, and
  timestamps.
- `bookings`: user/room reservation, canonical booking status, purpose,
  cancellation/check-in timestamps, and timestamps.
- `room_reviews`: at most one review per booking, rating/comment, and
  visible/hidden state. Backend validation must restrict reviews to completed
  bookings.
- `system_reviews`: an overall system rating/comment by a user, without a
  booking relationship, and visible/hidden state.
- `complaints`: user-submitted complaint, optional room, required subject and
  description, and the agreed complaint statuses.
- `repair_reports`: user-submitted repair report, optional room, required
  subject and description, and the separate agreed repair statuses.

`checkins` is deliberately omitted. The application stores check-in time and
state in `bookings.checked_in_at` and `bookings.status`.

The foreign keys use restrictive deletion behavior for users, bookings, and
review history. Optional room references on complaints and repair reports use
`ON DELETE SET NULL` so deleting a room does not delete a report. There are no
`ON DELETE CASCADE` relationships.

## Type and length choices

Types and lengths already established by the current SQL source are retained
where applicable (`users.tu_id`, `users.name`, `users.email`, room fields, and
booking date/time/status fields). Additional string sizes are schema proposals,
not facts established by the current backend:

`users.email` is nullable because the current authentication upsert permits
TU responses without an email address. The unique index still prevents
duplicate non-NULL addresses. The test seed supplies synthetic addresses.

- `username`: `VARCHAR(100)`
- `displayname_th`, `faculty`, `major`: `VARCHAR(255)`
- review `comment`: `VARCHAR(1000)`, matching the current UI limit
- complaint/repair `subject`: `VARCHAR(255)`
- complaint/repair `description`: `TEXT`

Confirm these limits against the intended TU response and final support forms
before adopting the schema beyond the dedicated test database. Booking
`purpose` uses `VARCHAR(500)` to match the current UI limit. Rating range
validation (1–5) remains a Backend responsibility so the DDL does not depend
on MySQL versions that differ in `CHECK` constraint enforcement.

The selected table character set/collation is `utf8mb4` /
`utf8mb4_unicode_ci`, matching the existing project database/table source and
supporting Thai text. DDL uses InnoDB, ENUMs, ordinary indexes, and foreign
keys; it avoids version-dependent `CHECK` constraints. Verify the actual
dedicated test server version before use.

## Fresh database setup

`database.sql` is a MySQL-client bootstrap for a **new, empty, dedicated test
database** named `BookingCSTU_test`. It creates that database if absent, selects
it, then sources the canonical schema files in this order:

1. `schema/01_users.sql`
2. `schema/02_rooms.sql`
3. `schema/03_bookings.sql`
4. `schema/04_room_reviews.sql`
5. `schema/05_system_reviews.sql`
6. `schema/06_complaints.sql`
7. `schema/07_repair_reports.sql`

Run the MySQL client from `backend/database` so the relative `SOURCE schema/...`
paths resolve. After verifying the target is absent or empty and the account is
restricted to the test database, the MySQL-client invocation is:

```sh
cd backend/database
mysql --user=TEST_DB_USER --password < database.sql
```

`--password` prompts interactively; do not place a password in the command.
If `BookingCSTU_test` exists and already contains tables, stop: the schema DDL
is not idempotent and may stop after creating some missing tables. The
bootstrap has no `DROP DATABASE` and does not erase existing rows. It is not a
migration and must never be used for `BookingCSTU_project` or Production.

The individual files in `schema/` contain `CREATE TABLE` DDL only and do not
create or select a database. Their order above follows the foreign-key
dependencies. Do not apply them directly to an existing application database.

## Existing database: migrations

There is no automatic migration runner. Each migration is a separate,
manual, schema-specific operation; **do not execute all files in a directory
as a batch**. Before any migration, confirm the selected database and exact
live schema, take and verify a restorable backup outside the repository, stop
application writers/jobs as directed by that migration, and follow its full
preflight and postflight instructions. Never run a migration on Production
without a separately reviewed change plan and recovery window.

- `migrations/20261115_add_rooms_image_url.sql`: adds one nullable room image
  column. Apply only once after confirming the column is absent.
- `migrations/20261116_standardize_booking_status.sql`: changes the Booking
  status ENUM and maps legacy `confirmed` rows to `reserved`. Its commented
  preflight is mandatory; DDL can implicitly commit, so it is not rollback-safe
  as a single transaction. Do not rerun after the canonical ENUM is present.
- `migrations/20261117_phase6_live_schema_alignment.sql`: one-time alignment
  for a specifically inspected legacy schema. It creates review tables, copies
  eligible legacy reviews, changes columns/indexes, and drops/recreates Booking
  foreign keys. Follow every in-file preflight and verified-backup requirement.
- `migrations/legacy_reviews_reference.sql`: legacy mixed reference script,
  **not a read-only inspection script**. It selects `BookingCSTU_project`, adds
  columns/indexes/constraints, and updates review rows. Do not run it as a
  bootstrap or migration batch; inspect and review each statement against the
  actual legacy schema first.

## Read-only inspection

There is no standalone inspection bundle. Use individually reviewed `SELECT`,
`SHOW` and `INFORMATION_SCHEMA` queries against an explicitly verified target.
The commented preflight/postflight queries inside the versioned migrations are
examples only and do not run unless executed separately. Do not use
`legacy_reviews_reference.sql` for inspection because it also contains DDL and
DML. Never include personal values in audit output; report counts and schema
metadata only.

Typical read-only checks include:

```sql
SELECT DATABASE();
SHOW TABLES;
SHOW CREATE TABLE bookings;
SHOW COLUMNS FROM bookings;
SHOW INDEX FROM bookings;
SELECT status, COUNT(*) AS total FROM bookings GROUP BY status;
```

## Seeds

- `seeds/rooms.sql` inserts the room catalog. It is data-changing, has no
  duplicate-key update guard, and is intended only for a fresh/dedicated test
  database. It may fail if room keys already exist.
- `seeds/test_seed.sql` inserts synthetic users, rooms, bookings, reviews,
  complaints, and repair reports. Run once only, after the fresh schema, in a
  dedicated test database. It has no rerun/upsert guard and is not production
  data.

Neither seed is part of `database.sql` or is run automatically by Backend
startup. The Backend currently has no test-database startup guard; do not start
it against a test database until its connection target and scheduled-job
effects have been independently verified.

## Implementation gaps and decisions

The DDL prepares storage only; it does not make the current application
workflow complete. Backend/Frontend implementation is still needed for:

- Room-review submission, completed-booking ownership validation, duplicate
  prevention, and public listing filtered to `visible`.
- System-review submission/listing, with the authenticated user derived on
  the server.
- Admin review hide/show using `visible` and `hidden`.
- Complaint and repair-report creation APIs and their user-facing forms.
- Updating the complaint status validator to use `เสร็จสิ้น`.
- Review queries that join room reviews through bookings and system reviews
  through users.

The schema allows multiple system reviews per user because no such uniqueness
rule was established. Confirm whether that should be restricted before adding
a unique index. `updated_at` is omitted from complaints and repair reports
because the current workflows only require creation time and status updates;
add it only if the product needs status-change timestamps.

## SQL safety matrix

| SQL file/group | Purpose | Fresh setup | Existing DB | Data-changing / destructive behavior |
|---|---|---|---|---|
| `database.sql` | Fresh test bootstrap | Yes, empty `BookingCSTU_test` only | No | Creates/selects test DB and creates tables; no drop/reset; may partially add missing tables if target is non-empty |
| `schema/01_users.sql`–`07_repair_reports.sql` | Canonical table DDL | Yes, in listed order | No | `CREATE TABLE`; no row DML; not idempotent |
| `migrations/20261115_add_rooms_image_url.sql` | Add room image column | No | Yes, after preflight | `ALTER TABLE`; fails if column already exists |
| `migrations/20261116_standardize_booking_status.sql` | Standardize Booking status | No | Yes, one-time and gated | `ALTER TABLE` and `UPDATE bookings`; may implicitly commit |
| `migrations/20261117_phase6_live_schema_alignment.sql` | Align inspected legacy schema | No | Yes, only exact preflight target | Creates tables, copies rows, alters columns/keys and replaces FKs; not safe to rerun blindly |
| `migrations/legacy_reviews_reference.sql` | Historical review reference | No | Not approved as-is | Hard-coded `USE`, `ALTER`, `UPDATE`, index/FK creation; mixed DDL/DML, not read-only |
| `seeds/rooms.sql` | Room catalog seed | Test DB only | No | `INSERT`; may fail on duplicate keys |
| `seeds/test_seed.sql` | Synthetic integration fixtures | Test DB only | No | Multiple `INSERT`s; run once, no rerun guard |

No setup, migration, or seed file is invoked by Backend startup. Never run
`database.sql`, a migration, or a seed against `BookingCSTU_project` or
Production. Creating a database, applying DDL, changing rows, seeding, and
starting an integration-test Backend require a verified isolated target and a
separate reviewed plan.
