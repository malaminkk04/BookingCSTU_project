
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");

const {
  db,
  upsertUser,
  getUserById,
  addBooking,
  getBookingsByUser,
  getBookingsByDate,
  getRooms,
  deleteBooking,
  checkInBooking,
  updateBookingStatuses
} = require("./db");

const app = express();
const PORT = Number(process.env.PORT || 5001);

const TU_AUTH_URL = "https://restapi.tu.ac.th/api/v1/auth/Ad/verify";

const DEMO_TEACHER_USERNAME = "teacher_demo";
const DEMO_TEACHER_PASSWORD = "TeacherDemo123!";

const DEMO_ADMIN_USERNAME = "admin_demo";
const DEMO_ADMIN_PASSWORD = "AdminDemo123!";

const sessions = new Map();

app.use(cors());
app.use(express.json());

function isDevelopment() {
  return process.env.NODE_ENV !== "production";
}

function isAllowedFaculty(faculty) {
  const normalized = String(faculty || "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();

  return (
    normalized === "คณะวิทยาศาสตร์และเทคโนโลยี" ||
    normalized === "facultyofscienceandtechnology"
  );
}

function getUserIdentifier(body = {}) {
  return String(
    body.identifier ||
    body.username ||
    body.tu_id ||
    body.usernameOrEmail ||
    ""
  ).trim();
}

function getUserRole(accountType) {
  const type = String(accountType || "").trim().toLowerCase();
  return type === "student" ? "student" : "teacher";
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

function getSession(req) {
  const authorization = String(req.headers.authorization || "");
  const match = authorization.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return null;
  }

  const token = match[1].trim();
  const session = sessions.get(token);

  if (!session) {
    return null;
  }

  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }

  return session;
}

function authenticateSession(req, res, next) {
  const session = getSession(req);

  if (!session) {
    return res.status(401).json({
      success: false,
      message: "กรุณาเข้าสู่ระบบใหม่"
    });
  }

  req.session = session;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session || req.session.accessLevel !== "admin") {
    return res.status(403).json({
      success: false,
      message: "คุณไม่มีสิทธิ์เข้าถึงส่วนผู้ดูแลระบบ"
    });
  }

  next();
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

  return data;
}

