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
    quotaBookings: [],
    missedBookings: null,
    roomReviews: [],
    reviewBookingRows: null,
    roomReviewSummary: [{ average_rating: 0, review_count: 0, usage_count: 0 }],
    roomReviewRows: [],
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

    if (normalized.startsWith("select date_format(booking_date, '%y-%m-%d') as booking_date")) {
      return [state.quotaBookings, []];
    }

    if (normalized.startsWith("select booking_id from bookings")) {
      return [state.conflicts, []];
    }

    if (
      normalized.startsWith("select booking_id, user_id, booking_date") ||
      normalized.startsWith(
        "select booking_id, user_id, date_format(booking_date, '%y-%m-%d') as booking_date"
      )
    ) {
      return [
        state.bookings.filter((booking) =>
          booking.booking_id === params[0] && booking.user_id === params[1]
        ),
        []
      ];
    }

    if (normalized.startsWith("select booking_id, user_id from bookings")) {
      const candidates = state.missedBookings ?? state.bookings;
      return [candidates.filter((booking) => booking.status === "reserved"), []];
    }

    if (normalized.startsWith("select b.booking_id, b.status, u.name as reviewer_name")) {
      const [bookingId, userId] = params;
      const booking = state.bookings.find((item) =>
        item.booking_id === bookingId && item.user_id === userId
      );
      const user = state.users.find((item) => item.user_id === userId);
      return [booking && user ? [{
        booking_id: booking.booking_id,
        status: booking.status,
        reviewer_name: user.name || "Test User"
      }] : [], []];
    }

    if (normalized.startsWith("select review_id from room_reviews")) {
      return [state.roomReviews.filter((review) => review.booking_id === params[0]), []];
    }

    if (normalized.startsWith("insert into room_reviews")) {
      const [bookingId, rating, comment] = params;
      if (state.roomReviews.some((review) => review.booking_id === bookingId)) {
        const error = new Error("Duplicate room review");
        error.code = "ER_DUP_ENTRY";
        error.errno = 1062;
        throw error;
      }
      state.roomReviews.push({ review_id: state.roomReviews.length + 1, booking_id: bookingId, rating, comment });
      return [{ insertId: state.roomReviews.length }, []];
    }

    if (normalized.startsWith("select no_show_count, suspended_until from users")) {
      const user = state.users.find((item) => item.user_id === params[0]);
      return [user ? [{
        no_show_count: user.no_show_count,
        suspended_until: user.suspended_until
      }] : [], []];
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
          booking.status === "checked_in" &&
          `${booking.booking_date} ${booking.end_time}` <= params[0]
            ? { ...booking, status: "completed" }
            : booking
        );
      } else if (normalized.includes("set status = 'cancelled'")) {
        state.bookings = state.bookings.map((booking) => ({
          ...booking,
          status: "cancelled"
        }));
      } else if (normalized.includes("set status = 'no_show'")) {
        const bookingId = params[0];
        const updateMissed = (booking) =>
          booking.booking_id === bookingId && booking.status === "reserved"
            ? { ...booking, status: "no_show" }
            : booking;
        state.missedBookings = (state.missedBookings || []).map(updateMissed);
        state.bookings = state.bookings.map(updateMissed);
      }

      return [{ affectedRows: 1 }, []];
    }

    if (normalized.startsWith("update users")) {
      state.userUpdates.push({ sql: normalized, params });
      const userId = params.at(-1);
      const user = state.users.find((item) => item.user_id === userId);
      if (user && normalized.includes("set no_show_count = ?")) {
        user.no_show_count = params[0];
        if (normalized.includes("suspended_until = date_add")) {
          const now = Date.parse(`${String(params[1]).replace(" ", "T")}+07:00`);
          user.suspended_until = new Date(now + Number(params[2]) * 86_400_000);
        }
      }
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

    if (normalized.startsWith("select b.booking_id, b.status as booking_status")) {
      return [state.reviewBookingRows || [], []];
    }

    if (normalized.includes("as average_rating") && normalized.includes("from rooms r")) {
      return [state.roomReviewSummary, []];
    }
    if (normalized.includes("from room_reviews rr") && normalized.includes("as message")) {
      return [state.roomReviewRows, []];
    }

    if (normalized.includes("from rooms")) {
      return [state.rooms, []];
    }

    if (normalized.includes("from bookings")) {
      return [state.quotaBookings, []];
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
    status: "reserved",
    quota: {
      month: booking.date.slice(0, 7),
      limit_minutes: 1200,
      used_minutes: 60,
      remaining_minutes: 1140
    }
  });
  assert.equal(state.commitCount, 1);
  assert.equal(state.rollbackCount, 0);
  assert.equal(state.releaseCount, 1);
  const roomLock = state.connectionQueries.findIndex(({ sql }) =>
    sql.startsWith("select * from rooms") && sql.includes("for update")
  );
  const overlapCheck = state.connectionQueries.findIndex(({ sql }) =>
    sql.startsWith("select booking_id from bookings")
  );
  const quotaCheck = state.connectionQueries.findIndex(({ sql }) =>
    sql.startsWith("select date_format(booking_date, '%y-%m-%d') as booking_date")
  );
  assert.ok(roomLock >= 0 && overlapCheck > roomLock && quotaCheck > overlapCheck);
  assert.match(state.connectionQueries[overlapCheck].sql, /status in \(\?, \?\)/);
  assert.deepEqual(state.connectionQueries[overlapCheck].params.slice(2, 4), [
    "reserved", "checked_in"
  ]);
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

