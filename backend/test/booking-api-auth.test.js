const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const { test } = require("node:test");
const {
  ALLOWED_FACULTY,
  ALLOWED_MAJOR,
  authenticateLogin
} = require("../utils/login-flow");
const { createBookingRouter } = require("../routes/booking-api");
const {
  createAuthenticateSession,
  requireAdmin
} = require("../utils/session-auth");

async function withBookingApi(run) {
  const sessions = new Map([
    ["student-session", {
      userId: 1,
      accessLevel: "user",
      expiresAt: Date.now() + 60_000
    }],
    ["teacher-session", {
      userId: 2,
      accessLevel: "user",
      expiresAt: Date.now() + 60_000
    }],
    ["admin-session", {
      userId: 3,
      accessLevel: "admin",
      expiresAt: Date.now() + 60_000
    }],
    ["expired-session", {
      userId: 1,
      accessLevel: "user",
      expiresAt: Date.now() - 1
    }]
  ]);
  const state = {
    users: new Map([
      [1, { user_id: 1, role: "student", no_show_count: 2, suspended_until: "2026-11-20 10:00:00" }],
      [2, { user_id: 2, role: "teacher", no_show_count: 0, suspended_until: null }],
      [3, { user_id: 3, role: "admin", no_show_count: 0, suspended_until: null }]
    ]),
    bookings: [
      {
        booking_id: 101,
        user_id: 1,
        room_id: 1,
        start_time: "10:00",
        end_time: "11:00",
        status: "reserved",
        purpose: "private"
      },
      {
        booking_id: 202,
        user_id: 2,
        room_id: 1,
        start_time: "11:00",
        end_time: "12:00",
        status: "reserved",
        purpose: "private"
      },
      {
        booking_id: 303,
        user_id: 1,
        room_id: 2,
        start_time: "09:00",
        end_time: "10:00",
        status: "completed",
        purpose: "private"
      }
    ],
    reviews: new Map(),
    calls: [],
    mutations: 0,
    roomRoles: [],
    createBookingError: null
  };
  const authenticateSession = createAuthenticateSession(sessions);
  const app = express();

  app.use(express.json());
  app.use("/api", createBookingRouter({
    authenticateSession,
    findUserById: async (userId) => {
      state.calls.push(["findUserById", Number(userId)]);
      return state.users.get(Number(userId)) || null;
    },
    findRooms: async (role) => {
      state.roomRoles.push(role);
      return [{ room_id: 1, room_code: "301", room_name: "Room 301" }];
    },
    findBookingsByDate: async () => state.bookings,
    findBookingsByUser: async (userId) => {
      state.calls.push(["findBookingsByUser", Number(userId)]);
      return state.bookings.filter((booking) =>
        booking.user_id === Number(userId) && booking.status !== "cancelled"
      );
    },
    getRoomReview: async (bookingId, userId) => {
      const booking = state.bookings.find((item) =>
        item.booking_id === bookingId && item.user_id === userId
      );
      if (!booking) return null;
      return {
        booking_id: booking.booking_id,
        booking_status: booking.status,
        reviewed: state.reviews.has(bookingId),
        review: state.reviews.get(bookingId) || null
      };
    },
    getRoomReviewsByRoom: async (roomId) => ({
      room_id: roomId,
      average_rating: 5,
      review_count: 1,
      usage_count: 3,
      reviews: [{ id: 1, name: "Account Name", rating: 5, message: "Good room" }]
    }),
    submitRoomReview: async (bookingId, userId, rating, comment) => {
      state.calls.push(["submitRoomReview", bookingId, userId, rating, comment]);
      const booking = state.bookings.find((item) =>
        item.booking_id === bookingId && item.user_id === userId
      );
      if (!booking) {
        const error = new Error("ไม่พบรายการจองของผู้ใช้นี้");
        error.statusCode = 404;
        throw error;
      }
      if (booking.status !== "completed") {
        const error = new Error("รีวิวได้เฉพาะรายการจองที่เสร็จสิ้นแล้ว");
        error.statusCode = 409;
        throw error;
      }
      if (state.reviews.has(bookingId)) {
        const error = new Error("รายการจองนี้ได้รับรีวิวแล้ว");
        error.statusCode = 409;
        throw error;
      }
      const review = { booking_id: bookingId, rating, comment, reviewer_name: "Server Account Name" };
      state.reviews.set(bookingId, review);
      return review;
    },
    getMonthlyBookingQuota: async (userId, date) => {
      state.calls.push(["getMonthlyBookingQuota", Number(userId), date]);
      return {
        month: date.slice(0, 7),
        limit_minutes: 1200,
        used_minutes: 90,
        remaining_minutes: 1110
      };
    },
    createBooking: async (booking) => {
      state.calls.push(["createBooking", booking.user_id]);

      if (state.createBookingError) {
        throw state.createBookingError;
      }
      const created = {
        booking_id: 303,
        ...booking,
        status: "reserved",
        quota: {
          month: booking.date.slice(0, 7),
          limit_minutes: 1200,
          used_minutes: 60,
          remaining_minutes: 1140
        }
      };
      state.bookings.push(created);
      state.mutations += 1;
      return created;
    },
    checkInBooking: async (bookingId, userId) => {
      state.calls.push(["checkInBooking", bookingId, userId]);
      const booking = state.bookings.find((item) =>
        item.booking_id === bookingId && item.user_id === userId
      );
      if (!booking) throw new Error("ไม่พบรายการจอง");
      booking.status = "checked_in";
      state.mutations += 1;
      return { booking_id: bookingId, status: "checked_in" };
    },
    cancelBooking: async (bookingId, userId) => {
      state.calls.push(["cancelBooking", bookingId, userId]);
      const booking = state.bookings.find((item) =>
        item.booking_id === bookingId && item.user_id === userId
      );
      if (!booking) throw new Error("ไม่พบรายการจองของผู้ใช้นี้");
      booking.status = "cancelled";
      state.mutations += 1;
      return { booking_id: bookingId, status: "cancelled" };
    },
    getBangkokDate: () => "2026-11-17"
  }));
  app.get("/admin-probe", authenticateSession, requireAdmin, (req, res) => {
    res.json({ userId: req.session.userId });
  });

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const request = async (path, options = {}) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      ...options,
      headers: {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    return {
      status: response.status,
      body: await response.json()
    };
  };

  try {
    await run({ request, state, sessions });
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

test("Booking endpoints reject missing, invalid, absent, and expired sessions", async () => {
  await withBookingApi(async ({ request, state, sessions }) => {
    const protectedRequests = [
      ["/api/rooms", { method: "GET" }],
      ["/api/bookings", { method: "POST", body: JSON.stringify({ room: "301" }) }],
      ["/api/bookings/1", { method: "GET" }],
      ["/api/bookings/101/check-in", { method: "POST" }],
      ["/api/bookings/101", { method: "DELETE" }]
    ];

    for (const [path, options] of protectedRequests) {
      assert.equal((await request(path, options)).status, 401, path);
    }

    for (const authorization of [
      "Bearer invalid-token",
      "Bearer token-without-session",
      "Bearer expired-session"
    ]) {
      const response = await request("/api/bookings/1", {
        headers: { Authorization: authorization }
      });
      assert.equal(response.status, 401);
    }

    assert.equal(sessions.has("expired-session"), false);
    assert.deepEqual(state.calls, []);
    assert.equal(state.mutations, 0);
  });
});

test("a valid session reads only its own bookings despite spoofed headers and query values", async () => {
  await withBookingApi(async ({ request, state }) => {
    const response = await request("/api/bookings/1?user_id=2", {
      headers: {
        Authorization: "Bearer student-session",
        "X-User-Id": "2"
      }
    });

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.bookings.map((booking) => booking.booking_id),
      [101, 303]
    );
    assert.deepEqual(response.body.account, {
      no_show_count: 2,
      suspended_until: "2026-11-20 10:00:00"
    });
    assert.deepEqual(
      state.calls.filter(([name]) => name === "findBookingsByUser"),
      [["findBookingsByUser", 1]]
    );
    assert.equal(state.calls.some((call) =>
      call[0] === "findUserById" && call[1] === 1
    ), true);

    const otherPath = await request("/api/bookings/2", {
      headers: { Authorization: "Bearer student-session" }
    });
    assert.equal(otherPath.status, 403);
    assert.equal(state.calls.some((call) =>
      call[0] === "findUserById" && call[1] === 2
    ), false);
  });
});

test("booking creation uses session identity and ignores spoofed header, body, and query IDs", async () => {
  await withBookingApi(async ({ request, state }) => {
    const response = await request("/api/bookings?user_id=2", {
      method: "POST",
      headers: {
        Authorization: "Bearer student-session",
        "X-User-Id": "2"
      },
      body: JSON.stringify({
        user_id: 2,
        role: "admin",
        access_level: "admin",
        room: "301",
        date: "2026-11-18",
        start_time: "10:00",
        end_time: "11:00"
      })
    });

    assert.equal(response.status, 201);
    assert.deepEqual(response.body.quota, {
      month: "2026-11",
      limit_minutes: 1200,
      used_minutes: 60,
      remaining_minutes: 1140
    });
    assert.equal(state.bookings.at(-1).user_id, 1);
    assert.deepEqual(
      state.calls.filter(([name]) => name === "createBooking"),
      [["createBooking", 1]]
    );
    assert.equal(state.mutations, 1);
  });
});


test("suspended account receives 403 ACCOUNT_SUSPENDED when creating a booking", async () => {
  await withBookingApi(async ({ request, state }) => {
    const suspensionMessage =
      "บัญชีถูกระงับการจองชั่วคราว 2 สัปดาห์ เนื่องจากไม่มาใช้งานเกิน 2 ครั้ง";

    const error = new Error(suspensionMessage);
    error.code = "ACCOUNT_SUSPENDED";
    state.createBookingError = error;

    const response = await request("/api/bookings", {
      method: "POST",
      headers: {
        Authorization: "Bearer student-session"
      },
      body: JSON.stringify({
        room: "301",
        date: "2026-11-18",
        start_time: "10:00",
        end_time: "11:00"
      })
    });

    assert.equal(response.status, 403);
    assert.deepEqual(response.body, {
      success: false,
      code: "ACCOUNT_SUSPENDED",
      message: suspensionMessage
    });

    assert.deepEqual(
      state.calls.filter(([name]) => name === "createBooking"),
      [["createBooking", 1]]
    );
    assert.equal(state.mutations, 0);
    assert.equal(state.bookings.length, 3);
  });
});


test("monthly quota API uses only authenticated user identity and validates the month date", async () => {
  await withBookingApi(async ({ request, state }) => {
    const response = await request("/api/bookings/quota?date=2026-12-31", {
      headers: {
        Authorization: "Bearer student-session",
        "X-User-Id": "2"
      }
    });
    assert.equal(response.status, 200);
    assert.deepEqual(response.body.quota, {
      month: "2026-12",
      limit_minutes: 1200,
      used_minutes: 90,
      remaining_minutes: 1110
    });
    assert.deepEqual(state.calls.filter(([name]) => name === "getMonthlyBookingQuota"), [
      ["getMonthlyBookingQuota", 1, "2026-12-31"]
    ]);

    const invalidDate = await request("/api/bookings/quota?date=2026-02-30", {
      headers: { Authorization: "Bearer student-session" }
    });
    assert.equal(invalidDate.status, 400);
    assert.equal(state.calls.filter(([name]) => name === "getMonthlyBookingQuota").length, 1);
  });
});

test("room role and booking availability are based on the authenticated session", async () => {
  await withBookingApi(async ({ request, state }) => {
    const response = await request("/api/rooms?date=2026-11-17", {
      headers: {
        Authorization: "Bearer student-session",
        "X-User-Id": "2"
      }
    });

    assert.equal(response.status, 200);
    assert.equal(response.body.role, "student");
    assert.deepEqual(state.roomRoles, ["student"]);
    assert.deepEqual(response.body.rooms[0].bookings, [
      { start_time: "10:00", end_time: "11:00" },
      { start_time: "11:00", end_time: "12:00" }
    ]);
  });
});

test("non-owners cannot check in or cancel another user's booking", async () => {
  await withBookingApi(async ({ request, state }) => {
    const before = state.bookings.map((booking) => ({ ...booking }));
    const headers = {
      Authorization: "Bearer student-session",
      "X-User-Id": "2"
    };

    const checkIn = await request("/api/bookings/202/check-in", {
      method: "POST",
      headers,
      body: JSON.stringify({ user_id: 2 })
    });
    const cancel = await request("/api/bookings/202", {
      method: "DELETE",
      headers
    });

    assert.equal(checkIn.status, 400);
    assert.equal(cancel.status, 400);
    assert.deepEqual(state.bookings, before);
    assert.equal(state.mutations, 0);
    assert.deepEqual(
      state.calls.filter(([name]) =>
        name === "checkInBooking" || name === "cancelBooking"
      ),
      [
        ["checkInBooking", 202, 1],
        ["cancelBooking", 202, 1]
      ]
    );
  });
});

test("owners can check in and cancel their own bookings", async () => {
  await withBookingApi(async ({ request, state }) => {
    const headers = { Authorization: "Bearer student-session" };
    const checkIn = await request("/api/bookings/101/check-in", {
      method: "POST",
      headers
    });
    const cancel = await request("/api/bookings/101", {
      method: "DELETE",
      headers
    });

    assert.equal(checkIn.status, 200);
    assert.equal(cancel.status, 200);
    assert.equal(state.bookings[0].user_id, 1);
    assert.equal(state.bookings[0].status, "cancelled");
    assert.equal(state.mutations, 2);
  });
});

test("room reviews require an owned completed booking and rating from 1 to 5", async () => {
  await withBookingApi(async ({ request, state }) => {
    const headers = { Authorization: "Bearer student-session" };
    for (const rating of [0, 6, 1.5]) {
      const invalid = await request("/api/bookings/303/review", {
        method: "POST", headers, body: JSON.stringify({ rating, comment: "Test" })
      });
      assert.equal(invalid.status, 400);
    }
    const missingSession = await request("/api/bookings/303/review", {
      method: "POST", body: JSON.stringify({ rating: 5, comment: "Test" })
    });
    assert.equal(missingSession.status, 401);

    const nonOwner = await request("/api/bookings/202/review", {
      method: "POST", headers, body: JSON.stringify({ rating: 5, comment: "Test" })
    });
    const missing = await request("/api/bookings/999/review", {
      method: "POST", headers, body: JSON.stringify({ rating: 5, comment: "Test" })
    });
    assert.equal(nonOwner.status, 404);
    assert.equal(missing.status, 404);
    assert.equal(state.reviews.size, 0);

    for (const status of ["reserved", "checked_in", "no_show", "cancelled"]) {
      const booking = state.bookings.find((item) => item.booking_id === 303);
      booking.status = status;
      const rejected = await request("/api/bookings/303/review", {
        method: "POST", headers, body: JSON.stringify({ rating: 5, comment: "Not complete" })
      });
      assert.equal(rejected.status, 409, status);
    }
    state.bookings.find((item) => item.booking_id === 303).status = "completed";

    const submitted = await request("/api/bookings/303/review", {
      method: "POST",
      headers,
      body: JSON.stringify({
        rating: 5,
        comment: "Room review",
        user_id: 2,
        room_id: 999,
        reviewer_name: "Forged Name"
      })
    });
    assert.equal(submitted.status, 201);
    assert.deepEqual(state.calls.at(-1), ["submitRoomReview", 303, 1, 5, "Room review"]);
    assert.equal(submitted.body.review.reviewer_name, "Server Account Name");

    const status = await request("/api/bookings/303/review", { headers });
    assert.equal(status.status, 200);
    assert.equal(status.body.reviewed, true);
    assert.equal(status.body.review.comment, "Room review");

    const duplicate = await request("/api/bookings/303/review", {
      method: "POST", headers, body: JSON.stringify({ rating: 4, comment: "Again" })
    });
    assert.equal(duplicate.status, 409);
    assert.equal(state.reviews.size, 1);
  });
});

test("simultaneous room review requests result in a single review", async () => {
  await withBookingApi(async ({ request, state }) => {
    const options = {
      method: "POST",
      headers: { Authorization: "Bearer student-session" },
      body: JSON.stringify({ rating: 5, comment: "One review only" })
    };
    const results = await Promise.all([
      request("/api/bookings/303/review", options),
      request("/api/bookings/303/review", options)
    ]);
    assert.deepEqual(results.map(({ status }) => status).sort(), [201, 409]);
    assert.equal(state.reviews.size, 1);
  });
});

test("room review listing requires a session and returns persisted room data", async () => {
  await withBookingApi(async ({ request }) => {
    const denied = await request("/api/rooms/1/reviews");
    const allowed = await request("/api/rooms/1/reviews", {
      headers: { Authorization: "Bearer student-session" }
    });
    assert.equal(denied.status, 401);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.review_count, 1);
    assert.equal(allowed.body.reviews[0].message, "Good room");
  });
});