function sendLoginSuccess(res, user) {
  const token = createToken(user);

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

    const normalizedIdentifier = identifier.toLowerCase();

    // Demo Admin: development only
    if (
      isDevelopment() &&
      normalizedIdentifier === DEMO_ADMIN_USERNAME.toLowerCase()
    ) {
      if (password !== DEMO_ADMIN_PASSWORD) {
        return res.status(401).json({
          success: false,
          message: "Invalid demo admin password"
        });
      }

      const adminDb = db.promise();

      await adminDb.execute(
        `INSERT INTO users (
          tu_id,
          name,
          email,
          username,
          displayname_th,
          faculty,
          major,
          role,
          access_level
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, 'admin', 'admin')
        ON DUPLICATE KEY UPDATE
          name = VALUES(name),
          email = VALUES(email),
          username = VALUES(username),
          displayname_th = VALUES(displayname_th),
          faculty = VALUES(faculty),
          major = VALUES(major),
          role = 'admin',
          access_level = 'admin'`,
        [
          "ADMINDEMO001",
          "ผู้ดูแลระบบตัวอย่าง",
          "admin.demo@example.com",
          DEMO_ADMIN_USERNAME,
          "ผู้ดูแลระบบตัวอย่าง",
          "คณะวิทยาศาสตร์และเทคโนโลยี",
          "Computer Science"
        ]
      );

      const [rows] = await adminDb.execute(
        `SELECT *
         FROM users
         WHERE tu_id = ?
         LIMIT 1`,
        ["ADMINDEMO001"]
      );

      if (!rows.length) {
        throw new Error("Unable to create or load demo admin");
      }

      return sendLoginSuccess(res, {
        ...rows[0],
        role: "admin",
        access_level: "admin"
      });
    }

    // Demo Teacher: development only
    if (
      isDevelopment() &&
      normalizedIdentifier === DEMO_TEACHER_USERNAME.toLowerCase()
    ) {
      if (password !== DEMO_TEACHER_PASSWORD) {
        return res.status(401).json({
          success: false,
          message: "Invalid demo teacher password"
        });
      }

      const teacherData = {
        username: DEMO_TEACHER_USERNAME,
        tu_id: "TEACHER001",
        email: "teacher.demo@example.com",
        displayname_th: "อาจารย์ตัวอย่าง",
        faculty: "คณะวิทยาศาสตร์และเทคโนโลยี",
        major: "Computer Science",
        role: "teacher"
      };

      const savedUser = await saveUser(teacherData);

      return sendLoginSuccess(res, {
        ...savedUser,
        username: teacherData.username,
        tu_id: teacherData.tu_id,
        email: teacherData.email,
        name: teacherData.displayname_th,
        displayname_th: teacherData.displayname_th,
        faculty: teacherData.faculty,
        major: teacherData.major,
        role: teacherData.role,
        access_level: savedUser.access_level || "user"
      });
    }

    const loginIdentifier = await resolveLoginIdentifier(identifier);
    const data = await verifyWithTuApi(loginIdentifier, password);

    const faculty =
      data.faculty ||
      data.Faculty ||
      data.faculty_name ||
      data.facultyName ||
      "";

    if (!isAllowedFaculty(faculty)) {
      return res.status(403).json({
        success: false,
        message: "อนุญาตเฉพาะผู้ใช้คณะวิทยาศาสตร์และเทคโนโลยี"
      });
    }

    const username = String(
      data.username ||
      data.username_en ||
      data.username_th ||
      loginIdentifier
    ).trim();

    const tuId = String(
      data.id ||
      data.tu_id ||
      data.username ||
      loginIdentifier
    ).trim();

    const accountType =
      data.type ||
      data.account_type ||
      data.accountType ||
      data.user_type ||
      data.userType ||
      data.status ||
      "";

    const role = getUserRole(accountType);

    const userData = {
      username,
      tu_id: tuId,
      email: data.email || data.email_address || null,
      displayname_th:
        data.displayname_th ||
        data.displayname ||
        data.name_th ||
        data.name ||
        username,
      faculty,
      major:
        data.department ||
        data.department_name ||
        data.major ||
        null,
      role
    };

    const savedUser = await saveUser(userData);

    return sendLoginSuccess(res, {
      ...savedUser,
      username: userData.username,
      tu_id: userData.tu_id,
      email: userData.email || savedUser.email,
      name: userData.displayname_th,
      displayname_th: userData.displayname_th,
      faculty: userData.faculty,
      major: userData.major,
      role: userData.role,
      access_level: savedUser.access_level || "user"
    });
  } catch (error) {
    console.error("Login error:", error.message);

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

      const statusCounts = {
        reserved: 0,
        checked_in: 0,
        completed: 0,
        cancelled: 0,
        no_show: 0
      };

      for (const row of statusRows) {
        if (
          Object.prototype.hasOwnProperty.call(
            statusCounts,
            row.status
          )
        ) {
          statusCounts[row.status] = Number(row.total);
        }
      }

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

      const statusCounts = {
        reserved: 0,
        confirmed: 0,
        checked_in: 0,
        completed: 0,
        cancelled: 0,
        no_show: 0
      };

      for (const row of rows) {
        if (Object.prototype.hasOwnProperty.call(statusCounts, row.status)) {
          statusCounts[row.status] = Number(row.total);
        }
      }

      return res.json({
        success: true,
        range: selected.range,
        label: condition.label,
        total: Object.values(statusCounts).reduce((sum, value) => sum + value, 0),
        statusCounts
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


/* ========================================
   ADMIN ROOM MANAGEMENT API
======================================== */

const adminRoomDb = db.promise();

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

      const allowedStatuses = [
        "reserved",
        "checked_in",
        "completed",
        "cancelled",
        "no_show",
      ];

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

        if (!allowedStatuses.includes(requestedStatus)) {
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
// USER ROOMS API
// ========================================
app.get("/api/rooms", async (req, res) => {
  try {
    const userId = String(req.headers["x-user-id"] || "");

    if (!/^\d+$/.test(userId)) {
      return res.status(401).json({
        success: false,
        message: "Missing or invalid user ID"
      });
    }

    const user = await findUserById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found. Please log in again."
      });
    }

    const role = String(user.role || "").toLowerCase();

    if (!["student", "teacher"].includes(role)) {
      return res.status(403).json({
        success: false,
        message: "Invalid user role"
      });
    }

    const requestedDate = String(req.query.date || "");
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;

    const date = datePattern.test(requestedDate)
      ? requestedDate
      : getBangkokDate();

    const [rooms, bookings] = await Promise.all([
      findRooms(role),
      findBookingsByDate(date)
    ]);

    const formattedRooms = rooms.map(room => {
      const roomCode = String(room.room_code || "").toLowerCase();
      const roomName = String(room.room_name || "").toLowerCase();

      const roomBookings = bookings.filter(booking => {
        if (Number(booking.room_id) === Number(room.room_id)) {
          return true;
        }

        const bookingRoom = String(booking.room || "").toLowerCase();

        return bookingRoom === roomCode || bookingRoom === roomName;
      });

      return {
        ...room,
        id: room.room_id,
        room_id: room.room_id,
        room_code: room.room_code,
        room_name: room.room_name,
        floor: room.floor,
        capacity: room.capacity,
        facilities: room.facilities,
        room_type: room.room_type,
        is_available: room.is_available,
        bookings: roomBookings
      };
    });

    return res.json({
      success: true,
      date,
      role,
      total: formattedRooms.length,
      rooms: formattedRooms
    });
  } catch (error) {
    console.error("Get rooms error:", error.message);

    return res.status(500).json({
      success: false,
      message: "ไม่สามารถโหลดข้อมูลห้องได้"
    });
  }
});

// ========================================
// CREATE BOOKING
// ========================================
app.post("/api/bookings", async (req, res) => {
  try {
    const headerUserId = req.headers["x-user-id"];
    const bodyUserId = req.body.user_id;

    if (!headerUserId || !/^\d+$/.test(String(headerUserId))) {
      return res.status(401).json({
        success: false,
        message: "กรุณาเข้าสู่ระบบใหม่"
      });
    }

    const userId = String(headerUserId);

    if (bodyUserId && String(bodyUserId) !== userId) {
      return res.status(403).json({
        success: false,
        message: "User ID mismatch"
      });
    }

    const user = await findUserById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found"
      });
    }

    const { room, date, start_time, end_time, purpose } = req.body;

    if (!room || !date || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: "Please provide room, date, start time and end time"
      });
    }

    const result = await createBooking({
      user_id: Number(userId),
      room,
      date,
      start_time,
      end_time,
      purpose
    });

    return res.status(201).json({
      success: true,
      message: "Booking created successfully",
      booking_id: result.booking_id || result,
      status: "reserved"
    });
  } catch (error) {
    console.error("Create booking error:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message || "ไม่สามารถจองห้องได้"
    });
  }
});

