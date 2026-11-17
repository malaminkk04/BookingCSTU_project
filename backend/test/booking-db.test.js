const assert = require("node:assert/strict");
const { test } = require("node:test");
const mysql = require("mysql2");
const {
  ACTIVE_BOOKING_STATUSES,
  BOOKING_STATUSES,
  isBookingStatus,
  summarizeBookingStatuses
} = require("../utils/booking-status");

const state = {};

function resetMock(overrides = {}) {
  Object.assign(state, {
    users: [
      {
        user_id: 7,
        role: "student",
        no_show_count: 0,
        suspended_until: null
      }
    ],
    rooms: [
      {
        room_id: 31,
        room_code: "301",
        room_name: "Meeting 301",
        is_available: 1
      }
    ],
    conflicts: [],
    bookings: [
      {
        booking_id: 91,
        user_id: 7,
        booking_date: getNextWeekday(),
        start_time: "10:00:00",
        status: "reserved"
      }
    ],
    missedBookings: null,
    insertId: 321,
    connectionCount: 0,
    beginCount: 0,
    commitCount: 0,
    rollbackCount: 0,
    releaseCount: 0,
    connectionQueries: [],
    bookingUpdates: [],
    userUpdates: [],
    poolQueries: [],
    ...overrides
  });
}

function normalizeSql(sql) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

const connection = {
  async beginTransaction() {
    state.beginCount += 1;
  },
  async execute(sql, params) {
    const normalized = normalizeSql(sql);
    state.connectionQueries.push({ sql: normalized, params });

    if (normalized.startsWith("select user_id, role")) {
      return [state.users, []];
    }

    if (normalized.startsWith("select * from rooms")) {
      return [state.rooms, []];
    }

    if (normalized.startsWith("select booking_id from bookings")) {
      return [state.conflicts, []];
    }

    if (
      normalized.startsWith(
        "select booking_id, user_id, booking_date"
      )
    ) {
      return [state.bookings, []];
    }

    if (normalized.startsWith("select booking_id, user_id from bookings")) {
      const missedBookings =
        state.missedBookings ??
        state.bookings.filter((booking) => booking.status === "reserved");
      return [missedBookings, []];
    }

    if (normalized.startsWith("select no_show_count from users")) {
      const user = state.users.find((item) => item.user_id === params[0]);
      return [user ? [{ no_show_count: user.no_show_count }] : [], []];
    }

    if (normalized.startsWith("insert into bookings")) {
      return [{ insertId: state.insertId }, []];
    }

    if (normalized.startsWith("update bookings")) {
      state.bookingUpdates.push({ sql: normalized, params });

      if (normalized.includes("set status = 'checked_in'")) {
        state.bookings = state.bookings.map((booking) => ({
          ...booking,
          status: "checked_in"
        }));
      } else if (normalized.includes("set status = 'completed'")) {
        state.bookings = state.bookings.map((booking) =>
          booking.status === "checked_in"
            ? { ...booking, status: "completed" }
            : booking
        );
      } else if (normalized.includes("set status = 'cancelled'")) {
        state.bookings = state.bookings.map((booking) => ({
          ...booking,
          status: "cancelled"
        }));
      } else if (normalized.includes("set status = 'no_show'")) {
        state.missedBookings = (state.missedBookings || []).map((booking) => ({
          ...booking,
          status: "no_show"
        }));
      }

      return [{ affectedRows: 1 }, []];
    }

    if (normalized.startsWith("update users")) {
      state.userUpdates.push({ sql: normalized, params });
      return [{ affectedRows: 1 }, []];
    }

    throw new Error(`Unexpected mocked connection query: ${normalized}`);
  },
  async commit() {
    state.commitCount += 1;
  },
  async rollback() {
    state.rollbackCount += 1;
  },
  release() {
    state.releaseCount += 1;
  }
};

const mockPromisePool = {
  async execute(sql, params) {
    const normalized = normalizeSql(sql);
    state.poolQueries.push({ sql: normalized, params });

    if (normalized.includes("from rooms")) {
      return [state.rooms, []];
    }

    throw new Error(`Unexpected mocked pool query: ${normalized}`);
  },
  async getConnection() {
    state.connectionCount += 1;
    return connection;
  }
};

