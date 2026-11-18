const path = require("path");

const useDemoDb = process.env.USE_DEMO_DB === "true";

require("dotenv").config({
  path: path.join(
    __dirname,
    useDemoDb ? ".env.demo.local" : ".env"
  ),
  override: false
});

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const multer = require("multer");
const {
  validateRoomImage,
  getManagedRoomImageFilename
} = require("./utils/room-image");
const {
  BOOKING_STATUSES,
  summarizeBookingStatuses
} = require("./utils/booking-status");
const {
  LOGIN_RESTRICTION_MESSAGE,
  authenticateLogin,
  logTuAffiliationDebug
} = require("./utils/login-flow");
const {
  createAuthenticateSession,
  requireAdmin
} = require("./utils/session-auth");
const { createBookingRouter } = require("./routes/booking-api");
const { createFeedbackRouter } = require("./routes/feedback-api");

const {
  db,
  upsertUser,
  getUserById,
  addBooking,
  getBookingsByUser,
  getRoomReview,
  getRoomReviewsByRoom,
  submitRoomReview,
  getMonthlyBookingQuota,
  getBookingsByDate,
  getRooms,
  deleteBooking,
  checkInBooking,
  updateBookingStatuses
} = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 5001);
const ROOM_IMAGE_DIRECTORY = path.join(__dirname, "uploads", "rooms");
const ROOM_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

const TU_AUTH_URL = "https://restapi.tu.ac.th/api/v1/auth/Ad/verify";

const sessions = new Map();
const authenticateSession = createAuthenticateSession(sessions);

app.use(cors());
app.use(express.json());
app.use(
  "/uploads/rooms",
  express.static(ROOM_IMAGE_DIRECTORY, {
    dotfiles: "deny",
    index: false,
    immutable: true,
    maxAge: "1d"
  })
);

function getUserIdentifier(body = {}) {
  return String(
    body.identifier ||
    body.username ||
    body.tu_id ||
    body.usernameOrEmail ||
    ""
  ).trim();
}

function createToken(user) {
  const token = crypto.randomBytes(32).toString("hex");

  sessions.set(token, {
    userId: Number(user.user_id),
    accessLevel: String(user.access_level || "user"),
    expiresAt: Date.now() + 8 * 60 * 60 * 1000
  });

  return token;
}

function getBangkokDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts.map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day}`;
}

function getBangkokDateTime() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date());

  const values = Object.fromEntries(
    parts
      .filter(part => part.type !== "literal")
      .map(part => [part.type, part.value])
  );

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function resolveLoginIdentifier(identifier) {
  const value = String(identifier || "").trim();

  if (!value.includes("@")) {
    return Promise.resolve(value);
  }

  return new Promise((resolve, reject) => {
    db.query(
      `SELECT username, tu_id
       FROM users
       WHERE LOWER(TRIM(email)) = LOWER(TRIM(?))
       LIMIT 1`,
      [value],
      (error, rows) => {
        if (error) {
          return reject(error);
        }

        if (!rows || rows.length === 0) {
          return reject(
            new Error("No account found for this email address")
          );
        }

        const account = rows[0];
        const loginUsername = account.username || account.tu_id;

        if (!loginUsername) {
          return reject(
            new Error("No username found for this email address")
          );
        }

        resolve(String(loginUsername).trim());
      }
    );
  });
}

function saveUser(userData) {
  return new Promise((resolve, reject) => {
    upsertUser(userData, (error, user) => {
      if (error) {
        return reject(error);
      }

      if (!user || !user.user_id) {
        return reject(
          new Error("Unable to save or load user account from database")
        );
      }

      resolve(user);
    });
  });
}

function findUserById(userId) {
  return new Promise((resolve, reject) => {
    getUserById(userId, (error, user) => {
      if (error) {
        return reject(error);
      }

      resolve(user);
    });
  });
}

function findRooms(role) {
  return new Promise((resolve, reject) => {
    getRooms(role, (error, rooms) => {
      if (error) {
        return reject(error);
      }

      resolve(rooms);
    });
  });
}

function findBookingsByDate(date) {
  return new Promise((resolve, reject) => {
    getBookingsByDate(date, (error, bookings) => {
      if (error) {
        return reject(error);
      }

      resolve(bookings);
    });
  });
}

function findBookingsByUser(userId) {
  return new Promise((resolve, reject) => {
    getBookingsByUser(userId, (error, bookings) => {
      if (error) {
        return reject(error);
      }

      resolve(bookings);
    });
  });
}

function createBooking(booking) {
  return new Promise((resolve, reject) => {
    addBooking(booking, (error, result) => {
      if (error) {
        return reject(error);
      }

      resolve(result);
    });
  });
}

function cancelBooking(bookingId, userId) {
  return new Promise((resolve, reject) => {
    deleteBooking(bookingId, userId, (error, result) => {
      if (error) {
        return reject(error);
      }

      resolve(result);
    });
  });
}

async function verifyWithTuApi(identifier, password) {
  const applicationKey = process.env.TU_API_KEY;

  if (!applicationKey) {
    throw new Error("TU_API_KEY is missing from the backend .env file");
  }

  const response = await fetch(TU_AUTH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Application-Key": applicationKey
    },
    body: JSON.stringify({
      UserName: identifier,
      PassWord: password
    })
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      result.message ||
      result.Message ||
      "TU authentication failed"
    );
  }

  const responsePath = result.data ? "data" : result.Data ? "Data" : "$";
  const data = result.data || result.Data || result;

  const success =
    result.status === true ||
    result.success === true ||
    result.status === "success" ||
    result.status === "SUCCESS" ||
    Boolean(data.username || data.username_en || data.username_th);

  if (!success) {
    throw new Error(
      result.message ||
      result.Message ||
      "Invalid TU username or password"
    );
  }

  return { data, responsePath };
}

function sendLoginSuccess(res, user, token) {
  return res.json({
    success: true,
    message: "Login successful",
    token,
    user: {
      user_id: user.user_id,
      username: user.username,
      tu_id: user.tu_id,
      email: user.email,
      name: user.name,
      displayname_th: user.displayname_th,
      faculty: user.faculty,
      major: user.major,
      role: user.role,
      access_level: user.access_level || "user",
      no_show_count: user.no_show_count || 0,
      suspended_until: user.suspended_until || null
    }
  });
}

app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "BookingCSTU backend is running",
    port: PORT
  });
});

// ========================================
// LOGIN
// ========================================
app.post("/login", async (req, res) => {
  try {
    const identifier = getUserIdentifier(req.body);
    const password = String(
      req.body.password || req.body.PassWord || ""
    );

    if (!identifier || !password) {
      return res.status(400).json({
        success: false,
        message: "Please enter your username and password"
      });
    }

    const loginResult = await authenticateLogin(
      { identifier, password },
      {
        resolveLoginIdentifier,
        verifyWithTuApi,
        saveUser,
        createToken,
        debugTuAffiliation: (data, responsePath) =>
          logTuAffiliationDebug(data, responsePath, { env: process.env })
      }
    );

    if (!loginResult.authorized) {
      return res.status(403).json({
        success: false,
        message: LOGIN_RESTRICTION_MESSAGE
      });
    }

    return sendLoginSuccess(
      res,
      {
        ...loginResult.savedUser,
        username: loginResult.userData.username,
        tu_id: loginResult.userData.tu_id,
        email: loginResult.userData.email || loginResult.savedUser.email,
        name: loginResult.userData.displayname_th,
        displayname_th: loginResult.userData.displayname_th,
        faculty: loginResult.userData.faculty,
        major: loginResult.userData.major,
        role: loginResult.userData.role,
        access_level: loginResult.savedUser.access_level || "user"
      },
      loginResult.token
    );
  } catch {
    console.error("Login error: authentication failed");

    return res.status(401).json({
      success: false,
      message: "เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบบัญชีผู้ใช้และรหัสผ่าน"
    });
  }
});

// ========================================
// ADMIN DASHBOARD API
// อ่านข้อมูลจริงจาก MySQL
// ========================================
app.get(
  "/api/admin/dashboard",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const database = db.promise();
      const today = getBangkokDate();

      const [
        [roomRows],
        [userRows],
        [bookingRows],
        [statusRows],
        [todayBookings]
      ] = await Promise.all([
        database.execute(`
          SELECT
            COUNT(*) AS total_rooms,
            COALESCE(
              SUM(CASE WHEN is_available = 1 THEN 1 ELSE 0 END),
              0
            ) AS available_rooms
          FROM rooms
        `),

        database.execute(`
          SELECT COUNT(*) AS total_users
          FROM users
          WHERE role IN ('student', 'teacher')
        `),

        database.execute(`
          SELECT COUNT(*) AS total_bookings
          FROM bookings
        `),

        database.execute(`
          SELECT status, COUNT(*) AS total
          FROM bookings
          GROUP BY status
        `),

        database.execute(
          `
          SELECT
            b.booking_id,
            b.booking_date,
            b.start_time,
            b.end_time,
            b.status,
            b.purpose,
            r.room_code,
            r.room_name,
            u.user_id,
            COALESCE(
              NULLIF(u.displayname_th, ''),
              NULLIF(u.name, ''),
              u.username,
              u.tu_id
            ) AS user_name
          FROM bookings b
          INNER JOIN rooms r
            ON r.room_id = b.room_id
          INNER JOIN users u
            ON u.user_id = b.user_id
          WHERE b.booking_date = ?
          ORDER BY b.start_time ASC, b.booking_id ASC
          `,
          [today]
        )
      ]);

      const { statusCounts, unknownStatuses } =
        summarizeBookingStatuses(statusRows);

      return res.json({
        success: true,
        date: today,
        summary: {
          totalRooms: Number(roomRows[0].total_rooms),
          availableRooms: Number(roomRows[0].available_rooms),
          totalUsers: Number(userRows[0].total_users),
          totalBookings: Number(bookingRows[0].total_bookings),
          todayBookingsCount: todayBookings.length
        },
        statusCounts,
        unknownStatuses,
        todayBookings
      });
    } catch (error) {
      console.error("Admin dashboard error:", error);

      return res.status(500).json({
        success: false,
        message: "ไม่สามารถโหลดข้อมูล Dashboard ได้ กรุณาตรวจสอบโครงสร้างฐานข้อมูล"
      });
    }
  }
);


/* ========================================
   ADMIN DASHBOARD ANALYTICS API
   อ่านข้อมูลจาก MySQL จริง
======================================== */

const analyticsDb = db.promise();

// สร้างเงื่อนไขช่วงวันที่
function getAnalyticsDateCondition(range) {
  switch (range) {
    case "7d":
      return {
        sql: "booking_date >= DATE_SUB(CURDATE(), INTERVAL 6 DAY) AND booking_date <= CURDATE()",
        label: "7 วันล่าสุด"
      };


    case "month":
      return {
        sql: "booking_date >= DATE_FORMAT(CURDATE(), '%Y-%m-01') AND booking_date <= CURDATE()",
        label: "เดือนนี้"
      };

    case "year":
      return {
        sql: "booking_date >= MAKEDATE(YEAR(CURDATE()), 1) AND booking_date <= CURDATE()",
        label: "ปีนี้"
      };

    default:
      return null;
  }
}

function validateAnalyticsRange(req, res) {
  const range = String(req.query.range || "7d");
  const condition = getAnalyticsDateCondition(range);

  if (!condition) {
    res.status(400).json({
      success: false,
      message: "ช่วงเวลาที่เลือกไม่ถูกต้อง กรุณาใช้ 7d, month หรือ year"
    });
    return null;
  }

  return { range, condition };
}

// 1. จำนวนการจองแยกตามสถานะ
app.get(
  "/api/admin/analytics/status",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const selected = validateAnalyticsRange(req, res);
      if (!selected) return;

      const { condition } = selected;

      const [rows] = await analyticsDb.execute(`
        SELECT
          status,
          COUNT(*) AS total
        FROM bookings
        WHERE ${condition.sql}
        GROUP BY status
      `);

      const { statusCounts, unknownStatuses } =
        summarizeBookingStatuses(rows);

      return res.json({
        success: true,
        range: selected.range,
        label: condition.label,
        total:
          Object.values(statusCounts).reduce((sum, value) => sum + value, 0) +
          unknownStatuses.reduce((sum, row) => sum + row.total, 0),
        statusCounts,
        unknownStatuses
      });
    } catch (error) {
      console.error("Admin analytics status error:", error);

      return res.status(500).json({
        success: false,
        message: "ไม่สามารถโหลดสถิติสถานะการจองได้"
      });
    }
  }
);

// 2. ห้องยอดนิยม เรียงตามจำนวนรายการจอง
app.get(
  "/api/admin/analytics/popular-rooms",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const selected = validateAnalyticsRange(req, res);
      if (!selected) return;

      const { condition } = selected;

      const [rows] = await analyticsDb.execute(`
        SELECT
          r.room_id,
          r.room_code,
          r.room_name,
          r.floor,
          COUNT(b.booking_id) AS total_bookings
        FROM bookings b
        INNER JOIN rooms r
          ON r.room_id = b.room_id
        WHERE ${condition.sql}
          AND b.status <> 'cancelled'
        GROUP BY
          r.room_id,
          r.room_code,
          r.room_name,
          r.floor
        ORDER BY total_bookings DESC, r.room_code ASC
        LIMIT 10
      `);

      return res.json({
        success: true,
        range: selected.range,
        label: condition.label,
        total: rows.length,
        rooms: rows.map(row => ({
          ...row,
          room_id: Number(row.room_id),
          floor: Number(row.floor),
          total_bookings: Number(row.total_bookings)
        }))
      });
    } catch (error) {
      console.error("Admin analytics popular rooms error:", error);

      return res.status(500).json({
        success: false,
        message: "ไม่สามารถโหลดสถิติห้องยอดนิยมได้"
      });
    }
  }
);

// 3. ช่วงเวลาที่มีการจองสูง
app.get(
  "/api/admin/analytics/peak-times",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const selected = validateAnalyticsRange(req, res);
      if (!selected) return;

      const { condition } = selected;

      const [rows] = await analyticsDb.execute(`
        SELECT
          CASE
            WHEN HOUR(start_time) < 10 THEN '08:00–10:00'
            WHEN HOUR(start_time) < 12 THEN '10:00–12:00'
            WHEN HOUR(start_time) < 14 THEN '12:00–14:00'
            WHEN HOUR(start_time) < 16 THEN '14:00–16:00'
            ELSE '16:00 เป็นต้นไป'
          END AS time_range,
          CASE
            WHEN HOUR(start_time) < 10 THEN 1
            WHEN HOUR(start_time) < 12 THEN 2
            WHEN HOUR(start_time) < 14 THEN 3
            WHEN HOUR(start_time) < 16 THEN 4
            ELSE 5
          END AS sort_order,
          COUNT(*) AS total_bookings
        FROM bookings
        WHERE ${condition.sql}
          AND status <> 'cancelled'
        GROUP BY time_range, sort_order
        ORDER BY sort_order ASC
      `);

      return res.json({
        success: true,
        range: selected.range,
        label: condition.label,
        total: rows.reduce((sum, row) => sum + Number(row.total_bookings), 0),
        peakTimes: rows.map(row => ({
          time_range: row.time_range,
          total_bookings: Number(row.total_bookings)
        }))
      });
    } catch (error) {
      console.error("Admin analytics peak times error:", error);

      return res.status(500).json({
        success: false,
        message: "ไม่สามารถโหลดสถิติช่วงเวลาการจองได้"
      });
    }
  }
);

function blockRoomImageChangesInDemo(req, res, next) {
  if (process.env.NODE_ENV !== "production") {
    return res.status(403).json({
      success: false,
      message: "Demo ไม่อนุญาตให้อัปโหลดหรือเปลี่ยนแปลงรูปภาพห้อง"
    });
  }

  next();
}


/* ========================================
   ADMIN ROOM MANAGEMENT API
======================================== */

const adminRoomDb = db.promise();
const roomImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: ROOM_IMAGE_MAX_BYTES,
    files: 1,
    fields: 0,
    parts: 1
  }
});

function validateRoomId(req, res, next) {
  if (!/^\d+$/.test(req.params.roomId)) {
    return res.status(400).json({
      success: false,
      message: "รหัสห้องไม่ถูกต้อง"
    });
  }

  const roomId = Number(req.params.roomId);

  if (!Number.isSafeInteger(roomId) || roomId < 1) {
    return res.status(400).json({
      success: false,
      message: "รหัสห้องไม่ถูกต้อง"
    });
  }

  req.roomId = roomId;
  next();
}

function parseRoomImage(req, res, next) {
  roomImageUpload.single("image")(req, res, error => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE";

      return res.status(tooLarge ? 413 : 400).json({
        success: false,
        message: tooLarge
          ? "รูปภาพต้องมีขนาดไม่เกิน 5 MB"
          : "ข้อมูลอัปโหลดรูปภาพไม่ถูกต้อง"
      });
    }

    console.error("Room image upload parsing error:", error);

    return res.status(500).json({
      success: false,
      message: "ไม่สามารถประมวลผลไฟล์รูปภาพได้"
    });
  });
}

async function getRoomImageState(roomId) {
  const connection = await adminRoomDb.getConnection();

  try {
    const [rooms] = await connection.execute(
      "SELECT * FROM rooms WHERE room_id = ?",
      [roomId]
    );

    return rooms[0] || null;
  } finally {
    connection.release();
  }
}

function destroyRoomImageConnection(connection, context) {
  if (!connection) {
    return;
  }

  try {
    connection.destroy();
  } catch (error) {
    console.error(context, error);
  }
}

async function removeGeneratedRoomImage(imageUrl) {
  const filename = getManagedRoomImageFilename(imageUrl);

  if (!filename) {
    throw new Error("Invalid generated room image path");
  }

  try {
    await fs.promises.unlink(path.join(ROOM_IMAGE_DIRECTORY, filename));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function reconcileRoomImageWrite(roomId, imageUrl, context) {
  let room;

  try {
    room = await getRoomImageState(roomId);
  } catch (error) {
    console.error(`${context} Unable to verify database state; preserving image:`, error);
    return { state: "unknown" };
  }

  if (room?.image_url === imageUrl) {
    return { state: "committed", room };
  }

  try {
    await removeGeneratedRoomImage(imageUrl);
  } catch (error) {
    console.error(`${context} Failed to remove unreferenced image:`, error);
  }

  return { state: "not_committed", room };
}

async function saveRoomImage(roomId, file, imageFormat) {
  const filename = `${crypto.randomBytes(16).toString("hex")}.${imageFormat.extension}`;
  const imageUrl = `/uploads/rooms/${filename}`;
  let connection = await adminRoomDb.getConnection();
  let transactionActive = false;
  let fileCreated = false;
  let commitAttempted = false;
  let previousImageUrl = null;

  try {
    await connection.beginTransaction();
    transactionActive = true;

    const [existingRooms] = await connection.execute(
      "SELECT room_id, image_url FROM rooms WHERE room_id = ? FOR UPDATE",
      [roomId]
    );

    if (existingRooms.length === 0) {
      await connection.rollback();
      transactionActive = false;
      return null;
    }

    previousImageUrl = existingRooms[0].image_url;

    await fs.promises.mkdir(ROOM_IMAGE_DIRECTORY, { recursive: true });
    let fileHandle;
    let fileWriteError;
    try {
      fileHandle = await fs.promises.open(
        path.join(ROOM_IMAGE_DIRECTORY, filename),
        "wx"
      );
      fileCreated = true;
      await fileHandle.writeFile(file.buffer);
    } catch (writeError) {
      fileWriteError = writeError;
      throw writeError;
    } finally {
      if (fileHandle) {
        try {
          await fileHandle.close();
        } catch (closeError) {
          if (fileWriteError) {
            console.error("Failed to close room image after write error:", closeError);
          } else {
            throw closeError;
          }
        }
      }
    }

    await connection.execute(
      `UPDATE rooms
       SET image_url = ?, updated_at = CURRENT_TIMESTAMP
       WHERE room_id = ?`,
      [imageUrl, roomId]
    );

    const [updatedRooms] = await connection.execute(
      "SELECT * FROM rooms WHERE room_id = ?",
      [roomId]
    );

    commitAttempted = true;
    await connection.commit();
    transactionActive = false;

    return {
      imageUrl,
      previousImageUrl,
      room: updatedRooms[0]
    };
  } catch (error) {
    let rollbackSucceeded = false;
    let rollbackFailed = false;

    if (transactionActive && !commitAttempted) {
      try {
        await connection.rollback();
        transactionActive = false;
        rollbackSucceeded = true;
      } catch (rollbackError) {
        console.error("Room image transaction rollback error:", rollbackError);
        rollbackFailed = true;
      }
    }

    if (commitAttempted || rollbackFailed) {
      const failedConnection = connection;
      connection = null;
      transactionActive = false;
      destroyRoomImageConnection(
        failedConnection,
        "Failed to discard uncertain room image transaction connection:"
      );
    }

    if (fileCreated) {
      if (rollbackSucceeded) {
        try {
          await removeGeneratedRoomImage(imageUrl);
        } catch (cleanupError) {
          console.error("Failed to remove uncommitted room image:", cleanupError);
        }
      } else if (commitAttempted || rollbackFailed) {
        const reconciliation = await reconcileRoomImageWrite(
          roomId,
          imageUrl,
          "Room image transaction reconciliation error:"
        );

        if (reconciliation.state === "committed") {
          return {
            imageUrl,
            previousImageUrl,
            room: reconciliation.room
          };
        }
      } else {
        console.warn(
          "Preserving room image because its database transaction outcome is unknown:",
          imageUrl
        );
      }
    }

    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function clearRoomImage(roomId) {
  let connection = await adminRoomDb.getConnection();
  let transactionActive = false;
  let commitAttempted = false;
  let previousImageUrl = null;

  try {
    await connection.beginTransaction();
    transactionActive = true;

    const [existingRooms] = await connection.execute(
      "SELECT room_id, image_url FROM rooms WHERE room_id = ? FOR UPDATE",
      [roomId]
    );

    if (existingRooms.length === 0) {
      await connection.rollback();
      transactionActive = false;
      return null;
    }

    previousImageUrl = existingRooms[0].image_url;

    await connection.execute(
      `UPDATE rooms
       SET image_url = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE room_id = ?`,
      [roomId]
    );

    const [updatedRooms] = await connection.execute(
      "SELECT * FROM rooms WHERE room_id = ?",
      [roomId]
    );

    commitAttempted = true;
    await connection.commit();
    transactionActive = false;

    return {
      previousImageUrl,
      room: updatedRooms[0]
    };
  } catch (error) {
    let rollbackFailed = false;

    if (transactionActive && !commitAttempted) {
      try {
        await connection.rollback();
        transactionActive = false;
      } catch (rollbackError) {
        console.error("Room image deletion rollback error:", rollbackError);
        rollbackFailed = true;
      }
    }

    if (commitAttempted || rollbackFailed) {
      const failedConnection = connection;
      connection = null;
      transactionActive = false;
      destroyRoomImageConnection(
        failedConnection,
        "Failed to discard uncertain room image deletion connection:"
      );

      try {
        const room = await getRoomImageState(roomId);

        if (room && room.image_url === null) {
          return {
            previousImageUrl,
            room
          };
        }
      } catch (verificationError) {
        console.error(
          "Room image deletion reconciliation error; preserving image:",
          verificationError
        );
      }
    }

    throw error;
  } finally {
    if (connection) {
      connection.release();
    }
  }
}

async function removeRoomImageIfUnused(imageUrl) {
  const filename = getManagedRoomImageFilename(imageUrl);

  if (!filename) {
    return;
  }

  const [rooms] = await adminRoomDb.execute(
    "SELECT COUNT(*) AS image_usage_count FROM rooms WHERE image_url = ?",
    [imageUrl]
  );

  if (Number(rooms[0].image_usage_count) > 0) {
    return;
  }

  try {
    await fs.promises.unlink(path.join(ROOM_IMAGE_DIRECTORY, filename));
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }
}

async function getRoomImageCleanupWarning(imageUrl, context) {
  try {
    await removeRoomImageIfUnused(imageUrl);
    return "";
  } catch (error) {
    console.error(context, error);
    return "บันทึกข้อมูลแล้ว แต่ไม่สามารถลบไฟล์รูปเดิมได้";
  }
}

// ดูรายการห้องทั้งหมด
app.get(
  "/api/admin/rooms",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const [rooms] = await adminRoomDb.execute(`
        SELECT
          room_id,
          room_code,
          floor,
          room_name,
          department,
          capacity,
          facilities,
          department_color,
          is_available,
          image_url,
          room_type,
          created_at,
          updated_at
        FROM rooms
        ORDER BY floor ASC, room_code ASC, room_id ASC
      `);

      res.json({
        success: true,
        total: rooms.length,
        rooms
      });
    } catch (error) {
      console.error("Admin get rooms error:", error);

      res.status(500).json({
        success: false,
        message: "ไม่สามารถโหลดรายการห้องได้"
      });
    }
  }
);

app.put(
  "/api/admin/rooms/:roomId/image",
  authenticateSession,
  requireAdmin,
  blockRoomImageChangesInDemo,
  validateRoomId,
  parseRoomImage,
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "กรุณาเลือกไฟล์รูปภาพ"
      });
    }

    const imageFormat = validateRoomImage(
      req.file.buffer,
      req.file.mimetype
    );

    if (!imageFormat) {
      return res.status(400).json({
        success: false,
        message: "ไฟล์ต้องเป็น JPG, PNG หรือ WebP ที่มีชนิดไฟล์ถูกต้อง"
      });
    }

    try {
      const saved = await saveRoomImage(req.roomId, req.file, imageFormat);

      if (!saved) {
        return res.status(404).json({
          success: false,
          message: "ไม่พบห้องที่ต้องการอัปโหลดรูปภาพ"
        });
      }

      const warning = await getRoomImageCleanupWarning(
        saved.previousImageUrl,
        "Room image replacement cleanup error:"
      );

      return res.json({
        success: true,
        message: "บันทึกรูปภาพห้องสำเร็จ",
        room: saved.room,
        ...(warning ? { warning } : {})
      });
    } catch (error) {
      console.error("Admin upload room image error:", error);

      return res.status(500).json({
        success: false,
        message: "ไม่สามารถบันทึกรูปภาพห้องได้"
      });
    }
  }
);

app.delete(
  "/api/admin/rooms/:roomId/image",
  authenticateSession,
  requireAdmin,
  blockRoomImageChangesInDemo,
  validateRoomId,
  async (req, res) => {
    try {
      const cleared = await clearRoomImage(req.roomId);

      if (!cleared) {
        return res.status(404).json({
          success: false,
          message: "ไม่พบห้องที่ต้องการลบรูปภาพ"
        });
      }

      const warning = await getRoomImageCleanupWarning(
        cleared.previousImageUrl,
        "Room image deletion cleanup error:"
      );

      return res.json({
        success: true,
        message: "ลบรูปภาพห้องสำเร็จ",
        room: cleared.room,
        ...(warning ? { warning } : {})
      });
    } catch (error) {
      console.error("Admin delete room image error:", error);

      return res.status(500).json({
        success: false,
        message: "ไม่สามารถลบรูปภาพห้องได้"
      });
    }
  }
);

// เพิ่มห้องใหม่
app.post(
  "/api/admin/rooms",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const {
        room_code,
        floor,
        room_name,
        department,
        capacity,
        facilities,
        department_color,
        room_type,
        is_available
      } = req.body;

      const roomCode = String(room_code || "").trim();
      const roomName = String(room_name || "").trim();
      const roomFloor = Number(floor);
      const roomCapacity = Number(capacity);

      if (!roomCode || !roomName) {
        return res.status(400).json({
          success: false,
          message: "กรุณากรอกรหัสห้องและชื่อห้อง"
        });
      }

      if (
        !Number.isInteger(roomFloor) ||
        roomFloor < 1 ||
        !Number.isInteger(roomCapacity) ||
        roomCapacity < 1
      ) {
        return res.status(400).json({
          success: false,
          message: "ชั้นและความจุต้องเป็นจำนวนเต็มที่มากกว่า 0"
        });
      }

      const [result] = await adminRoomDb.execute(
        `INSERT INTO rooms (
          room_code,
          floor,
          room_name,
          department,
          capacity,
          facilities,
          department_color,
          is_available,
          room_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          roomCode,
          roomFloor,
          roomName,
          String(department || "").trim() || null,
          roomCapacity,
          String(facilities || "").trim() || null,
          String(department_color || "").trim() || null,
          is_available === false || Number(is_available) === 0 ? 0 : 1,
          String(room_type || "").trim() || "meeting_room"
        ]
      );

      const [rows] = await adminRoomDb.execute(
        "SELECT * FROM rooms WHERE room_id = ?",
        [result.insertId]
      );

      res.status(201).json({
        success: true,
        message: "เพิ่มห้องประชุมสำเร็จ",
        room: rows[0]
      });
    } catch (error) {
      console.error("Admin create room error:", error);

      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "รหัสห้องหรือชื่อห้องนี้มีอยู่แล้ว"
        });
      }

      res.status(500).json({
        success: false,
        message: "ไม่สามารถเพิ่มห้องได้"
      });
    }
  }
);