// ========================================
// GET USER BOOKINGS
// ========================================
app.get("/api/bookings/:userId", async (req, res) => {
  try {
    const requestedUserId = String(req.params.userId);
    const headerUserId = String(req.headers["x-user-id"] || "");

    if (!/^\d+$/.test(requestedUserId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid user ID"
      });
    }

    if (!/^\d+$/.test(headerUserId)) {
      return res.status(401).json({
        success: false,
        message: "กรุณาเข้าสู่ระบบใหม่"
      });
    }

    if (headerUserId !== requestedUserId) {
      return res.status(403).json({
        success: false,
        message: "User ID mismatch"
      });
    }

    const user = await findUserById(requestedUserId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const bookings = await findBookingsByUser(requestedUserId);

    return res.json({
      success: true,
      bookings
    });
  } catch (error) {
    console.error("Get user bookings error:", error.message);

    return res.status(500).json({
      success: false,
      message: "ไม่สามารถโหลดรายการจองได้"
    });
  }
});

// ========================================
// CHECK IN
// ========================================
app.post("/api/bookings/:bookingId/check-in", async (req, res) => {
  try {
    const bookingId = String(req.params.bookingId);
    const userId = String(req.headers["x-user-id"] || "");

    if (!/^\d+$/.test(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "รหัสรายการจองไม่ถูกต้อง"
      });
    }

    if (!/^\d+$/.test(userId)) {
      return res.status(401).json({
        success: false,
        message: "กรุณาเข้าสู่ระบบใหม่"
      });
    }

    const user = await findUserById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "ไม่พบบัญชีผู้ใช้งาน"
      });
    }

    await checkInBooking(Number(bookingId), Number(userId));

    return res.json({
      success: true,
      message: "เช็กอินสำเร็จ",
      status: "checked_in"
    });
  } catch (error) {
    console.error("Check-in error:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message || "ไม่สามารถเช็กอินได้"
    });
  }
});

