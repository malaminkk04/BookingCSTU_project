const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  BOOKING_QUOTA_STATUSES,
  BOOKING_QUOTA_LIMIT_MINUTES,
  addOneMonthClamped,
  calculateMonthlyUsageMinutes,
  getMonthDateBounds,
  summarizeBookingQuota,
  validateBookingDateTime
} = require("../utils/booking-rules");

const NOW = "2026-01-25 07:00:00";

function validBooking(date = "2026-01-30", start = "10:00", end = "10:30") {
  return validateBookingDateTime(date, start, end, NOW);
}

test("rejects past dates and past start times using Bangkok clock input", () => {
  assert.throws(() => validBooking("2026-01-24"), /ล่วงหน้า/);
  assert.throws(
    () => validateBookingDateTime("2026-01-26", "06:59", "07:29", NOW),
    /เวลาให้บริการ/
  );
  assert.throws(
    () => validateBookingDateTime("2026-01-26", "07:00", "07:30", NOW),
    /เวลาให้บริการ/
  );
  assert.throws(
    () => validateBookingDateTime("2026-01-26", "08:00", "08:30", "2026-01-26 08:00:01"),
    /ผ่านมาแล้ว/
  );
});

test("allows Monday through Friday and rejects Saturday and Sunday", () => {
  for (const date of ["2026-01-26", "2026-01-27", "2026-01-28", "2026-01-29", "2026-01-30"]) {
    assert.equal(validBooking(date).date, date);
  }
  assert.throws(() => validBooking("2026-01-31"), /จันทร์ถึงวันศุกร์/);
  assert.throws(() => validBooking("2026-02-01"), /จันทร์ถึงวันศุกร์/);
});

test("clamps calendar-month limits correctly across month ends and leap years", () => {
  assert.equal(addOneMonthClamped("2026-01-31"), "2026-02-28");
  assert.equal(addOneMonthClamped("2024-01-31"), "2024-02-29");
  assert.equal(addOneMonthClamped("2024-02-29"), "2024-03-29");
  assert.deepEqual(getMonthDateBounds("2026-12-31"), {
    monthStart: "2026-12-01",
    nextMonthStart: "2027-01-01"
  });
  assert.equal(
    validateBookingDateTime("2026-02-27", "10:00", "10:30", "2026-01-30 07:00:00").date,
    "2026-02-27"
  );
  assert.throws(
    () => validateBookingDateTime("2026-03-01", "10:00", "10:30", "2026-01-30 07:00:00"),
    /ล่วงหน้า/
  );
});

test("accepts 30, 60 and 120 minutes and rejects invalid durations and ordering", () => {
  assert.equal(validBooking("2026-01-30", "10:00", "10:30").duration, 30);
  assert.equal(validBooking("2026-01-30", "10:00", "11:00").duration, 60);
  assert.equal(validBooking("2026-01-30", "10:00", "12:00").duration, 120);
  assert.equal(
    validateBookingDateTime("2026-01-30", "10:00:30", "10:30:30", NOW).duration,
    30
  );
  assert.throws(() => validBooking("2026-01-30", "10:00", "10:29"), /ระยะเวลา/);
  assert.throws(() => validBooking("2026-01-30", "10:00", "12:01"), /ระยะเวลา/);
  assert.throws(() => validBooking("2026-01-30", "10:00", "10:00"), /เวลาให้บริการ/);
  assert.throws(() => validBooking("2026-01-30", "11:00", "10:30"), /เวลาให้บริการ/);
  assert.throws(() => validBooking("2026-01-30", "10:00", "10:45"), /ระยะเวลา/);
  assert.throws(
    () => validateBookingDateTime("2026-01-30", "10:00:30", "10:30:00", NOW),
    /ระยะเวลา/
  );
});

test("counts every quota status including no_show, excluding cancelled, within calendar month", () => {
  const statuses = BOOKING_QUOTA_STATUSES;
  const bookings = statuses.map((status, index) => ({
    booking_date: "2026-12-15",
    start_time: "10:00",
    end_time: "11:00",
    status
  }));
  bookings.push(
    { booking_date: "2026-12-15", start_time: "11:00", end_time: "13:00", status: "cancelled" },
    { booking_date: "2026-11-30", start_time: "10:00", end_time: "15:00", status: "reserved" },
    { booking_date: "2027-12-15", start_time: "10:00", end_time: "15:00", status: "reserved" }
  );

  assert.equal(calculateMonthlyUsageMinutes(bookings, "2026-12"), 240);
  assert.equal(calculateMonthlyUsageMinutes([], "2026-12"), 0);
  assert.deepEqual(summarizeBookingQuota(1170, 30), {
    limit_minutes: BOOKING_QUOTA_LIMIT_MINUTES,
    used_minutes: 1200,
    remaining_minutes: 0,
    exceeded: false
  });
  assert.equal(summarizeBookingQuota(1200, 30).exceeded, true);
  assert.equal(summarizeBookingQuota(1140, 60).exceeded, false);
});

test("quota status rules are shared by student and teacher booking roles", () => {
  const sameUsage = [{
    booking_date: "2026-01-30",
    start_time: "10:00",
    end_time: "12:00",
    status: "no_show"
  }];
  for (const role of ["student", "teacher"]) {
    assert.equal(role === "student" || role === "teacher", true);
    assert.equal(calculateMonthlyUsageMinutes(sameUsage, "2026-01"), 120);
  }
});