// แก้ไขข้อมูลห้อง
app.put(
  "/api/admin/rooms/:roomId",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const roomId = Number(req.params.roomId);

      if (!Number.isInteger(roomId) || roomId < 1) {
        return res.status(400).json({
          success: false,
          message: "รหัสห้องไม่ถูกต้อง"
        });
      }

      const {
        room_code,
        floor,
        room_name,
        department,
        capacity,
        facilities,
        department_color,
        room_type,
        is_available
      } = req.body;

      const roomCode = String(room_code || "").trim();
      const roomName = String(room_name || "").trim();
      const roomFloor = Number(floor);
      const roomCapacity = Number(capacity);

      if (!roomCode || !roomName) {
        return res.status(400).json({
          success: false,
          message: "กรุณากรอกรหัสห้องและชื่อห้อง"
        });
      }

      if (
        !Number.isInteger(roomFloor) ||
        roomFloor < 1 ||
        !Number.isInteger(roomCapacity) ||
        roomCapacity < 1
      ) {
        return res.status(400).json({
          success: false,
          message: "ชั้นและความจุต้องเป็นจำนวนเต็มที่มากกว่า 0"
        });
      }

      const [result] = await adminRoomDb.execute(
        `UPDATE rooms
         SET room_code = ?,
             floor = ?,
             room_name = ?,
             department = ?,
             capacity = ?,
             facilities = ?,
             department_color = ?,
             room_type = ?,
             is_available = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE room_id = ?`,
        [
          roomCode,
          roomFloor,
          roomName,
          String(department || "").trim() || null,
          roomCapacity,
          String(facilities || "").trim() || null,
          String(department_color || "").trim() || null,
          String(room_type || "").trim() || "meeting_room",
          is_available === false || Number(is_available) === 0 ? 0 : 1,
          roomId
        ]
      );

      if (result.affectedRows === 0) {
        const [existing] = await adminRoomDb.execute(
          "SELECT room_id FROM rooms WHERE room_id = ?",
          [roomId]
        );

        if (!existing.length) {
          return res.status(404).json({
            success: false,
            message: "ไม่พบห้องที่ต้องการแก้ไข"
          });
        }
      }

      const [rows] = await adminRoomDb.execute(
        "SELECT * FROM rooms WHERE room_id = ?",
        [roomId]
      );

      res.json({
        success: true,
        message: "บันทึกข้อมูลห้องสำเร็จ",
        room: rows[0]
      });
    } catch (error) {
      console.error("Admin update room error:", error);

      if (error.code === "ER_DUP_ENTRY") {
        return res.status(409).json({
          success: false,
          message: "รหัสห้องหรือชื่อห้องนี้มีอยู่แล้ว"
        });
      }

      res.status(500).json({
        success: false,
        message: "ไม่สามารถแก้ไขข้อมูลห้องได้"
      });
    }
  }
);