const originalCreatePool = mysql.createPool;
let database;

try {
  mysql.createPool = () => ({
    promise: () => mockPromisePool
  });
  database = require("../db");
} finally {
  mysql.createPool = originalCreatePool;
}

function bangkokDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function shiftDate(date, days) {
  const shifted = new Date(`${date}T00:00:00Z`);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

function getNextWeekday() {
  let date = bangkokDate();

  do {
    date = shiftDate(date, 1);
  } while ([0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()));

  return date;
}

function getPreviousWeekday() {
  let date = bangkokDate();

  do {
    date = shiftDate(date, -1);
  } while ([0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()));

  return date;
}

function getNextSaturday() {
  let date = bangkokDate();

  do {
    date = shiftDate(date, 1);
  } while (new Date(`${date}T00:00:00Z`).getUTCDay() !== 6);

  return date;
}

function getElapsedServiceSlot() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );
  const nowMinutes = Number(values.hour) * 60 + Number(values.minute);

  for (let startMinutes = 8 * 60; startMinutes + 60 <= nowMinutes; startMinutes += 60) {
    const formatTime = (minutes) =>
      `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
        minutes % 60
      ).padStart(2, "0")}:00`;

    return {
      start_time: formatTime(startMinutes),
      end_time: formatTime(startMinutes + 60)
    };
  }

  return null;
}

function makeBooking(overrides = {}) {
  return {
    user_id: 7,
    room: "301",
    date: getNextWeekday(),
    start_time: "10:00",
    end_time: "11:00",
    purpose: " Study group ",
    ...overrides
  };
}

test("creates a valid student booking and commits the mocked transaction", async () => {
  resetMock();

  const booking = makeBooking();
  const result = await database.addBooking(booking);

  assert.deepEqual(result, {
    booking_id: 321,
    user_id: 7,
    room_id: 31,
    room_code: "301",
    room_name: "Meeting 301",
    booking_date: booking.date,
    start_time: "10:00:00",
    end_time: "11:00:00",
    purpose: "Study group",
    status: "reserved"
  });
  assert.equal(state.commitCount, 1);
  assert.equal(state.rollbackCount, 0);
  assert.equal(state.releaseCount, 1);
  const insertQuery = state.connectionQueries.find(({ sql }) =>
    sql.startsWith("insert into bookings")
  );
  assert.match(insertQuery.sql, /'reserved'/);
  assert.doesNotMatch(insertQuery.sql, /confirmed/);
  assert.deepEqual(
    state.connectionQueries.at(-1).params,
    [7, 31, booking.date, "10:00:00", "11:00:00", "Study group"]
  );
});

test("rejects malformed booking dates before acquiring a database connection", async () => {
  resetMock();

  await assert.rejects(
    database.addBooking(makeBooking({ date: "not-a-date" })),
    /วันที่จองไม่ถูกต้อง/
  );

  assert.equal(state.connectionCount, 0);
  assert.equal(state.connectionQueries.length, 0);
});

test("rejects weekend bookings before acquiring a database connection", async () => {
  resetMock();

  await assert.rejects(
    database.addBooking(makeBooking({ date: getNextSaturday() })),
    /เฉพาะวันจันทร์ถึงวันศุกร์/
  );

  assert.equal(state.connectionCount, 0);
});

test("rejects booking durations below one hour before database access", async () => {
  resetMock();

  await assert.rejects(
    database.addBooking(
      makeBooking({ start_time: "10:00", end_time: "10:30" })
    ),
    /ระยะเวลาจองต้องอยู่ระหว่าง 1–2 ชั่วโมง/
  );

  assert.equal(state.connectionCount, 0);
});

test("rejects an elapsed booking slot before database access", async (t) => {
  const slot = getElapsedServiceSlot();

  if (!slot) {
    t.skip("No full service-hour slot has elapsed yet in Asia/Bangkok");
    return;
  }

  resetMock();
  await assert.rejects(
    database.addBooking({
      ...makeBooking({ date: bangkokDate() }),
      ...slot
    }),
    /ไม่สามารถจองวันที่หรือเวลาที่ผ่านมาแล้วได้/
  );

  assert.equal(state.connectionCount, 0);
});