test("rejects booking durations below 30 minutes before database access", async () => {
  resetMock();

  await assert.rejects(
    database.addBooking(
      makeBooking({ start_time: "10:00", end_time: "10:29" })
    ),
    /ระยะเวลาจองต้องอยู่ระหว่าง 30 นาที–2 ชั่วโมง/
  );

  assert.equal(state.connectionCount, 0);
});

test("accepts 30-minute student bookings and enforces the monthly quota query under user lock", async () => {
  resetMock({
    users: [{ user_id: 7, role: "student", no_show_count: 0, suspended_until: null }],
    quotaBookings: [{
      booking_date: `${getNextWeekday().slice(0, 7)}-02`,
      start_time: "08:00:00",
      end_time: "09:00:00",
      status: "no_show"
    }]
  });

  const booking = makeBooking({ start_time: "10:00", end_time: "10:30" });
  const result = await database.addBooking(booking);
  assert.equal(result.quota.used_minutes, 90);
  assert.equal(result.quota.remaining_minutes, 1110);

  const userLock = state.connectionQueries.findIndex(({ sql }) =>
    sql.startsWith("select user_id, role") && sql.includes("for update")
  );
  const quotaCheck = state.connectionQueries.findIndex(({ sql }) =>
    sql.startsWith("select date_format(booking_date, '%y-%m-%d') as booking_date")
  );
  const insert = state.connectionQueries.findIndex(({ sql }) =>
    sql.startsWith("insert into bookings")
  );
  assert.ok(userLock >= 0 && quotaCheck > userLock && insert > quotaCheck);
  assert.match(state.connectionQueries[quotaCheck].sql, /status in \(\?, \?, \?, \?\)/);
  assert.deepEqual(state.connectionQueries[quotaCheck].params.slice(-4), [
    "reserved", "checked_in", "completed", "no_show"
  ]);
});

test("rejects quota overage for both booking roles without inserting", async () => {
  for (const role of ["student", "teacher"]) {
    resetMock({
      users: [{ user_id: 7, role, no_show_count: 0, suspended_until: null }],
      quotaBookings: [{
        booking_date: getNextWeekday(),
        start_time: "08:00:00",
        end_time: "16:00:00",
        status: "completed"
      }, {
        booking_date: getNextWeekday(),
        start_time: "08:00:00",
        end_time: "16:00:00",
        status: "reserved"
      }, {
        booking_date: getNextWeekday(),
        start_time: "08:00:00",
        end_time: "12:00:00",
        status: "checked_in"
      }]
    });

    await assert.rejects(database.addBooking(makeBooking({
      start_time: "10:00", end_time: "10:30"
    })), /20 ชั่วโมงต่อเดือน/);
    assert.equal(state.connectionQueries.some(({ sql }) =>
      sql.startsWith("insert into bookings")
    ), false);
    assert.equal(state.rollbackCount, 1);
    assert.equal(state.commitCount, 0);
  }
});