// เปิดหรือปิดการใช้งานห้อง
app.patch(
  "/api/admin/rooms/:roomId/status",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const roomId = Number(req.params.roomId);
      const isAvailable = req.body.is_available;

      if (!Number.isInteger(roomId) || roomId < 1) {
        return res.status(400).json({
          success: false,
          message: "รหัสห้องไม่ถูกต้อง"
        });
      }

      if (
        typeof isAvailable !== "boolean" &&
        ![0, 1].includes(Number(isAvailable))
      ) {
        return res.status(400).json({
          success: false,
          message: "สถานะห้องไม่ถูกต้อง"
        });
      }

      const [result] = await adminRoomDb.execute(
        `UPDATE rooms
         SET is_available = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE room_id = ?`,
        [isAvailable === true || Number(isAvailable) === 1 ? 1 : 0, roomId]
      );

      if (result.affectedRows === 0) {
        const [existing] = await adminRoomDb.execute(
          "SELECT room_id FROM rooms WHERE room_id = ?",
          [roomId]
        );

        if (!existing.length) {
          return res.status(404).json({
            success: false,
            message: "ไม่พบห้องที่ต้องการเปลี่ยนสถานะ"
          });
        }
      }

      const [rows] = await adminRoomDb.execute(
        "SELECT * FROM rooms WHERE room_id = ?",
        [roomId]
      );

      res.json({
        success: true,
        message: rows[0].is_available
          ? "เปิดใช้งานห้องแล้ว"
          : "ปิดการใช้งานห้องแล้ว",
        room: rows[0]
      });
    } catch (error) {
      console.error("Admin update room status error:", error);

      res.status(500).json({
        success: false,
        message: "ไม่สามารถเปลี่ยนสถานะห้องได้"
      });
    }
  }
);



