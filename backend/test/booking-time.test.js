const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  getBangkokDateTimeMinutesBefore,
  getBookingStartTimestamp,
  isWithinCheckInWindow,
  isNoShowEligible,
  isSuspendedUntilActive,
  parseBangkokDateTime
} = require("../utils/booking-time");

const start = getBookingStartTimestamp("2026-11-17", "10:00:00");
const minute = 60_000;

test("Check-in is permitted exactly from 15 minutes before through 15 minutes after", () => {
  assert.equal(isWithinCheckInWindow(start, start - 16 * minute), false);
  assert.equal(isWithinCheckInWindow(start, start - 15 * minute), true);
  assert.equal(isWithinCheckInWindow(start, start - 1 * minute), true);
  assert.equal(isWithinCheckInWindow(start, start), true);
  assert.equal(isWithinCheckInWindow(start, start + 15 * minute), true);
  assert.equal(isWithinCheckInWindow(start, start + 16 * minute), false);
});

test("No-show grace expires only after 15 full minutes have elapsed", () => {
  assert.equal(isNoShowEligible(start, start + 15 * minute - 1), false);
  assert.equal(isNoShowEligible(start, start + 15 * minute), false);
  assert.equal(isNoShowEligible(start, start + 15 * minute + 1), true);
  assert.equal(
    getBangkokDateTimeMinutesBefore("2026-11-17 10:15:00", 15),
    "2026-11-17 10:00:00"
  );
  assert.equal(
    getBangkokDateTimeMinutesBefore("2026-11-17 00:05:00", 15),
    "2026-11-16 23:50:00"
  );
});

test("Suspension deadlines use Bangkok wall time and expire at the stored deadline", () => {
  const now = parseBangkokDateTime("2026-11-17 10:00:00");
  assert.equal(isSuspendedUntilActive("2026-11-17 10:00:01", now), true);
  assert.equal(isSuspendedUntilActive("2026-11-17 10:00:00", now), false);
  assert.equal(isSuspendedUntilActive("2026-11-17 09:59:59", now), false);
  assert.equal(isSuspendedUntilActive(null, now), false);
});
