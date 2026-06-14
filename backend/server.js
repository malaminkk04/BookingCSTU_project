require("dotenv").config();

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const { upsertUser, addBooking, getBookingsByUser } = require('./db');

const app = express();

app.use(cors());

app.use(express.json());
app.get("/health", (req, res) => {
  return res.status(200).json({
    status: "ok",
    message: "CS Room Booking backend is running"
  });
});

app.post("/login", async (req, res) => {

  try {

    const { username, password } = req.body;

    // Log login attempt (do not log passwords)
    console.log(`Login attempt for username=${username}`);

    const response =
      await axios.post(
        "https://restapi.tu.ac.th/api/v1/auth/Ad/verify",
        {
          UserName: username,
          PassWord: password
        },
        {
          headers: {
            "Content-Type":
              "application/json",

            "Application-Key":
              process.env.TU_API_KEY
          }
        }
      );

    const data = response.data;
console.log(data);
    // Log response summary from TU API
    console.log('TU API response status:', data.status);
    console.log('TU API response (trim):',
      JSON.stringify(data).slice(0, 400)
    );

    if (data.status === true) {

      // Save user to database
      const userData = {
        username: username,
        student_id: data.studentID || data.username,
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
          user:data
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

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server Running on port ${PORT}`);

});