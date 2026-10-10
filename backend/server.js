require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const { upsertUser, getUserByEmail, addBooking, getBookingsByUser, getBookingsByDate, getRooms, deleteBooking } = require('./db');

const app = express();

app.use(cors());

app.use(express.json());
app.get("/health", (req, res) => {
  return res.status(200).json({
    status: "ok",
    message: "CS Room Booking backend is running"
  });
});

async function verifyWithTuApi(identifier, password) {
  const identifiers = [identifier];
  if (identifier.includes('@')) {
    identifiers.push(identifier.split('@')[0]);
  }

  let lastError;
  for (const candidate of identifiers) {
    try {
      const response = await axios.post(
        "https://restapi.tu.ac.th/api/v1/auth/Ad/verify",
        {
          UserName: candidate,
          PassWord: password
        },
        {
          headers: {
            "Content-Type": "application/json",
            "Application-Key": process.env.TU_API_KEY
          }
        }
      );

      if (response.data?.status === true) {
        return response.data;
      }

      lastError = new Error('TU authentication rejected the credentials');
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error('TU authentication failed');
}

function findUsernameForEmail(email) {
  return new Promise((resolve, reject) => {
    getUserByEmail(email, (error, user) => {
      if (error) return reject(error);
      resolve(user?.username);
    });
  });
}

app.post("/login", async (req, res) => {

  try {

    const { identifier, username, password } = req.body;
    const loginIdentifier = (identifier || username || '').trim();

    if (!loginIdentifier || !password) {
      return res.status(400).json({
        success: false,
        message: 'Identifier and password are required'
      });
    }

    // Log login attempt (do not log passwords)
    console.log(`Login attempt for identifier=${loginIdentifier}`);

    let authIdentifier = loginIdentifier;
    if (loginIdentifier.includes('@')) {
      authIdentifier = await findUsernameForEmail(loginIdentifier);
      if (!authIdentifier) {
        return res.status(401).json({
          success: false,
          message: 'Log in once with your student ID before using your TU email'
        });
      }
    }

    const data = await verifyWithTuApi(authIdentifier, password);
    // Log response summary from TU API
    console.log('TU API response status:', data.status);
    console.log('TU API response (trim):',
      JSON.stringify(data).slice(0, 400)
    );

    if (data.status === true) {

      // Save user to database
      const userData = {
        username: data.username || loginIdentifier,
        student_id: data.studentID || data.username,
        email: data.email || '',
        displayname_th: data.displayname_th || data.displayname_en || data.username,
        faculty: data.faculty_name_th || data.faculty_name_en || '',
        major: data.branch_name_th || data.branch_name_en || ''
      };

      upsertUser(userData, (err, user_id) => {
        if (err) {
          console.error('Error saving user:', err);
          return res.status(500).json({ success: false, message: 'Database error' });
        }

        return res.json({
          success: true,
          token: "demo-token",
          user: { ...data, user_id }
        });
      });
      return;

    }

    return res.status(401).json({
      success: false
    });

  } catch (error) {

    console.log(
      error.response?.data
    );

    return res.status(500).json({
      success: false
    });

  }

});

// Booking endpoints
app.get("/api/rooms", (req, res) => {
  getRooms((err, rooms) => {
    if (err) {
      console.error('Error fetching rooms:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    const requestedDate = req.query.date;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || "")
      ? requestedDate
      : new Date().toISOString().slice(0, 10);

    getBookingsByDate(date, (bookingError, bookings) => {
      if (bookingError) {
        console.error('Error fetching room booking intervals:', bookingError);
        return res.status(500).json({ success: false, message: 'Database error' });
      }

      const bookingsByRoom = new Map();
      (bookings || []).forEach(booking => {
        const key = String(booking.room).trim().toLocaleLowerCase();
        if (!bookingsByRoom.has(key)) bookingsByRoom.set(key, []);
        bookingsByRoom.get(key).push({
          start_time: booking.start_time,
          end_time: booking.end_time
        });
      });

      const formattedRooms = (rooms || []).map(room => {
        const codesAndNames = [room.room_code, room.room_name]
          .filter(Boolean)
          .map(value => String(value).trim().toLocaleLowerCase());
        const roomBookings = codesAndNames.flatMap(key => bookingsByRoom.get(key) || []);
        const uniqueBookings = [...new Map(roomBookings.map(item => [
          `${item.start_time}-${item.end_time}`,
          item
        ])).values()];

        return {
          ...room,
          capacity_label: `ความจุ: ${room.capacity} คน`,
          equipment: room.facilities ? room.facilities.split(/,\s*/) : [],
          bookings: uniqueBookings
        };
      });

      return res.json({ success: true, date, rooms: formattedRooms });
    });
  });
});

app.post("/api/bookings", (req, res) => {
  const { user_id, room, date, start_time, end_time, purpose } = req.body;

  if (!user_id || !room || !date || !start_time || !end_time) {
    return res.status(400).json({ success: false, message: "Missing required fields" });
  }

  const booking = { user_id, room, date, start_time, end_time, purpose: purpose || '' };

  addBooking(booking, (err, booking_id) => {
    if (err) {
      console.error('Error adding booking:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    return res.json({ success: true, booking_id });
  });
});

app.get("/api/bookings/:userId", (req, res) => {
  const { userId } = req.params;

  getBookingsByUser(userId, (err, bookings) => {
    if (err) {
      console.error('Error fetching bookings:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    return res.json({ success: true, bookings: bookings || [] });
  });
});

app.delete("/api/bookings/:bookingId", (req, res) => {
  const { bookingId } = req.params;
  const userId = req.headers["x-user-id"];

  if (!userId) {
    return res.status(400).json({ success: false, message: "Missing user ID" });
  }

  deleteBooking(bookingId, userId, (err, changes) => {
    if (err) {
      console.error('Error deleting booking:', err);
      return res.status(500).json({ success: false, message: 'Database error' });
    }

    if (!changes) {
      return res.status(404).json({ success: false, message: 'Booking not found' });
    }

    return res.json({ success: true });
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server Running on port ${PORT}`);

});