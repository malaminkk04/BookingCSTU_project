const assert = require("node:assert/strict");
const { once } = require("node:events");
const express = require("express");
const { test } = require("node:test");
const { createFeedbackRouter } = require("../routes/feedback-api");
const { createAuthenticateSession, requireAdmin } = require("../utils/session-auth");

async function withFeedbackApi(run) {
  const sessions = new Map([
    ["user", { userId: 10, accessLevel: "user", expiresAt: Date.now() + 60_000 }],
    ["admin", { userId: 20, accessLevel: "admin", expiresAt: Date.now() + 60_000 }]
  ]);
  const state = {
    users: new Map([[10, { user_id: 10, role: "student" }], [20, { user_id: 20, role: "admin" }]]),
    systemReviews: [
      { review_id: 1, user_id: 10, rating: 4, comment: "Visible", status: "visible", created_at: "2026-11-17", name: "User" },
      { review_id: 2, user_id: 20, rating: 5, comment: "Hidden", status: "hidden", created_at: "2026-11-16", name: "Admin" }
    ],
    complaints: [],
    repair_reports: [],
    queries: []
  };
  const pool = {
    async execute(sql, params = []) {
      const normalized = sql.replace(/\s+/g, " ").trim();
      state.queries.push({ sql: normalized, params });
      if (normalized.startsWith("SELECT sr.review_id AS id")) {
        const reviews = state.systemReviews
          .filter((item) => !normalized.includes("WHERE sr.status = 'visible'") || item.status === "visible")
          .filter((item) => !normalized.includes("WHERE sr.review_id = ?") || item.review_id === params[0])
          .map((item) => ({ ...item, comment: item.comment, message: item.comment, reviewer_name: item.name }));
        return [normalized.includes("WHERE sr.review_id = ?") ? reviews.slice(0, 1) : reviews, []];
      }
      if (normalized.startsWith("INSERT INTO system_reviews")) {
        const [user_id, rating, comment] = params;
        const review_id = state.systemReviews.length + 1;
        state.systemReviews.push({ review_id, user_id, rating, comment, status: "visible", name: "User" });
        return [{ insertId: review_id, affectedRows: 1 }, []];
      }
      const insertTable = normalized.match(/^INSERT INTO (complaints|repair_reports)/i)?.[1];
      if (insertTable) {
        const [user_id, room_id, subject, description] = params;
        const isComplaint = insertTable === "complaints";
        const idColumn = isComplaint ? "complaint_id" : "repair_id";
        const record = {
          [idColumn]: state[insertTable].length + 1,
          user_id, room_id, subject, description,
          status: "รอดำเนินการ",
          created_at: "2026-11-17"
        };
        state[insertTable].push(record);
        return [{ insertId: record[idColumn], affectedRows: 1 }, []];
      }
      const update = normalized.match(/^UPDATE (system_reviews|complaints|repair_reports) SET status = \? WHERE (?:review_id|complaint_id|repair_id) = \?/i);
      if (update) {
        const [status, id] = params;
        const table = update[1];
        const idColumn = table === "system_reviews" ? "review_id" : table === "complaints" ? "complaint_id" : "repair_id";
        const records = table === "system_reviews" ? state.systemReviews : state[table];
        const record = records.find((item) => item[idColumn] === id);
        if (!record) return [{ affectedRows: 0 }, []];
        record.status = status;
        return [{ affectedRows: 1 }, []];
      }
      if (normalized.includes("FROM system_reviews sr")) {
        const id = params[0];
        return [state.systemReviews.filter((item) => item.review_id === id), []];
      }
      const recordTable = normalized.match(/FROM (complaints|repair_reports) record/i)?.[1];
      if (recordTable) {
        const records = state[recordTable];
        if (normalized.includes("WHERE record.user_id = ?")) {
          return [records.filter((item) => item.user_id === params[0]), []];
        }
        if (normalized.includes("WHERE record.")) {
          const id = params[0];
          const idColumn = recordTable === "complaints" ? "complaint_id" : "repair_id";
          return [records.filter((item) => item[idColumn] === id), []];
        }
        return [records.map((item) => ({ ...item, reporter_name: "Account", room_name: item.room_id ? "Room" : null })), []];
      }
      throw new Error(`Unexpected feedback mock query: ${normalized}`);
    }
  };
  const app = express();
  app.use(express.json());
  app.use("/api", createFeedbackRouter({
    pool,
    authenticateSession: createAuthenticateSession(sessions),
    requireAdmin,
    findUserById: async (id) => state.users.get(Number(id)) || null
  }));
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  const request = async (path, { token, method = "GET", body } = {}) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    return { status: response.status, body: await response.json() };
  };
  try { await run({ request, state }); }
  finally { await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

test("system reviews require a session, validate rating, ignore identity fields, and expose visible records", async () => {
  await withFeedbackApi(async ({ request, state }) => {
    assert.equal((await request("/api/system-reviews")).status, 401);
    assert.equal((await request("/api/system-reviews", { token: "user", method: "POST", body: { rating: 0, comment: "Bad" } })).status, 400);
    const created = await request("/api/system-reviews", {
      token: "user", method: "POST",
      body: { rating: 5, comment: "Good system", user_id: 20, reviewer_name: "Forged" }
    });
    assert.equal(created.status, 201);
    assert.equal(state.systemReviews.at(-1).user_id, 10);
    assert.equal(state.systemReviews.at(-1).status, "visible");
    const visible = await request("/api/system-reviews", { token: "user" });
    assert.equal(visible.status, 200);
    assert.equal(visible.body.reviews.some((item) => item.status === "hidden"), false);
  });
});

test("complaints and repair reports require subject and description and allow no room", async () => {
  await withFeedbackApi(async ({ request, state }) => {
    for (const path of ["complaints", "repair-reports"]) {
      assert.equal((await request(`/api/${path}`, { token: "user", method: "POST", body: { subject: "", description: "x" } })).status, 400);
      const created = await request(`/api/${path}`, {
        token: "user", method: "POST",
        body: { subject: "Issue", description: "Details", user_id: 20, room_id: null, status: "เสร็จสิ้น" }
      });
      assert.equal(created.status, 201);
      const table = path === "complaints" ? "complaints" : "repair_reports";
      assert.equal(state[table][0].user_id, 10);
      assert.equal(state[table][0].room_id, null);
      assert.equal(state[table][0].status, "รอดำเนินการ");
    }
  });
});

test("users can only read their own complaints and repair reports and cannot change status", async () => {
  await withFeedbackApi(async ({ request, state }) => {
    state.complaints.push({ complaint_id: 1, user_id: 10, subject: "Mine", status: "รอดำเนินการ" }, { complaint_id: 2, user_id: 20, subject: "Other", status: "รอดำเนินการ" });
    state.repair_reports.push({ repair_id: 1, user_id: 10, subject: "Mine", status: "รอดำเนินการ" }, { repair_id: 2, user_id: 20, subject: "Other", status: "รอดำเนินการ" });
    for (const [path, key] of [["complaints", "complaint_id"], ["repair-reports", "repair_id"]]) {
      const own = await request(`/api/${path}/mine`, { token: "user" });
      assert.equal(own.status, 200);
      assert.equal(own.body.data.length, 1);
      assert.equal(own.body.data[0].user_id, 10);
      assert.equal((await request(`/api/${path}/1/status`, { token: "user", method: "PATCH", body: { status: "เสร็จสิ้น" } })).status, 403);
      assert.ok(key);
    }
  });
});

test("admins can view and update all records but invalid statuses and non-admins are rejected", async () => {
  await withFeedbackApi(async ({ request, state }) => {
    state.complaints.push({ complaint_id: 7, user_id: 10, subject: "Complaint", description: "Details", status: "รอดำเนินการ" });
    state.repair_reports.push({ repair_id: 8, user_id: 10, subject: "Repair", description: "Details", status: "รอดำเนินการ" });
    assert.equal((await request("/api/admin/complaints", { token: "user" })).status, 403);
    assert.equal((await request("/api/admin/complaints")).status, 401);
    const reviews = await request("/api/admin/reviews", { token: "admin" });
    assert.equal(reviews.status, 200);
    assert.equal(reviews.body.data.some((item) => item.status === "hidden"), true);
    assert.equal((await request("/api/admin/reviews/1", { token: "user" })).status, 403);
    assert.equal((await request("/api/admin/reviews/1", { token: "admin" })).body.data.comment, "Visible");
    assert.equal((await request("/api/admin/reviews/999", { token: "admin" })).status, 404);
    assert.equal((await request("/api/admin/reviews/1/status", { token: "user", method: "PATCH", body: { status: "hidden" } })).status, 403);
    assert.equal((await request("/api/admin/reviews/1/status", { token: "admin", method: "PATCH", body: { status: "ซ่อนรีวิว" } })).status, 400);
    assert.equal((await request("/api/admin/reviews/1/status", { token: "admin", method: "PATCH", body: { status: "hidden" } })).status, 200);
    assert.equal((await request("/api/admin/reviews", { token: "admin" })).body.data.find((item) => item.review_id === 1).status, "hidden");
    assert.equal((await request("/api/admin/complaints/7/status", { token: "admin", method: "PATCH", body: { status: "ปิดเรื่อง" } })).status, 400);
    assert.equal((await request("/api/admin/complaints/7/status", { token: "admin", method: "PATCH", body: { status: "เสร็จสิ้น" } })).status, 200);
    assert.equal((await request("/api/admin/complaints/7", { token: "admin" })).body.data.status, "เสร็จสิ้น");
    assert.equal((await request("/api/admin/repairs/8/status", { token: "admin", method: "PATCH", body: { status: "ยกเลิก" } })).status, 200);
    const repair = await request("/api/admin/repairs/8", { token: "admin" });
    assert.equal(repair.body.data.description, "Details");
    assert.equal(repair.body.data.status, "ยกเลิก");
    assert.equal((await request("/api/admin/repairs/8/status", { token: "admin", method: "PATCH", body: { status: "ปิดเรื่อง" } })).status, 400);
  });
});