/* ========================================
   ADMIN BOOKING MANAGEMENT API
======================================== */

app.get(
  "/api/admin/bookings",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const database = db.promise();
      const { status, date, search } = req.query;
      console.log("[ADMIN BOOKINGS DEBUG]", {
      backendDate: getBangkokDate(),
      receivedDate: req.query.date || null,
      requestUrl: req.originalUrl
      });

      const conditions = [];
      const parameters = [];

      // 1. Filter date
      // เลือกวันที่แล้ว: แสดงเฉพาะวันที่เลือก รวมถึงวันที่ย้อนหลัง
      // ไม่ได้เลือกวันที่: แสดงตั้งแต่วันนี้เป็นต้นไป
      if (date) {
        const requestedDate = String(date).trim();

        if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)) {
          return res.status(400).json({
            success: false,
            message: "รูปแบบวันที่ไม่ถูกต้อง",
          });
        }

        // ตรวจสอบว่าวันที่มีอยู่จริง
        const parsedDate = new Date(`${requestedDate}T00:00:00Z`);

        if (
          Number.isNaN(parsedDate.getTime()) ||
          parsedDate.toISOString().slice(0, 10) !== requestedDate
        ) {
          return res.status(400).json({
            success: false,
            message: "วันที่ไม่ถูกต้อง",
          });
        }

        conditions.push("b.booking_date = ?");
        parameters.push(requestedDate);
      } else {
        conditions.push("b.booking_date >= ?");
        parameters.push(getBangkokDate());
      }

      // 2. Filter status
      if (status && String(status) !== "all") {
        const requestedStatus = String(status);

        if (!BOOKING_STATUSES.includes(requestedStatus)) {
          return res.status(400).json({
            success: false,
            message: "สถานะการจองไม่ถูกต้อง",
          });
        }

        conditions.push("b.status = ?");
        parameters.push(requestedStatus);
      }

      // 3. Search booking ID, user, and room
      if (search && String(search).trim()) {
        const keyword = `%${String(search).trim()}%`;

        conditions.push(`(
          CAST(b.booking_id AS CHAR) LIKE ?
          OR CAST(u.user_id AS CHAR) LIKE ?
          OR COALESCE(u.username, '') LIKE ?
          OR COALESCE(u.tu_id, '') LIKE ?
          OR COALESCE(u.email, '') LIKE ?
          OR COALESCE(u.name, '') LIKE ?
          OR COALESCE(u.displayname_th, '') LIKE ?
          OR COALESCE(r.room_code, '') LIKE ?
          OR COALESCE(r.room_name, '') LIKE ?
        )`);

        parameters.push(
          keyword,
          keyword,
          keyword,
          keyword,
          keyword,
          keyword,
          keyword,
          keyword,
          keyword
        );
      }

      const whereClause = `WHERE ${conditions.join(" AND ")}`;
      const [bookings] = await database.execute(
        `
          SELECT
            b.booking_id,
            b.user_id,
            b.room_id,
            b.booking_date,
            b.start_time,
            b.end_time,
            b.purpose,
            b.status,
            b.created_at,
            r.room_code,
            r.room_name,
            u.username,
            u.tu_id,
            u.email,
            u.name,
            u.displayname_th,
            COALESCE(
              NULLIF(u.displayname_th, ''),
              NULLIF(u.name, ''),
              NULLIF(u.username, ''),
              u.tu_id,
              CONCAT('User #', b.user_id)
            ) AS user_name
          FROM bookings b
          LEFT JOIN rooms r
            ON r.room_id = b.room_id
          LEFT JOIN users u
            ON u.user_id = b.user_id
          ${whereClause}
          ORDER BY
            b.booking_date ASC,
            b.start_time ASC,
            CASE b.status
              WHEN 'reserved' THEN 1
              WHEN 'checked_in' THEN 2
              WHEN 'completed' THEN 3
              WHEN 'cancelled' THEN 4
              WHEN 'no_show' THEN 5
              ELSE 6
            END ASC,
            b.booking_id ASC
        `,
        parameters
      );

      return res.json({
        success: true,
        total: bookings.length,
        bookings,
      });
    } catch (error) {
      console.error("Admin get bookings error:", error);

      return res.status(500).json({
        success: false,
        message:
          "ไม่สามารถโหลดรายการจองได้ กรุณาตรวจสอบโครงสร้างฐานข้อมูล",
      });
    }
  }
);