// ========================================
// CANCEL BOOKING
// ========================================
app.delete("/api/bookings/:bookingId", async (req, res) => {
  try {
    const bookingId = String(req.params.bookingId);
    const userId = String(req.headers["x-user-id"] || "");

    if (!/^\d+$/.test(bookingId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid booking ID"
      });
    }

    if (!/^\d+$/.test(userId)) {
      return res.status(401).json({
        success: false,
        message: "กรุณาเข้าสู่ระบบใหม่"
      });
    }

    const user = await findUserById(userId);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "ไม่พบบัญชีผู้ใช้งาน"
      });
    }

    const result = await cancelBooking(
      Number(bookingId),
      Number(userId)
    );

    if (!result) {
      return res.status(400).json({
        success: false,
        message: "ไม่สามารถยกเลิกรายการจองนี้ได้"
      });
    }

    return res.json({
      success: true,
      message: "Booking cancelled successfully",
      status: "cancelled"
    });
  } catch (error) {
    console.error("Cancel booking error:", error.message);

    return res.status(400).json({
      success: false,
      message: error.message || "ไม่สามารถยกเลิกการจองได้"
    });
  }
});

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
        await adminAccountDb.execute(
          `
          UPDATE users
          SET suspended_until = DATE_ADD(NOW(), INTERVAL 30 DAY)
          WHERE user_id = ?
          `,
          [userId]
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
            ? "บันทึกการระงับบัญชีเป็นเวลา 30 วันแล้ว"
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

// =====================================================
// ADMIN SUPPORT API
// Complaints / Room Reviews / Repair Reports
// วางก่อน app.use ที่ตอบ API endpoint not found
// =====================================================

// 1. GET รายการร้องเรียน
app.get(
  "/api/admin/complaints",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const [rows] = await db.promise().execute(`
        SELECT
          c.complaint_id AS id,
          c.complaint_id,
          c.subject,
          c.description,
          c.status,
          c.created_at,
          u.name AS reporter_name,
          r.room_name
        FROM complaints c
        LEFT JOIN users u ON c.user_id = u.user_id
        LEFT JOIN rooms r ON c.room_id = r.room_id
        ORDER BY c.created_at DESC
      `);

      return res.json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error("GET admin complaints error:", error);
      return res.status(500).json({
        success: false,
        message: "ไม่สามารถโหลดรายการร้องเรียนได้",
      });
    }
  }
);

// 2. PATCH เปลี่ยนสถานะเรื่องร้องเรียน
app.patch(
  "/api/admin/complaints/:id/status",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;

      const allowedStatuses = [
        "รอดำเนินการ",
        "กำลังตรวจสอบ",
        "ดำเนินการแล้ว",
        "ปิดเรื่อง",
      ];

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: "รหัสเรื่องร้องเรียนไม่ถูกต้อง",
        });
      }

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "สถานะเรื่องร้องเรียนไม่ถูกต้อง",
        });
      }

      const [result] = await db.promise().execute(
        "UPDATE complaints SET status = ? WHERE complaint_id = ?",
        [status, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "ไม่พบเรื่องร้องเรียน",
        });
      }

      return res.json({
        success: true,
        message: "อัปเดตสถานะเรื่องร้องเรียนสำเร็จ",
      });
    } catch (error) {
      console.error("PATCH complaint status error:", error);
      return res.status(500).json({
        success: false,
        message: "ไม่สามารถอัปเดตสถานะเรื่องร้องเรียนได้",
      });
    }
  }
);