test("monthly quota query groups by booking date and separates December from January", async () => {
  resetMock({ quotaBookings: [
    { booking_date: "2026-12-31", start_time: "10:00", end_time: "12:00", status: "no_show" },
    { booking_date: "2027-01-01", start_time: "10:00", end_time: "15:00", status: "reserved" },
    { booking_date: "2025-12-31", start_time: "10:00", end_time: "16:00", status: "completed" },
    { booking_date: "2026-12-30", start_time: "10:00", end_time: "12:00", status: "cancelled" }
  ] });

  const december = await database.getMonthlyBookingQuota(7, "2026-12-15");
  const query = state.poolQueries.at(-1);
  assert.deepEqual(december, {
    month: "2026-12",
    limit_minutes: 1200,
    used_minutes: 120,
    remaining_minutes: 1080
  });
  assert.deepEqual(query.params, [7, "2026-12-01", "2027-01-01", "reserved", "checked_in", "completed", "no_show"]);
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

test("active account suspension blocks booking while an expired suspension allows booking", async () => {
  resetMock({
    users: [{
      user_id: 7,
      role: "student",
      no_show_count: 4,
      suspended_until: new Date(Date.now() + 60_000)
    }]
  });
  await assert.rejects(database.addBooking(makeBooking()), /บัญชีถูกระงับ/);
  assert.equal(state.connectionQueries.some(({ sql }) => sql.startsWith("insert into bookings")), false);
  assert.equal(state.commitCount, 0);

  resetMock({
    users: [{
      user_id: 7,
      role: "student",
      no_show_count: 4,
      suspended_until: new Date(Date.now() - 60_000)
    }]
  });
  const result = await database.addBooking(makeBooking());
  assert.equal(result.status, "reserved");
  assert.equal(state.commitCount, 1);
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

test("does not cancel another user's booking", async () => {
  resetMock({
    bookings: [{
      booking_id: 91,
      user_id: 8,
      booking_date: getNextWeekday(),
      start_time: "10:00:00",
      status: "reserved"
    }]
  });

  await assert.rejects(
    database.deleteBooking(91, 7),
    /ไม่พบรายการจองของผู้ใช้นี้/
  );

  const ownershipQuery = state.connectionQueries.find(({ sql }) =>
    sql.startsWith("select booking_id, user_id, booking_date")
  );
  assert.deepEqual(ownershipQuery.params, [91, 7]);
  assert.equal(state.bookingUpdates.length, 0);
  assert.equal(state.commitCount, 0);
  assert.equal(state.rollbackCount, 1);
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
  await assert.rejects(database.checkInBooking(91, 7), /ไม่สามารถเช็กอินได้/);
  assert.equal(state.bookingUpdates.filter(({ sql }) =>
    sql.includes("set status = 'checked_in'")
  ).length, 1);
});

test("check-in does not change bookings outside reserved status", async () => {
  for (const status of ["checked_in", "completed", "cancelled", "no_show"]) {
    resetMock({
      bookings: [{
        booking_id: 91,
        user_id: 7,
        booking_date: bangkokDate(),
        start_time: "10:00:00",
        end_time: "11:00:00",
        status
      }]
    });
    await assert.rejects(database.checkInBooking(91, 7), /ไม่สามารถเช็กอินได้/);
    assert.equal(state.bookingUpdates.length, 0);
    assert.equal(state.commitCount, 0);
    assert.equal(state.rollbackCount, 1);
  }
});

test("does not check in another user's booking", async () => {
  const date = bangkokDate();
  resetMock({
    bookings: [{
      booking_id: 91,
      user_id: 8,
      booking_date: date,
      start_time: "10:00:00",
      end_time: "11:00:00",
      status: "reserved"
    }]
  });

  await assert.rejects(
    database.checkInBooking(91, 7),
    /ไม่พบรายการจอง/
  );

  const ownershipQuery = state.connectionQueries.find(({ sql }) =>
    sql.startsWith("select booking_id, user_id, date_format(booking_date")
  );
  assert.deepEqual(ownershipQuery.params, [91, 7]);
  assert.equal(state.bookingUpdates.length, 0);
  assert.equal(state.commitCount, 0);
  assert.equal(state.rollbackCount, 1);
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

test("completion job leaves future and non-checked-in bookings unchanged and is idempotent", async () => {
  resetMock({
    missedBookings: [],
    bookings: [
      { booking_id: 1, booking_date: getNextWeekday(), end_time: "11:00:00", status: "checked_in" },
      { booking_id: 2, booking_date: getPreviousWeekday(), end_time: "11:00:00", status: "reserved" },
      { booking_id: 3, booking_date: getPreviousWeekday(), end_time: "11:00:00", status: "no_show" },
      { booking_id: 4, booking_date: getPreviousWeekday(), end_time: "11:00:00", status: "cancelled" },
      { booking_id: 5, booking_date: getPreviousWeekday(), end_time: "11:00:00", status: "completed" }
    ]
  });

  await database.updateBookingStatuses();
  assert.deepEqual(state.bookings.map(({ status }) => status), [
    "checked_in", "reserved", "no_show", "cancelled", "completed"
  ]);
  await database.updateBookingStatuses();
  assert.deepEqual(state.bookings.map(({ status }) => status), [
    "checked_in", "reserved", "no_show", "cancelled", "completed"
  ]);
  assert.equal(state.commitCount, 2);
});

test("room review status is read only for the booking owner and exposes joined review data", async () => {
  resetMock({
    reviewBookingRows: [{
      booking_id: 91,
      booking_status: "completed",
      review_id: 17,
      rating: 5,
      comment: "Great room",
      review_status: "visible",
      created_at: "2026-11-17 12:00:00",
      reviewer_name: "Account Name"
    }]
  });
  const result = await database.getRoomReview(91, 7);
  assert.deepEqual(result, {
    booking_id: 91,
    booking_status: "completed",
    reviewed: true,
    review: {
      review_id: 17,
      rating: 5,
      comment: "Great room",
      status: "visible",
      created_at: "2026-11-17 12:00:00",
      reviewer_name: "Account Name"
    }
  });
  assert.deepEqual(state.poolQueries.at(-1).params, [91, 7]);
});

test("room review listing returns persisted visible reviews and calculated counts", async () => {
  resetMock({
    roomReviewSummary: [{ average_rating: "4.5", review_count: 2, usage_count: 7 }],
    roomReviewRows: [{ id: 4, name: "Account Name", date: "2026-11-17", rating: 5, message: "Nice", type: "รีวิว", verified: 1 }]
  });
  const result = await database.getRoomReviewsByRoom(31);
  assert.equal(result.average_rating, 4.5);
  assert.equal(result.review_count, 2);
  assert.equal(result.usage_count, 7);
  assert.equal(result.reviews[0].message, "Nice");
  assert.deepEqual(state.poolQueries.map(({ params }) => params), [[31], [31]]);
});

test("room review transaction only inserts for owner's completed booking and rejects duplicates", async () => {
  resetMock({
    bookings: [{ booking_id: 91, user_id: 7, status: "completed" }],
    users: [{ user_id: 7, role: "student", name: "Account Name" }]
  });
  const result = await database.submitRoomReview(91, 7, 5, "Great room");
  assert.deepEqual(result, {
    booking_id: 91,
    rating: 5,
    comment: "Great room",
    reviewer_name: "Account Name"
  });
  assert.equal(state.roomReviews.length, 1);
  assert.deepEqual(state.connectionQueries.find(({ sql }) =>
    sql.startsWith("insert into room_reviews")
  ).params, [91, 5, "Great room"]);
  assert.equal(state.commitCount, 1);

  await assert.rejects(database.submitRoomReview(91, 7, 4, "Duplicate"), /ได้รับรีวิวแล้ว/);
  assert.equal(state.roomReviews.length, 1);
  assert.equal(state.rollbackCount, 1);
});

test("room review transaction rejects another user's or non-completed booking", async () => {
  resetMock({ bookings: [{ booking_id: 91, user_id: 8, status: "completed" }] });
  await assert.rejects(database.submitRoomReview(91, 7, 5, "Not mine"), /ไม่พบรายการจอง/);
  resetMock({ bookings: [{ booking_id: 91, user_id: 7, status: "reserved" }] });
  await assert.rejects(database.submitRoomReview(91, 7, 5, "Too early"), /เสร็จสิ้น/);
  assert.equal(state.roomReviews.length, 0);
  assert.equal(state.commitCount, 0);
  assert.equal(state.rollbackCount, 1);
});

test("fourth no-show marks the booking and suspends the user for 14 days", async () => {
  resetMock({
    users: [
      {
        user_id: 7,
        role: "student",
        no_show_count: 3,
        suspended_until: null
      }
    ],
    bookings: [],
    missedBookings: [{ booking_id: 91, user_id: 7, status: "reserved" }]
  });

  const result = await database.updateBookingStatuses();

  assert.deepEqual(result, { completed: true, no_show_processed: 1 });
  assert.equal(state.userUpdates.length, 1);
  assert.match(state.userUpdates[0].sql, /set no_show_count = \?/);
  assert.match(state.userUpdates[0].sql, /suspended_until = date_add/);
  assert.equal(state.userUpdates[0].params[0], 4);
  assert.equal(typeof state.userUpdates[0].params[1], "string");
  assert.equal(state.userUpdates[0].params[2], 14);
  assert.equal(state.userUpdates[0].params[3], 7);
  assert.equal(state.missedBookings[0].status, "no_show");
  assert.equal(state.users[0].no_show_count, 4);
  assert.equal(
    Date.parse(state.users[0].suspended_until),
    Date.parse(`${state.userUpdates[0].params[1].replace(" ", "T")}+07:00`) + 14 * 86_400_000
  );
  const noShowQuery = state.connectionQueries.find(({ sql }) =>
    sql.startsWith("select booking_id, user_id from bookings")
  );
  assert.match(noShowQuery.sql, /timestamp\(booking_date, start_time\) < \?/);
  assert.equal(noShowQuery.params.length, 1);

  const suspendedUntil = state.users[0].suspended_until.getTime();
  const repeatedJob = await database.updateBookingStatuses();
  assert.deepEqual(repeatedJob, { completed: true, no_show_processed: 0 });
  assert.equal(state.users[0].no_show_count, 4);
  assert.equal(state.users[0].suspended_until.getTime(), suspendedUntil);
  assert.equal(state.userUpdates.length, 1);
  assert.equal(
    state.bookingUpdates.some(({ sql }) =>
      sql.includes("set status = 'no_show'") &&
      sql.includes("and status = 'reserved'")
    ),
    true
  );
});

test("first, second, and third no-shows increment once without suspending", async () => {
  for (const count of [0, 1, 2]) {
    resetMock({
      users: [{ user_id: 7, role: "student", no_show_count: count, suspended_until: null }],
      bookings: [],
      missedBookings: [{ booking_id: 90 + count, user_id: 7, status: "reserved" }]
    });
    const result = await database.updateBookingStatuses();
    assert.equal(result.no_show_processed, 1);
    assert.equal(state.users[0].no_show_count, count + 1);
    assert.equal(state.users[0].suspended_until, null);
    assert.equal(state.userUpdates.length, 1);
    assert.doesNotMatch(state.userUpdates[0].sql, /suspended_until = date_add/);
  }
});

test("a live suspension is not extended by another no-show", async () => {
  const until = new Date(Date.now() + 5 * 86_400_000);
  resetMock({
    users: [{ user_id: 7, role: "student", no_show_count: 4, suspended_until: until }],
    bookings: [],
    missedBookings: [{ booking_id: 91, user_id: 7, status: "reserved" }]
  });

  await database.updateBookingStatuses();
  assert.equal(state.users[0].no_show_count, 5);
  assert.equal(state.users[0].suspended_until, until);
  assert.doesNotMatch(state.userUpdates[0].sql, /suspended_until = date_add/);
});

test("a no-show batch updates each booking owner's counter separately", async () => {
  resetMock({
    users: [
      { user_id: 7, role: "student", no_show_count: 0, suspended_until: null },
      { user_id: 8, role: "teacher", no_show_count: 2, suspended_until: null }
    ],
    bookings: [],
    missedBookings: [
      { booking_id: 91, user_id: 7, status: "reserved" },
      { booking_id: 92, user_id: 8, status: "reserved" },
      { booking_id: 93, user_id: 8, status: "cancelled" },
      { booking_id: 94, user_id: 7, status: "checked_in" },
      { booking_id: 95, user_id: 7, status: "completed" },
      { booking_id: 96, user_id: 7, status: "no_show" }
    ]
  });

  const result = await database.updateBookingStatuses();
  assert.equal(result.no_show_processed, 2);
  assert.deepEqual(state.users.map((user) => user.no_show_count), [1, 3]);
  assert.equal(state.userUpdates.length, 2);
  assert.deepEqual(state.missedBookings.map(({ status }) => status), [
    "no_show", "no_show", "cancelled", "checked_in", "completed", "no_show"
  ]);
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