// ========================================
// USER ROOMS AND BOOKING API
// ========================================
app.use("/api", createBookingRouter({
  authenticateSession,
  findUserById,
  findRooms,
  findBookingsByDate,
  findBookingsByUser,
  getRoomReview,
  getRoomReviewsByRoom,
  submitRoomReview,
  getMonthlyBookingQuota,
  createBooking,
  checkInBooking,
  cancelBooking,
  getBangkokDate
}));

// ========================================
// ADMIN ACCOUNT MANAGEMENT API
// ========================================

const adminAccountDb = db.promise();

// ดึงบัญชีผู้ใช้ทั้งหมด
app.get(
  "/api/admin/users",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const [users] = await adminAccountDb.execute(`
        SELECT
          user_id,
          tu_id,
          username,
          name,
          displayname_th,
          email,
          faculty,
          major,
          role,
          access_level,
          no_show_count,
          suspended_until
        FROM users
        ORDER BY
          CASE role
            WHEN 'student' THEN 1
            WHEN 'teacher' THEN 2
            WHEN 'admin' THEN 3
            ELSE 4
          END,
          user_id DESC
      `);

      return res.json({
        success: true,
        total: users.length,
        users
      });
    } catch (error) {
      console.error("Admin get users error:", error);

      return res.status(500).json({
        success: false,
        message: "ไม่สามารถโหลดบัญชีผู้ใช้ได้"
      });
    }
  }
);