test("rejects student bookings for rooms outside the student allowlist", async () => {
  resetMock({
    rooms: [
      {
        room_id: 1,
        room_code: "107",
        room_name: "Computer lab",
        is_available: 1
      }
    ]
  });

  await assert.rejects(
    database.addBooking(makeBooking({ room: "107" })),
    /นักศึกษาสามารถจองได้เฉพาะห้อง/
  );

  assert.equal(
    state.connectionQueries.some(({ sql }) => sql.startsWith("insert into bookings")),
    false
  );
  assert.equal(state.commitCount, 0);
  assert.equal(state.rollbackCount, 1);
  assert.equal(state.releaseCount, 1);
});

test("rejects overlapping bookings and rolls back without inserting", async () => {
  resetMock({ conflicts: [{ booking_id: 90 }] });

  await assert.rejects(
    database.addBooking(makeBooking()),
    /มีการจองในช่วงเวลาที่เลือกแล้ว/
  );

  assert.equal(
    state.connectionQueries.some(({ sql }) => sql.startsWith("insert into bookings")),
    false
  );
  assert.equal(state.commitCount, 0);
  assert.equal(state.rollbackCount, 1);
  assert.equal(state.releaseCount, 1);
});

test("returns only allowlisted room codes for student room queries", async () => {
  resetMock({ rooms: [] });

  const rooms = await database.getRooms("student");
  const [query] = state.poolQueries;

  assert.deepEqual(rooms, []);
  assert.match(query.sql, /room_code in \(\?, \?, \?, \?, \?, \?, \?\)/);
  assert.deepEqual(query.params, [
    "301",
    "302",
    "303",
    "304",
    "305",
    "314",
    "315"
  ]);
});

test("keeps room availability separate from booking statuses", async () => {
  const room = {
    room_id: 31,
    room_code: "301",
    room_name: "Meeting 301",
    is_available: 1
  };
  resetMock({ rooms: [room] });

  const rooms = await database.getRooms("student");

  assert.deepEqual(rooms, [room]);
  assert.equal(rooms[0].is_available, 1);
  assert.equal(isBookingStatus("available"), false);
});

test("cancels a future reserved booking and commits the mocked transaction", async () => {
  resetMock();
  state.bookings = [
    {
      booking_id: 91,
      user_id: 7,
      booking_date: getNextWeekday(),
      start_time: "10:00:00",
      status: "reserved"
    }
  ];

  const result = await database.deleteBooking(91, 7);

  assert.deepEqual(result, { booking_id: 91, status: "cancelled" });
  assert.equal(
    state.connectionQueries.some(({ sql }) => sql.startsWith("update bookings")),
    true
  );
  assert.equal(state.commitCount, 1);
  assert.equal(state.rollbackCount, 0);
  assert.equal(state.releaseCount, 1);
});

