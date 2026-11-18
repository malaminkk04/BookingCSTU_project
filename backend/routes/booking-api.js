const express = require("express");
const { isValidDate } = require("../utils/booking-rules");

function getSessionUserId(req) {
  const userId = Number(req.session?.userId);

  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

function createBookingRouter({
  authenticateSession,
  findUserById,
  findRooms,
  findBookingsByDate,
  findBookingsByUser,
  getMonthlyBookingQuota,
  createBooking,
  checkInBooking,
  cancelBooking,
  getBangkokDate,
  getRoomReview,
  getRoomReviewsByRoom,
  submitRoomReview
}) {
  const router = express.Router();

  router.use(["/rooms", "/bookings"], authenticateSession);

  router.get("/rooms", async (req, res) => {
    try {
      const userId = getSessionUserId(req);

      if (userId === null) {
        return res.status(401).json({
          success: false,
          message: "กรุณาเข้าสู่ระบบใหม่"
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
      if (requestedDate && !isValidDate(requestedDate)) {
        return res.status(400).json({
          success: false,
          message: "วันที่ไม่ถูกต้อง"
        });
      }
      const date = requestedDate || getBangkokDate();
      const [rooms, bookings] = await Promise.all([
        findRooms(role),
        findBookingsByDate(date)
      ]);

      const formattedRooms = rooms.map((room) => {
        const roomCode = String(room.room_code || "").toLowerCase();
        const roomName = String(room.room_name || "").toLowerCase();
        const roomBookings = bookings.filter((booking) => {
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
          bookings: roomBookings.map(({ start_time, end_time }) => ({
            start_time,
            end_time
          }))
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

  router.get("/rooms/:roomId/reviews", async (req, res) => {
    try {
      const roomId = String(req.params.roomId);
      if (!/^\d+$/.test(roomId) || Number(roomId) <= 0) {
        return res.status(400).json({ success: false, message: "รหัสห้องไม่ถูกต้อง" });
      }
      const data = await getRoomReviewsByRoom(Number(roomId));
      if (!data) return res.status(404).json({ success: false, message: "ไม่พบห้อง" });
      return res.json({ success: true, ...data });
    } catch (error) {
      console.error("Get room reviews error:", error.message);
      return res.status(500).json({ success: false, message: "ไม่สามารถโหลดรีวิวของห้องได้" });
    }
  });

  router.get("/bookings/quota", async (req, res) => {
    try {
      const userId = getSessionUserId(req);
      if (userId === null) {
        return res.status(401).json({
          success: false,
          message: "กรุณาเข้าสู่ระบบใหม่"
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
      if (requestedDate && !isValidDate(requestedDate)) {
        return res.status(400).json({
          success: false,
          message: "วันที่ไม่ถูกต้อง"
        });
      }
      const date = requestedDate || getBangkokDate();
      const quota = await getMonthlyBookingQuota(userId, date);
      return res.json({ success: true, quota });
    } catch (error) {
      console.error("Get booking quota error:", error.message);
      return res.status(500).json({
        success: false,
        message: "ไม่สามารถโหลดโควตาการจองได้"
      });
    }
  });

  router.post("/bookings", async (req, res) => {
    try {
      const userId = getSessionUserId(req);

      if (userId === null) {
        return res.status(401).json({
          success: false,
          message: "กรุณาเข้าสู่ระบบใหม่"
        });
      }

      const user = await findUserById(userId);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found"
        });
      }

      const { room, date, start_time, end_time, purpose } = req.body || {};

      if (!room || !date || !start_time || !end_time) {
        return res.status(400).json({
          success: false,
          message: "Please provide room, date, start time and end time"
        });
      }

      const result = await createBooking({
        user_id: userId,
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
        quota: result.quota || null,
        status: "reserved"
      });
        } catch (error) {
      console.error("Create booking error:", error.message);

      if (error.code === "ACCOUNT_SUSPENDED") {
        return res.status(403).json({
          success: false,
          code: "ACCOUNT_SUSPENDED",
          message: error.message
        });
      }

      return res.status(400).json({
        success: false,
        message: error.message || "ไม่สามารถจองห้องได้"
      });
    }
  });

  router.get("/bookings/:bookingId/review", async (req, res) => {
    try {
      const userId = getSessionUserId(req);
      const bookingId = String(req.params.bookingId);
      if (userId === null) {
        return res.status(401).json({ success: false, message: "กรุณาเข้าสู่ระบบใหม่" });
      }
      if (!/^\d+$/.test(bookingId) || Number(bookingId) <= 0) {
        return res.status(400).json({ success: false, message: "รหัสรายการจองไม่ถูกต้อง" });
      }
      const user = await findUserById(userId);
      if (!user) return res.status(401).json({ success: false, message: "ไม่พบบัญชีผู้ใช้งาน" });
      const result = await getRoomReview(Number(bookingId), userId);
      if (!result) return res.status(404).json({ success: false, message: "ไม่พบรายการจองของผู้ใช้นี้" });
      return res.json({ success: true, ...result });
    } catch (error) {
      console.error("Get room review error:", error.message);
      return res.status(500).json({ success: false, message: "ไม่สามารถโหลดสถานะรีวิวได้" });
    }
  });

  router.post("/bookings/:bookingId/review", async (req, res) => {
    try {
      const userId = getSessionUserId(req);
      const bookingId = String(req.params.bookingId);
      if (userId === null) {
        return res.status(401).json({ success: false, message: "กรุณาเข้าสู่ระบบใหม่" });
      }
      if (!/^\d+$/.test(bookingId) || Number(bookingId) <= 0) {
        return res.status(400).json({ success: false, message: "รหัสรายการจองไม่ถูกต้อง" });
      }
      const user = await findUserById(userId);
      if (!user) return res.status(401).json({ success: false, message: "ไม่พบบัญชีผู้ใช้งาน" });
      const rating = req.body?.rating;
      const comment = typeof req.body?.comment === "string" ? req.body.comment.trim() : "";
      if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ success: false, message: "คะแนนรีวิวต้องอยู่ระหว่าง 1 ถึง 5" });
      }
      if (!comment || comment.length > 1000) {
        return res.status(400).json({ success: false, message: "กรุณากรอกความคิดเห็นไม่เกิน 1,000 ตัวอักษร" });
      }
      const review = await submitRoomReview(Number(bookingId), userId, rating, comment);
      return res.status(201).json({ success: true, review });
    } catch (error) {
      console.error("Submit room review error:", error.message);
      return res.status(error.statusCode || 500).json({
        success: false,
        message: error.statusCode ? error.message : "ไม่สามารถส่งรีวิวได้"
      });
    }
  });

  router.get("/bookings/:userId", async (req, res) => {
    try {
      const userId = getSessionUserId(req);

      if (userId === null) {
        return res.status(401).json({
          success: false,
          message: "กรุณาเข้าสู่ระบบใหม่"
        });
      }

      if (!/^\d+$/.test(String(req.params.userId))) {
        return res.status(400).json({
          success: false,
          message: "Invalid user ID"
        });
      }

      if (String(userId) !== String(req.params.userId)) {
        return res.status(403).json({
          success: false,
          message: "User ID mismatch"
        });
      }

      const user = await findUserById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: "User not found"
        });
      }

      const bookings = await findBookingsByUser(userId);

      return res.json({
        success: true,
        bookings,
        account: {
          no_show_count: Number(user.no_show_count || 0),
          suspended_until: user.suspended_until || null
        }
      });
    } catch (error) {
      console.error("Get user bookings error:", error.message);

      return res.status(500).json({
        success: false,
        message: "ไม่สามารถโหลดรายการจองได้"
      });
    }
  });

  router.post("/bookings/:bookingId/check-in", async (req, res) => {
    try {
      const userId = getSessionUserId(req);
      const bookingId = String(req.params.bookingId);

      if (userId === null) {
        return res.status(401).json({
          success: false,
          message: "กรุณาเข้าสู่ระบบใหม่"
        });
      }

      if (!/^\d+$/.test(bookingId)) {
        return res.status(400).json({
          success: false,
          message: "รหัสรายการจองไม่ถูกต้อง"
        });
      }

      const user = await findUserById(userId);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "ไม่พบบัญชีผู้ใช้งาน"
        });
      }

      await checkInBooking(Number(bookingId), userId);

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

  router.delete("/bookings/:bookingId", async (req, res) => {
    try {
      const userId = getSessionUserId(req);
      const bookingId = String(req.params.bookingId);

      if (userId === null) {
        return res.status(401).json({
          success: false,
          message: "กรุณาเข้าสู่ระบบใหม่"
        });
      }

      if (!/^\d+$/.test(bookingId)) {
        return res.status(400).json({
          success: false,
          message: "Invalid booking ID"
        });
      }

      const user = await findUserById(userId);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "ไม่พบบัญชีผู้ใช้งาน"
        });
      }

      const result = await cancelBooking(Number(bookingId), userId);

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

  return router;
}

module.exports = { createBookingRouter };