test("Admin access still uses the existing session access level", async () => {
  await withBookingApi(async ({ request }) => {
    const denied = await request("/admin-probe", {
      headers: { Authorization: "Bearer student-session" }
    });
    const allowed = await request("/admin-probe", {
      headers: { Authorization: "Bearer admin-session" }
    });

    assert.equal(denied.status, 403);
    assert.equal(allowed.status, 200);
    assert.equal(allowed.body.userId, 3);
  });
});

test("a regular TU teacher login still establishes a teacher session", async () => {
  let tokenUser;
  const result = await authenticateLogin(
    { identifier: "tu-teacher", password: "mock-password" },
    {
      resolveLoginIdentifier: async (identifier) => identifier,
      verifyWithTuApi: async () => ({
        data: {
          username: "tu-teacher",
          faculty: ALLOWED_FACULTY,
          department: ALLOWED_MAJOR,
          type: "teacher"
        },
        responsePath: "data"
      }),
      saveUser: async (userData) => ({
        user_id: 4,
        ...userData,
        access_level: "user"
      }),
      createToken: (user) => {
        tokenUser = user;
        return "mock-tu-teacher-session";
      }
    }
  );

  assert.equal(result.authorized, true);
  assert.equal(result.userData.role, "teacher");
  assert.equal(tokenUser.role, "teacher");
  assert.equal(tokenUser.access_level, "user");
  assert.equal(result.token, "mock-tu-teacher-session");
});