// ดูประวัติการจองของผู้ใช้
app.get(
  "/api/admin/users/:userId/bookings",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const userId = Number(req.params.userId);

      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({
          success: false,
          message: "รหัสผู้ใช้ไม่ถูกต้อง"
        });
      }

      const [users] = await adminAccountDb.execute(
        "SELECT user_id FROM users WHERE user_id = ? LIMIT 1",
        [userId]
      );

      if (!users.length) {
        return res.status(404).json({
          success: false,
          message: "ไม่พบบัญชีผู้ใช้"
        });
      }

      const [bookings] = await adminAccountDb.execute(
        `
        SELECT
          b.booking_id,
          b.user_id,
          b.room_id,
          b.booking_date,
          b.start_time,
          b.end_time,
          b.status,
          b.purpose,
          r.room_code,
          r.room_name
        FROM bookings b
        LEFT JOIN rooms r ON r.room_id = b.room_id
        WHERE b.user_id = ?
        ORDER BY
          b.booking_date DESC,
          b.start_time DESC,
          b.booking_id DESC
        `,
        [userId]
      );

      return res.json({
        success: true,
        total: bookings.length,
        bookings
      });
    } catch (error) {
      console.error("Admin user booking history error:", error);

      return res.status(500).json({
        success: false,
        message: "ไม่สามารถโหลดประวัติการจองได้"
      });
    }
  }
);

