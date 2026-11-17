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

`users.email` remains `NOT NULL`, as in the current Users SQL source. The test
seed supplies synthetic addresses for every account.

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

## DDL order

Use a new, empty `BookingCSTU_test` database selected by the test environment.
Apply these files in order:

1. `schema/01_users.sql`
2. `schema/02_rooms.sql`
3. `schema/03_bookings.sql`
4. `schema/04_room_reviews.sql`
5. `schema/05_system_reviews.sql`
6. `schema/06_complaints.sql`
7. `schema/07_repair_reports.sql`

Do not run the existing `database.sql` bootstrap: it drops and recreates
`BookingCSTU_project`. Do not run Legacy Migrations against this fresh schema;
in particular, the room-image and booking-status migrations are not part of
test-database creation.

## Test seed

`seeds/test_seed.sql` contains synthetic users, rooms, bookings, reviews,
complaints, and repair reports only. Run it once, after all DDL, against a
fresh dedicated test database. The test rooms use `image_url = NULL`; no
uploaded images or real TU accounts are needed. Seeded room reviews reference
completed bookings and use each booking at most once.

The SQL file does not create a database or switch databases. Before any
integration-test process is allowed to apply the seed or start the backend:

1. Require `NODE_ENV=test`.
2. Require an explicitly supplied `DB_NAME=BookingCSTU_test`; do not use the
   backend's current default database name.
3. Connect with a database account restricted to the test database.
4. Verify the connected target with `SELECT DATABASE()` and abort on any
   mismatch before running setup, seed, status updates, or starting the API.

The current backend does not implement this startup guard or a dedicated
test-authentication provider. Do not start it against a database until those
guards are implemented and reviewed. Test accounts in the seed are profile
fixtures, not login credentials; test authentication must not call TU Auth or
use a production account.

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

## Safety

These files are for a dedicated test database only. Never apply them to
`BookingCSTU_project` or a production database. There is no `DROP DATABASE`,
`DROP TABLE`, hard-coded `USE`, credential, production seed, or legacy-data
migration in this schema set. Creating a database, applying DDL, seeding, and
starting tests require separate authorization.
