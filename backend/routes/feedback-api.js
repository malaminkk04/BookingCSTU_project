const express = require("express");

const COMPLAINT_STATUSES = ["รอดำเนินการ", "กำลังตรวจสอบ", "ดำเนินการแล้ว", "เสร็จสิ้น"];
const REPAIR_STATUSES = ["รอดำเนินการ", "กำลังซ่อม", "ซ่อมเสร็จ", "ยกเลิก"];
const REVIEW_STATUSES = ["visible", "hidden"];

function getSessionUserId(req) {
  const id = Number(req.session?.userId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function parseOptionalRoomId(value) {
  if (value === undefined || value === null || value === "") return null;
  const roomId = Number(value);
  return Number.isInteger(roomId) && roomId > 0 ? roomId : undefined;
}

function createFeedbackRouter({ pool, authenticateSession, requireAdmin, findUserById }) {
  const router = express.Router();

  async function verifyAdmin(req, res, next) {
    try {
      const user = await findUserById(getSessionUserId(req));
      const isAdmin = [user?.role, user?.access_level]
        .some((value) => String(value || "").toLowerCase() === "admin");
      if (!isAdmin) {
        return res.status(403).json({ success: false, message: "คุณไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ" });
      }
      req.adminUser = user;
      return next();
    } catch (error) {
      console.error("Feedback admin authorization error:", error.message);
      return res.status(500).json({ success: false, message: "ไม่สามารถตรวจสอบสิทธิ์ผู้ดูแลระบบได้" });
    }
  }

  function handleDatabaseError(res, error, context) {
    console.error(`${context}:`, error.message);
    if (error.code === "ER_NO_REFERENCED_ROW_2" || error.errno === 1452) {
      return res.status(400).json({ success: false, message: "ไม่พบห้องที่เลือก" });
    }
    return res.status(500).json({ success: false, message: "ไม่สามารถดำเนินการได้ในขณะนี้" });
  }

  router.use(["/system-reviews", "/complaints", "/repair-reports"], authenticateSession);

  router.get("/system-reviews", async (req, res) => {
    try {
      const [reviews] = await pool.execute(
        `SELECT sr.review_id AS id, sr.review_id, sr.rating, sr.comment AS message,
                sr.status, sr.created_at, u.name AS name, 0 AS helpful,
                1 AS verified, 'รีวิว' AS type
         FROM system_reviews sr JOIN users u ON u.user_id = sr.user_id
         WHERE sr.status = 'visible' ORDER BY sr.created_at DESC`
      );
      return res.json({ success: true, data: reviews, reviews });
    } catch (error) { return handleDatabaseError(res, error, "Get visible system reviews error"); }
  });

  router.post("/system-reviews", async (req, res) => {
    const userId = getSessionUserId(req);
    const { rating, comment } = req.body || {};
    const normalizedComment = typeof comment === "string" ? comment.trim() : "";
    if (!userId) return res.status(401).json({ success: false, message: "กรุณาเข้าสู่ระบบใหม่" });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: "คะแนนรีวิวต้องอยู่ระหว่าง 1 ถึง 5" });
    }
    if (!normalizedComment || normalizedComment.length > 1000) {
      return res.status(400).json({ success: false, message: "กรุณากรอกรายละเอียดไม่เกิน 1,000 ตัวอักษร" });
    }
    try {
      const [result] = await pool.execute(
        "INSERT INTO system_reviews (user_id, rating, comment) VALUES (?, ?, ?)",
        [userId, rating, normalizedComment]
      );
      return res.status(201).json({ success: true, review_id: result.insertId, status: "visible" });
    } catch (error) { return handleDatabaseError(res, error, "Create system review error"); }
  });

  router.patch("/complaints/:id/status", (_req, res) => res.status(403).json({
    success: false,
    message: "ผู้ใช้ไม่สามารถเปลี่ยนสถานะเรื่องร้องเรียนได้"
  }));
  router.patch("/repair-reports/:id/status", (_req, res) => res.status(403).json({
    success: false,
    message: "ผู้ใช้ไม่สามารถเปลี่ยนสถานะรายการแจ้งซ่อมได้"
  }));

  for (const [path, table, idColumn] of [
    ["complaints", "complaints", "complaint_id"],
    ["repair-reports", "repair_reports", "repair_id"]
  ]) {
    router.get(`/${path}/mine`, async (req, res) => {
      const userId = getSessionUserId(req);
      if (!userId) return res.status(401).json({ success: false, message: "กรุณาเข้าสู่ระบบใหม่" });
      try {
        const [records] = await pool.execute(
          `SELECT record.*, r.room_name
           FROM ${table} record LEFT JOIN rooms r ON r.room_id = record.room_id
           WHERE record.user_id = ? ORDER BY record.created_at DESC`,
          [userId]
        );
        return res.json({ success: true, data: records });
      } catch (error) { return handleDatabaseError(res, error, `Get own ${path} error`); }
    });

    router.post(`/${path}`, async (req, res) => {
      const userId = getSessionUserId(req);
      const subject = typeof req.body?.subject === "string" ? req.body.subject.trim() : "";
      const description = typeof req.body?.description === "string" ? req.body.description.trim() : "";
      const roomId = parseOptionalRoomId(req.body?.room_id);
      if (!userId) return res.status(401).json({ success: false, message: "กรุณาเข้าสู่ระบบใหม่" });
      if (!subject || subject.length > 255 || !description || description.length > 20_000) {
        return res.status(400).json({ success: false, message: "กรุณากรอกหัวข้อและรายละเอียดให้ครบถ้วน" });
      }
      if (roomId === undefined) return res.status(400).json({ success: false, message: "รหัสห้องไม่ถูกต้อง" });
      try {
        const [result] = await pool.execute(
          `INSERT INTO ${table} (user_id, room_id, subject, description) VALUES (?, ?, ?, ?)`,
          [userId, roomId, subject, description]
        );
        return res.status(201).json({
          success: true,
          [idColumn]: result.insertId,
          status: path === "complaints" ? COMPLAINT_STATUSES[0] : REPAIR_STATUSES[0]
        });
      } catch (error) { return handleDatabaseError(res, error, `Create ${path} error`); }
    });
  }

  router.use("/admin", authenticateSession, requireAdmin, verifyAdmin);

  router.get("/admin/reviews", async (_req, res) => {
    try {
      const [reviews] = await pool.execute(
        `SELECT sr.review_id AS id, sr.review_id, sr.rating, sr.comment,
                sr.status, sr.created_at, u.name AS reviewer_name
         FROM system_reviews sr JOIN users u ON u.user_id = sr.user_id
         ORDER BY sr.created_at DESC`
      );
      return res.json({ success: true, data: reviews });
    } catch (error) { return handleDatabaseError(res, error, "Admin get system reviews error"); }
  });

  router.get("/admin/reviews/:id", async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ success: false, message: "รหัสรีวิวไม่ถูกต้อง" });
    }
    try {
      const [reviews] = await pool.execute(
        `SELECT sr.review_id AS id, sr.review_id, sr.rating, sr.comment,
                sr.status, sr.created_at, u.name AS reviewer_name
         FROM system_reviews sr JOIN users u ON u.user_id = sr.user_id
         WHERE sr.review_id = ? LIMIT 1`,
        [id]
      );
      if (!reviews.length) return res.status(404).json({ success: false, message: "ไม่พบรีวิว" });
      return res.json({ success: true, data: reviews[0] });
    } catch (error) { return handleDatabaseError(res, error, "Admin get system review detail error"); }
  });

  router.patch("/admin/reviews/:id/status", async (req, res) => {
    const id = Number(req.params.id);
    const { status } = req.body || {};
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: "รหัสรีวิวไม่ถูกต้อง" });
    if (!REVIEW_STATUSES.includes(status)) return res.status(400).json({ success: false, message: "สถานะรีวิวไม่ถูกต้อง" });
    try {
      const [result] = await pool.execute("UPDATE system_reviews SET status = ? WHERE review_id = ?", [status, id]);
      if (!result.affectedRows) return res.status(404).json({ success: false, message: "ไม่พบรีวิว" });
      return res.json({ success: true, status });
    } catch (error) { return handleDatabaseError(res, error, "Admin update system review error"); }
  });

  for (const [path, table, idColumn, statuses] of [
    ["complaints", "complaints", "complaint_id", COMPLAINT_STATUSES],
    ["repairs", "repair_reports", "repair_id", REPAIR_STATUSES]
  ]) {
    const selectSql = `SELECT record.*, u.name AS reporter_name, r.room_name
       FROM ${table} record JOIN users u ON u.user_id = record.user_id
       LEFT JOIN rooms r ON r.room_id = record.room_id`;
    router.get(`/admin/${path}`, async (_req, res) => {
      try {
        const [records] = await pool.execute(`${selectSql} ORDER BY record.created_at DESC`);
        return res.json({ success: true, data: records });
      } catch (error) { return handleDatabaseError(res, error, `Admin get ${path} error`); }
    });
    router.get(`/admin/${path}/:id`, async (req, res) => {
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: "รหัสรายการไม่ถูกต้อง" });
      try {
        const [records] = await pool.execute(`${selectSql} WHERE record.${idColumn} = ? LIMIT 1`, [id]);
        if (!records.length) return res.status(404).json({ success: false, message: "ไม่พบรายการ" });
        return res.json({ success: true, data: records[0] });
      } catch (error) { return handleDatabaseError(res, error, `Admin get ${path} detail error`); }
    });
    router.patch(`/admin/${path}/:id/status`, async (req, res) => {
      const id = Number(req.params.id);
      const { status } = req.body || {};
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ success: false, message: "รหัสรายการไม่ถูกต้อง" });
      if (!statuses.includes(status)) return res.status(400).json({ success: false, message: "สถานะไม่ถูกต้อง" });
      try {
        const [result] = await pool.execute(`UPDATE ${table} SET status = ? WHERE ${idColumn} = ?`, [status, id]);
        if (!result.affectedRows) return res.status(404).json({ success: false, message: "ไม่พบรายการ" });
        return res.json({ success: true, status });
      } catch (error) { return handleDatabaseError(res, error, `Admin update ${path} status error`); }
    });
  }

  return router;
}

module.exports = {
  createFeedbackRouter,
  COMPLAINT_STATUSES,
  REPAIR_STATUSES,
  REVIEW_STATUSES
};