// 3. GET รีวิวห้องจากตาราง reviews ที่มีอยู่จริง
app.get(
  "/api/admin/reviews",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const [rows] = await db.promise().execute(`
        SELECT
          rv.review_id AS id,
          rv.review_id,
          rv.rating,
          rv.comment,
          rv.status,
          rv.created_at,
          u.name AS reviewer_name,
          r.room_name
        FROM reviews rv
        LEFT JOIN users u ON rv.user_id = u.user_id
        LEFT JOIN bookings b ON rv.booking_id = b.booking_id
        LEFT JOIN rooms r ON b.room_id = r.room_id
        ORDER BY rv.created_at DESC
      `);

      return res.json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error("GET admin reviews error:", error);
      return res.status(500).json({
        success: false,
        message: "ไม่สามารถโหลดรีวิวห้องได้",
      });
    }
  }
);

// 4. PATCH เปลี่ยนสถานะรีวิว: แสดงผล / ซ่อนรีวิว
app.patch(
  "/api/admin/reviews/:id/status",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;

      const allowedStatuses = ["แสดงผล", "ซ่อนรีวิว"];

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: "รหัสรีวิวไม่ถูกต้อง",
        });
      }

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "สถานะรีวิวไม่ถูกต้อง",
        });
      }

      const [result] = await db.promise().execute(
        "UPDATE reviews SET status = ? WHERE review_id = ?",
        [status, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "ไม่พบรีวิว",
        });
      }

      return res.json({
        success: true,
        message: "อัปเดตสถานะรีวิวสำเร็จ",
      });
    } catch (error) {
      console.error("PATCH review status error:", error);
      return res.status(500).json({
        success: false,
        message: "ไม่สามารถอัปเดตสถานะรีวิวได้",
      });
    }
  }
);

// 5. GET รายการแจ้งซ่อม
app.get(
  "/api/admin/repairs",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const [rows] = await db.promise().execute(`
        SELECT
          rp.repair_id AS id,
          rp.repair_id,
          rp.subject,
          rp.description,
          rp.status,
          rp.created_at,
          u.name AS reporter_name,
          r.room_name
        FROM repair_reports rp
        LEFT JOIN users u ON rp.user_id = u.user_id
        LEFT JOIN rooms r ON rp.room_id = r.room_id
        ORDER BY rp.created_at DESC
      `);

      return res.json({
        success: true,
        data: rows,
      });
    } catch (error) {
      console.error("GET admin repairs error:", error);
      return res.status(500).json({
        success: false,
        message: "ไม่สามารถโหลดรายการแจ้งซ่อมได้",
      });
    }
  }
);

// 6. PATCH เปลี่ยนสถานะรายการแจ้งซ่อม
app.patch(
  "/api/admin/repairs/:id/status",
  authenticateSession,
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);
      const { status } = req.body;

      const allowedStatuses = [
        "รอดำเนินการ",
        "กำลังซ่อม",
        "ซ่อมเสร็จ",
        "ยกเลิก",
      ];

      if (!Number.isInteger(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: "รหัสรายการแจ้งซ่อมไม่ถูกต้อง",
        });
      }

      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          message: "สถานะรายการแจ้งซ่อมไม่ถูกต้อง",
        });
      }

      const [result] = await db.promise().execute(
        "UPDATE repair_reports SET status = ? WHERE repair_id = ?",
        [status, id]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          success: false,
          message: "ไม่พบรายการแจ้งซ่อม",
        });
      }

      return res.json({
        success: true,
        message: "อัปเดตสถานะรายการแจ้งซ่อมสำเร็จ",
      });
    } catch (error) {
      console.error("PATCH repair status error:", error);
      return res.status(500).json({
        success: false,
        message: "ไม่สามารถอัปเดตสถานะรายการแจ้งซ่อมได้",
      });
    }
  }
);

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

      if (isDevelopment()) {
        console.log("Development mode enabled");
        console.log(`Demo teacher username: ${DEMO_TEACHER_USERNAME}`);
        console.log(`Demo admin username: ${DEMO_ADMIN_USERNAME}`);
      }

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