// ระงับบัญชี 30 วัน หรือปลดระงับ
app.patch(
  "/api/admin/users/:userId/suspension",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const userId = Number(req.params.userId);
      const action = String(req.body.action || "")
        .trim()
        .toLowerCase();

      if (!Number.isInteger(userId) || userId <= 0) {
        return res.status(400).json({
          success: false,
          message: "รหัสผู้ใช้ไม่ถูกต้อง"
        });
      }

      if (!["suspend", "unsuspend"].includes(action)) {
        return res.status(400).json({
          success: false,
          message: "คำสั่งไม่ถูกต้อง"
        });
      }

      const [users] = await adminAccountDb.execute(
        `
        SELECT user_id, role, access_level
        FROM users
        WHERE user_id = ?
        LIMIT 1
        `,
        [userId]
      );

      if (!users.length) {
        return res.status(404).json({
          success: false,
          message: "ไม่พบบัญชีผู้ใช้"
        });
      }

      const targetUser = users[0];

      if (
        targetUser.role === "admin" ||
        targetUser.access_level === "admin"
      ) {
        return res.status(403).json({
          success: false,
          message: "ไม่อนุญาตให้ระงับบัญชีผู้ดูแลระบบ"
        });
      }

      if (action === "suspend") {
        const suspendedAt = getBangkokDateTime();

        await adminAccountDb.execute(
          `
          UPDATE users
          SET suspended_until = DATE_ADD(?, INTERVAL 14 DAY)
          WHERE user_id = ?
          `,
          [suspendedAt, userId]
        );
      } else {
        await adminAccountDb.execute(
          `
          UPDATE users
          SET suspended_until = NULL
          WHERE user_id = ?
          `,
          [userId]
        );
      }

      const [updatedUsers] = await adminAccountDb.execute(
        "SELECT suspended_until FROM users WHERE user_id = ? LIMIT 1",
        [userId]
      );

      return res.json({
        success: true,
        message:
          action === "suspend"
            ? "บันทึกการระงับบัญชีเป็นเวลา 14 วันแล้ว"
            : "ปลดระงับบัญชีแล้ว",
        suspended_until: updatedUsers[0]?.suspended_until || null
      });
    } catch (error) {
      console.error("Admin account suspension error:", error);

      return res.status(500).json({
        success: false,
        message: "ไม่สามารถเปลี่ยนสถานะบัญชีได้"
      });
    }
  }
);

// ========================================
// SYSTEM REVIEW, COMPLAINT & REPAIR API
// ========================================
app.use("/api", createFeedbackRouter({
  pool: db.promise(),
  authenticateSession,
  requireAdmin,
  findUserById
}));

// ========================================
// START SERVER
// ========================================
async function startServer() {
  try {
    await new Promise((resolve, reject) => {
      db.getConnection((error, connection) => {
        if (error) {
          return reject(error);
        }

        connection.release();
        resolve();
      });
    });

    await updateBookingStatuses();

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
      console.log(`Health check: http://localhost:${PORT}/health`);

      setInterval(() => {
        updateBookingStatuses().catch(error => {
          console.error("Booking status update error:", error.message);
        });
      }, 60 * 1000);
    });
  } catch (error) {
    console.error("Could not start backend:", error.message);
    process.exit(1);
  }
}

// ========================================
// 404 — ต้องอยู่หลัง API ทุกตัว
// ========================================
app.use((req, res) => {
  return res.status(404).json({
    success: false,
    message: "API endpoint not found"
  });
});

startServer();