test("checks in a booking during its allowed check-in window", async () => {
  const now = new Date();
  const date = bangkokDate(now);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Bangkok",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(now);
  const values = Object.fromEntries(
    parts.map(({ type, value }) => [type, value])
  );
  const nowMinutes = Number(values.hour) * 60 + Number(values.minute);
  const startMinutes = Math.max(nowMinutes - 5, 0);
  const formatTime = (minutes) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(
      minutes % 60
    ).padStart(2, "0")}:00`;

  resetMock({
    bookings: [
      {
        booking_id: 91,
        user_id: 7,
        booking_date: date,
        start_time: formatTime(startMinutes),
        end_time: formatTime(startMinutes + 60),
        status: "reserved"
      }
    ]
  });

  const result = await database.checkInBooking(91, 7);

  assert.deepEqual(result, { booking_id: 91, status: "checked_in" });
  assert.equal(state.bookings[0].status, "checked_in");
  assert.equal(
    state.bookingUpdates.some(({ sql }) =>
      sql.includes("set status = 'checked_in'")
    ),
    true
  );
  assert.equal(state.commitCount, 1);
});

test("completes checked-in bookings after their scheduled end time", async () => {
  resetMock({
    bookings: [
      {
        booking_id: 91,
        user_id: 7,
        booking_date: getPreviousWeekday(),
        start_time: "10:00:00",
        end_time: "11:00:00",
        status: "checked_in"
      }
    ]
  });

  const result = await database.updateBookingStatuses();

  assert.deepEqual(result, { completed: true, no_show_processed: 0 });
  assert.equal(state.bookings[0].status, "completed");
  assert.equal(
    state.bookingUpdates.some(({ sql }) =>
      sql.includes("set status = 'completed'") &&
      sql.includes("where status = 'checked_in'")
    ),
    true
  );
  assert.equal(state.commitCount, 1);
});

test("marks missed reserved bookings as no-show and updates the user counter", async () => {
  resetMock({
    users: [
      {
        user_id: 7,
        role: "student",
        no_show_count: 1,
        suspended_until: null
      }
    ],
    bookings: [],
    missedBookings: [{ booking_id: 91, user_id: 7 }]
  });

  const result = await database.updateBookingStatuses();

  assert.deepEqual(result, { completed: true, no_show_processed: 1 });
  assert.equal(state.userUpdates.length, 1);
  assert.match(state.userUpdates[0].sql, /set no_show_count = \?/);
  assert.match(state.userUpdates[0].sql, /suspended_until = date_add/);
  assert.equal(state.userUpdates[0].params[0], 2);
  assert.equal(typeof state.userUpdates[0].params[1], "string");
  assert.equal(state.userUpdates[0].params[2], 14);
  assert.equal(state.userUpdates[0].params[3], 7);
  assert.equal(state.missedBookings[0].status, "no_show");
  assert.equal(
    state.bookingUpdates.some(({ sql }) =>
      sql.includes("set status = 'no_show'") &&
      sql.includes("and status = 'reserved'")
    ),
    true
  );
});

test("active booking conflict checks include only reserved and checked-in statuses", async () => {
  resetMock();
  const booking = makeBooking();

  await database.addBooking(booking);

  const conflictQuery = state.connectionQueries.find(({ sql }) =>
    sql.startsWith("select booking_id from bookings")
  );

  assert.match(conflictQuery.sql, /status in \(\?, \?\)/);
  assert.deepEqual(conflictQuery.params, [
    31,
    booking.date,
    ...ACTIVE_BOOKING_STATUSES,
    "11:00:00",
    "10:00:00"
  ]);
  assert.deepEqual(ACTIVE_BOOKING_STATUSES, ["reserved", "checked_in"]);
});

test("cancelled, completed, and no-show bookings are not active conflicts", () => {
  for (const status of ["cancelled", "completed", "no_show"]) {
    assert.equal(ACTIVE_BOOKING_STATUSES.includes(status), false);
  }
});

test("canonical booking statuses exclude room availability and review pending", () => {
  assert.deepEqual(BOOKING_STATUSES, [
    "reserved",
    "checked_in",
    "completed",
    "cancelled",
    "no_show"
  ]);

  for (const status of BOOKING_STATUSES) {
    assert.equal(isBookingStatus(status), true);
  }

  for (const status of ["available", "pending", "confirmed"]) {
    assert.equal(isBookingStatus(status), false);
  }
});

test("analytics counts canonical statuses and reports unknown values separately", () => {
  const summary = summarizeBookingStatuses([
    { status: "reserved", total: 3 },
    { status: "checked_in", total: "2" },
    { status: "pending", total: 4 },
    { status: "available", total: 1 }
  ]);

  assert.deepEqual(summary.statusCounts, {
    reserved: 3,
    checked_in: 2,
    completed: 0,
    cancelled: 0,
    no_show: 0
  });
  assert.deepEqual(summary.unknownStatuses, [
    { status: "pending", total: 4 },
    { status: "available", total: 1 }
  ]);
});

test("does not cancel a booking in a non-cancellable status", async () => {
  resetMock({
    bookings: [
      {
        booking_id: 91,
        user_id: 7,
        booking_date: getNextWeekday(),
        start_time: "10:00:00",
        status: "checked_in"
      }
    ]
  });

  await assert.rejects(
    database.deleteBooking(91, 7),
    /ไม่สามารถยกเลิกได้/
  );

  assert.equal(
    state.connectionQueries.some(({ sql }) => sql.startsWith("update bookings")),
    false
  );
  assert.equal(state.commitCount, 0);
  assert.equal(state.rollbackCount, 1);
  assert.equal(state.releaseCount, 1);
});
