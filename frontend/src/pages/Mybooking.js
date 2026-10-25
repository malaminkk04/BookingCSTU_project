// ===================================================================
// หน้า My Booking
// - Your Reservations: Confirmed / Using
// - Booking History: Completed / No show (Completed เขียนรีวิวได้)
// - รายการที่ยกเลิกแล้วจะไม่แสดงในหน้านี้
// ===================================================================

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../css/homepage.css";
import "../css/Mybooking.css";
import Navbar from "../components/navbar";

// ---------- ค่าคงที่ ----------

const API_BASE_URL = "http://localhost:5001";

// พิกัดสถานที่สำหรับเช็กอิน
const CHECKIN_LOCATION = {
  latitude: 14.0735763,
  longitude: 100.606303,
};

// ระยะสูงสุดที่อนุญาตให้เช็กอิน (เมตร)
const CHECKIN_RADIUS_METERS = 2000;

// ประเภท "แจ้งปัญหา" (ส่งถึงแอดมินเท่านั้น ไม่แสดงในหน้า Review)
const PROBLEM_TYPE = "แจ้งปัญหา";

// ---------- ฟังก์ชันช่วยเหลือ (Helpers) ----------

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch (error) {
    console.error("Unable to read user data:", error);
    return null;
  }
}

function getUserId(user) {
  return user?.user_id ?? user?.id ?? user?.userId ?? null;
}

// ชื่อเริ่มต้นในฟอร์มรีวิว
function getDisplayName(user) {
  return (
    user?.displayname_th ||
    user?.displayname_en ||
    user?.name ||
    user?.username ||
    ""
  );
}

// id การจอง (DB ใช้ booking_id)
function getBookingId(booking) {
  return booking?.booking_id ?? booking?.id ?? null;
}

// เช็กอินแล้ว = status เป็น checked_in หรือมีเวลาเช็กอิน
function isAlreadyCheckedIn(booking) {
  return Boolean(
    booking?.checked_in_at ||
      String(booking?.status || "").toLowerCase() === "checked_in"
  );
}

// สูตร Haversine คำนวณระยะทาง (เมตร)
function getDistanceInMeters(lat1, lon1, lat2, lon2) {
  const toRadians = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6371000;

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDate(dateValue) {
  if (!dateValue) return "-";

  const value = String(dateValue);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);

  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function formatTime(timeValue) {
  if (!timeValue) return "-";

  const value = String(timeValue);
  const match = value.match(/^(\d{1,2}):(\d{2})/);

  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }

  const date = new Date(value);

  if (!Number.isNaN(date.getTime())) {
    return date.toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  return value;
}

// วันเวลาสิ้นสุดการจอง (ใช้เรียงประวัติ และ fallback สถานะ)
function getBookingEnd(booking) {
  const dateValue =
    booking?.booking_date || booking?.date || booking?.bookingDate;
  const timeMatch = String(booking?.end_time || "").match(/^(\d{1,2}):(\d{2})/);

  if (!dateValue || !timeMatch) return null;

  const datePart = String(dateValue).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return null;

  const end = new Date(
    `${datePart}T${timeMatch[1].padStart(2, "0")}:${timeMatch[2]}:00`
  );

  return Number.isNaN(end.getTime()) ? null : end;
}

// แปลง status ของ DB เป็นป้ายที่แสดง
function getStatus(status) {
  const value = String(status || "confirmed").toLowerCase();

  switch (value) {
    case "cancelled":
      return { label: "Cancelled", className: "cancelled" };
    case "no_show":
      return { label: "No show", className: "noshow" };
    case "checked_in":
      return { label: "Using", className: "using" };
    case "completed":
      return { label: "Completed", className: "completed" };
    default:
      return { label: "Confirmed", className: "confirmed" };
  }
}

// Backend เป็นตัวตัดสินสถานะ ฝั่งนี้มี fallback ไว้กรณีข้อมูลยังไม่ถูกอัปเดต
function getEffectiveStatus(booking, checkedIn, now) {
  const base = getStatus(booking.status);

  // เช็กอินสำเร็จแล้วแต่ข้อมูลจากเซิร์ฟเวอร์ยังไม่อัปเดต
  const effective =
    base.className === "confirmed" && checkedIn
      ? { label: "Using", className: "using" }
      : base;

  // กำลังใช้งานแต่เลยเวลาสิ้นสุดแล้ว -> Completed
  if (effective.className === "using") {
    const end = getBookingEnd(booking);

    if (end && now > end.getTime()) {
      return { label: "Completed", className: "completed" };
    }
  }

  return effective;
}

// ---------- Component หลัก ----------

function Mybooking() {
  const navigate = useNavigate();

  const [user] = useState(() => getStoredUser());
  const [bookings, setBookings] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [toast, setToast] = useState("");

  const [cancellingId, setCancellingId] = useState(null);
  const [checkingInId, setCheckingInId] = useState(null);
  const [checkedInIds, setCheckedInIds] = useState([]);

  // id การจองที่รีวิวแล้ว (กันรีวิวซ้ำ)
  const [reviewedIds, setReviewedIds] = useState([]);

  // เวลาปัจจุบัน อัปเดตทุก 30 วินาที
  const [now, setNow] = useState(() => Date.now());

  // state ของป๊อปอัพเขียนรีวิว
  const [reviewTarget, setReviewTarget] = useState(null);
  const [reviewerName, setReviewerName] = useState("");
  const [selectedRating, setSelectedRating] = useState(0);
  const [feedbackType, setFeedbackType] = useState("รีวิวการใช้งาน");
  const [reviewMessage, setReviewMessage] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);

  const userId = getUserId(user);

  // ไม่มีข้อมูลผู้ใช้ -> กลับหน้าล็อกอิน
  useEffect(() => {
    if (!user || userId == null || userId === "") {
      navigate("/", { replace: true });
    }
  }, [user, userId, navigate]);

  // อัปเดตเวลาปัจจุบันเป็นระยะ
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  // ซ่อน Toast อัตโนมัติ
  useEffect(() => {
    if (!toast) return undefined;

    const timer = window.setTimeout(() => setToast(""), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // ---------- ดึงรายการจอง ----------
  const fetchBookings = useCallback(async () => {
    if (userId == null || userId === "") {
      setLoading(false);
      setError("กรุณาเข้าสู่ระบบใหม่");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const token = localStorage.getItem("token");

      const response = await fetch(
        `${API_BASE_URL}/api/bookings/${encodeURIComponent(userId)}`,
        {
          method: "GET",
          headers: {
            Accept: "application/json",
            "X-User-Id": String(userId),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        if (response.status === 401 || response.status === 403) {
          throw new Error("กรุณาเข้าสู่ระบบใหม่");
        }

        throw new Error(data.message || "Unable to load your bookings.");
      }

      const bookingList = Array.isArray(data)
        ? data
        : Array.isArray(data.bookings)
          ? data.bookings
          : [];

      setBookings(bookingList);

      // รวม id ที่เช็กอินแล้วจากเซิร์ฟเวอร์ (ใช้ Set กันซ้ำ)
      setCheckedInIds((previousIds) => [
        ...new Set([
          ...previousIds,
          ...bookingList
            .filter(isAlreadyCheckedIn)
            .map(getBookingId)
            .filter((id) => id != null)
            .map(String),
        ]),
      ]);
    } catch (err) {
      console.error("Failed to fetch bookings:", err);
      setError(err.message || "Something went wrong while loading your bookings.");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (userId != null && userId !== "") {
      fetchBookings();
    }
  }, [userId, fetchBookings]);

  // ---------- เช็กอิน ----------
  const handleCheckIn = (booking, effectiveStatus, checkedIn) => {
    const bookingId = getBookingId(booking);

    if (bookingId == null) {
      setError("Unable to identify this booking.");
      return;
    }

    if (checkedIn) {
      setNotice("You have already checked in for this booking.");
      return;
    }

    // เช็กอินได้เฉพาะรายการที่ยังเป็น Confirmed
    if (effectiveStatus.className !== "confirmed") {
      setError("This booking is not eligible for check-in.");
      return;
    }

    if (!navigator.geolocation) {
      setError("Your browser does not support location services.");
      return;
    }

    if (!window.isSecureContext) {
      setError("Location access requires HTTPS or localhost. Please open the app securely.");
      return;
    }

    setCheckingInId(bookingId);
    setError("");
    setNotice("");

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const { latitude, longitude, accuracy } = position.coords;

          const distance = getDistanceInMeters(
            latitude,
            longitude,
            CHECKIN_LOCATION.latitude,
            CHECKIN_LOCATION.longitude
          );

          if (distance > CHECKIN_RADIUS_METERS) {
            setError(
              `You are approximately ${Math.round(distance)} meters away. Please move within ${CHECKIN_RADIUS_METERS} meters of the check-in location.`
            );
            return;
          }

          const token = localStorage.getItem("token");

          const response = await fetch(
            `${API_BASE_URL}/api/bookings/${encodeURIComponent(bookingId)}/check-in`,
            {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "X-User-Id": String(userId),
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
              },
              body: JSON.stringify({
                user_id: userId,
                latitude,
                longitude,
                accuracy,
              }),
            }
          );

          const data = await response.json().catch(() => ({}));

          if (!response.ok || data.success === false) {
            throw new Error(data.message || "Unable to complete check-in.");
          }

          // บันทึกว่าเช็กอินแล้ว -> สถานะเปลี่ยนเป็น Using ทันที
          setCheckedInIds((ids) => [
            ...new Set([...ids, String(bookingId)]),
          ]);

          setNotice(
            data.message ||
              `Check-in successful! You are approximately ${Math.round(distance)} meters from the check-in location.`
          );

          await fetchBookings();
        } catch (err) {
          console.error("Check-in failed:", err);
          setError(err.message || "Unable to complete check-in.");
        } finally {
          setCheckingInId(null);
        }
      },
      (err) => {
        setCheckingInId(null);

        const message =
          err.code === 1
            ? "Location permission denied. Please allow location access."
            : err.code === 2
              ? "Unable to determine your location. Please try again."
              : err.code === 3
                ? "Location request timed out. Please try again."
                : "Unable to access your location.";

        setError(message);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    );
  };

  // ---------- ยกเลิกการจอง ----------
  const handleCancel = async (booking) => {
    const bookingId = getBookingId(booking);

    if (bookingId == null) {
      setError("Unable to identify this booking.");
      return;
    }

    if (!window.confirm("Are you sure you want to cancel this booking?")) {
      return;
    }

    setCancellingId(bookingId);
    setError("");
    setNotice("");

    try {
      const token = localStorage.getItem("token");

      const response = await fetch(
        `${API_BASE_URL}/api/bookings/${encodeURIComponent(bookingId)}`,
        {
          method: "DELETE",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-User-Id": String(userId),
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(data.message || "Unable to cancel this booking.");
      }

      // เอารายการออกจากหน้าทันที
      setBookings((previous) =>
        previous.filter(
          (item) => String(getBookingId(item)) !== String(bookingId)
        )
      );

      setNotice(data.message || "Booking cancelled successfully.");
      await fetchBookings();
    } catch (err) {
      console.error("Failed to cancel booking:", err);
      setError(err.message || "Something went wrong while cancelling.");
    } finally {
      setCancellingId(null);
    }
  };

  // ---------- ป๊อปอัพเขียนรีวิว ----------
  const openReviewModal = (booking) => {
    setFeedbackError("");
    setReviewerName(getDisplayName(user));
    setSelectedRating(0);
    setFeedbackType("รีวิวการใช้งาน");
    setReviewMessage("");
    setReviewTarget(booking);
  };

  const closeReviewModal = useCallback(() => {
    setReviewTarget(null);
    setFeedbackError("");
  }, []);

  // ปิดด้วยปุ่ม Escape และล็อกการเลื่อนพื้นหลังตอนเปิดป๊อปอัพ
  useEffect(() => {
    if (!reviewTarget) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") closeReviewModal();
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [reviewTarget, closeReviewModal]);

  const handleSubmitReview = async (event) => {
    event.preventDefault();

    if (!reviewTarget) return;

    const name = reviewerName.trim();
    const message = reviewMessage.trim();
    const isProblem = feedbackType === PROBLEM_TYPE;

    if (!name || !message) {
      setFeedbackError("กรุณากรอกชื่อและความคิดเห็น");
      return;
    }

    // รีวิวและข้อเสนอแนะต้องให้คะแนน ส่วนแจ้งปัญหาไม่ต้อง
    if (!isProblem && selectedRating === 0) {
      setFeedbackError("กรุณาเลือกคะแนนก่อนส่ง");
      return;
    }

    const bookingId = getBookingId(reviewTarget);

    setSubmittingReview(true);
    setFeedbackError("");

    try {
      const token = localStorage.getItem("token");

      const response = await fetch(`${API_BASE_URL}/api/reviews`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          "X-User-Id": String(userId),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          booking_id: bookingId,
          user_id: userId,
          reviewer_name: name,
          rating: isProblem ? null : selectedRating,
          type: feedbackType, // Backend แปลงเป็น feedback_type เอง
          message,
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || data.success === false) {
        throw new Error(data.message || "ไม่สามารถส่งความคิดเห็นได้");
      }

      // รีวิว/ข้อเสนอแนะส่งแล้วจะไม่ให้ส่งซ้ำ (แจ้งปัญหายังเขียนได้อีก)
      if (!isProblem) {
        setReviewedIds((ids) => [...new Set([...ids, String(bookingId)])]);
      }

      setToast(
        isProblem
          ? "ส่งเรื่องแจ้งปัญหาถึงผู้ดูแลระบบแล้ว"
          : "ขอบคุณสำหรับรีวิวของคุณ"
      );

      closeReviewModal();
    } catch (err) {
      console.error("Failed to submit review:", err);
      setFeedbackError(err.message || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmittingReview(false);
    }
  };

  // ---------- เตรียมข้อมูลแสดงผล ----------

  // คำนวณสถานะของแต่ละรายการ และซ่อนรายการที่ยกเลิกแล้ว
  const items = bookings
    .map((booking, index) => {
      const id = getBookingId(booking) ?? index;
      const checkedIn =
        isAlreadyCheckedIn(booking) || checkedInIds.includes(String(id));
      const status = getEffectiveStatus(booking, checkedIn, now);
      const reviewed =
        Boolean(booking.reviewed) || reviewedIds.includes(String(id));

      return { booking, id, checkedIn, status, reviewed };
    })
    .filter((item) => item.status.className !== "cancelled");

  // รายการปัจจุบัน (Confirmed / Using)
  const activeItems = items.filter(
    (item) => !["completed", "noshow"].includes(item.status.className)
  );

  // ประวัติการจอง (Completed / No show) เรียงล่าสุดก่อน
  const historyItems = items
    .filter((item) => ["completed", "noshow"].includes(item.status.className))
    .sort(
      (a, b) =>
        (getBookingEnd(b.booking)?.getTime() || 0) -
        (getBookingEnd(a.booking)?.getTime() || 0)
    );

  // การ์ดการจอง (ใช้ทั้งรายการปัจจุบันและประวัติ)
  const renderBookingCard = (item, isHistory) => {
    const { booking, id, checkedIn, status, reviewed } = item;

    const roomName = booking.room_name || booking.room || booking.roomName || "Room";
    const bookingDate = booking.booking_date || booking.date || booking.bookingDate;
    const rawId = getBookingId(booking);

    // เช็กอิน/ยกเลิกได้เฉพาะก่อนเริ่มใช้งาน (Confirmed)
    const canAct = status.className === "confirmed";

    return (
      <article className="booking-card" key={id}>
        <div className="booking-card-accent" />

        <div className="booking-card-main">
          <div className="booking-card-top">
            <div className="room-heading">
              <div className="room-icon" aria-hidden="true">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M3 21V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v16" />
                  <path d="M3 14h18M7 14V9h4v5m2 0V9h4v5M2 21h20" />
                </svg>
              </div>
              <div>
                <p className="room-label">RESERVED ROOM</p>
                <h3>{roomName}</h3>
              </div>
            </div>

            {/* ป้ายสถานะ: Confirmed / Using / Completed / No show */}
            <span className={`booking-status status-${status.className}`}>
              <span className="status-dot" />
              {status.label}
            </span>
          </div>

          <div className="booking-details">
            <div className="booking-detail">
              <span className="detail-icon" aria-hidden="true">▦</span>
              <div>
                <span className="detail-label">Date</span>
                <strong>{formatDate(bookingDate)}</strong>
              </div>
            </div>

            <div className="booking-detail">
              <span className="detail-icon" aria-hidden="true">◷</span>
              <div>
                <span className="detail-label">Time</span>
                <strong>
                  {formatTime(booking.start_time)} – {formatTime(booking.end_time)}
                </strong>
              </div>
            </div>
          </div>
        </div>

        <div className="booking-card-actions">
          {/* ก่อนใช้งาน: ปุ่มเช็กอิน + ยกเลิก */}
          {canAct && (
            <>
              <button
                type="button"
                className="checkin-button"
                onClick={() => handleCheckIn(booking, status, checkedIn)}
                disabled={checkingInId === rawId}
              >
                {checkingInId === rawId ? "Checking in..." : "Check-in"}
              </button>

              <button
                type="button"
                className="cancel-booking-button"
                disabled={cancellingId === rawId}
                onClick={() => handleCancel(booking)}
              >
                {cancellingId === rawId ? "Cancelling..." : "Cancel booking"}
              </button>
            </>
          )}

          {/* ใช้งานเสร็จสิ้น: ปุ่มเขียนรีวิว (No show ไม่แสดง) */}
          {isHistory &&
            status.className === "completed" &&
            (reviewed ? (
              <button type="button" className="review-booking-button" disabled>
                ✓ Reviewed
              </button>
            ) : (
              <button
                type="button"
                className="review-booking-button"
                onClick={() => openReviewModal(booking)}
              >
                ✎ Write review
              </button>
            ))}

          <span className="booking-footer-note">
            {isHistory
              ? status.className === "noshow"
                ? "You did not check in for this reservation."
                : reviewed
                  ? "Thank you for your review."
                  : "How was your experience? Share your feedback."
              : status.className === "using"
                ? "You are currently using this room."
                : "Please check in at the venue."}
          </span>
        </div>
      </article>
    );
  };

  // ---------- ส่วนแสดงผล (UI) ----------
  return (
    <div className="homepage mybooking-page">
      <Navbar />

      <main className="mybooking-main">
        {/* Hero */}
        <section className="mybooking-hero">
          <div className="mybooking-hero-content">
            <p className="mybooking-eyebrow">YOUR SPACE, YOUR TIME</p>
            <h1>My Booking</h1>
            <p>
              Manage your reservations and keep track of your upcoming room
              bookings.
            </p>
          </div>

          <div className="mybooking-hero-decoration" aria-hidden="true">
            <span className="decoration-circle circle-one" />
            <span className="decoration-circle circle-two" />
            <span className="decoration-circle circle-three" />
          </div>
        </section>

        {/* ---------- รายการจองปัจจุบัน ---------- */}
        <section className="booking-section">
          <div className="booking-section-heading">
            <div>
              <p className="section-eyebrow">OVERVIEW</p>
              <h2>Your Reservations</h2>
              <p className="section-description">
                View the details and status of your bookings.
              </p>
            </div>

            <button
              type="button"
              className="refresh-button"
              onClick={() => {
                setNotice("");
                fetchBookings();
              }}
              disabled={loading}
            >
              <span aria-hidden="true">↻</span>
              Refresh
            </button>
          </div>

          {!loading && !error && (
            <div className="booking-summary">
              <div className="summary-icon" aria-hidden="true">▣</div>
              <div>
                <span className="summary-label">Active reservations</span>
                <strong>{activeItems.length}</strong>
              </div>
            </div>
          )}

          {notice && (
            <div className="booking-alert success-alert" role="status">
              <span aria-hidden="true">✓</span>
              <span>{notice}</span>
              <button type="button" aria-label="Dismiss message" onClick={() => setNotice("")}>
                ×
              </button>
            </div>
          )}

          {error && (
            <div className="booking-alert error-alert" role="alert">
              <span aria-hidden="true">!</span>
              <span>{error}</span>
              <button type="button" className="alert-retry" onClick={fetchBookings} disabled={loading}>
                Try again
              </button>
            </div>
          )}

          {loading ? (
            <div className="booking-state">
              <span className="booking-spinner" />
              <h3>Loading your bookings...</h3>
              <p>Please wait while we retrieve your reservations.</p>
            </div>
          ) : error && bookings.length === 0 ? (
            <div className="booking-state">
              <div className="state-icon error-state-icon">!</div>
              <h3>Unable to load bookings</h3>
              <p>Please check your connection and try again.</p>
              <button type="button" className="primary-button" onClick={fetchBookings}>
                Try again
              </button>
            </div>
          ) : activeItems.length === 0 ? (
            <div className="booking-state empty-booking-state">
              <div className="state-icon" aria-hidden="true">▢</div>
              <h3>No active bookings</h3>
              <p>
                You don't have any upcoming reservations. Find a room and make
                a new booking.
              </p>
              <button type="button" className="primary-button" onClick={() => navigate("/homepage")}>
                Explore rooms <span aria-hidden="true">→</span>
              </button>
            </div>
          ) : (
            <div className="booking-list">
              {activeItems.map((item) => renderBookingCard(item, false))}
            </div>
          )}
        </section>

        {/* ---------- ประวัติการจอง ---------- */}
        {!loading && !(error && bookings.length === 0) && (
          <section className="booking-section booking-history-section">
            <div className="booking-section-heading">
              <div>
                <p className="section-eyebrow">HISTORY</p>
                <h2>Booking History</h2>
                <p className="section-description">
                  Completed reservations. Share your experience to help us
                  improve.
                </p>
              </div>
            </div>

            {historyItems.length === 0 ? (
              <div className="booking-state empty-booking-state">
                <div className="state-icon" aria-hidden="true">◷</div>
                <h3>No booking history yet</h3>
                <p>Your completed reservations will appear here.</p>
              </div>
            ) : (
              <div className="booking-list">
                {historyItems.map((item) => renderBookingCard(item, true))}
              </div>
            )}
          </section>
        )}

        <footer className="mybooking-footer">
          <p>ROOM RESERVE</p>
          <span>Make room for what matters.</span>
        </footer>
      </main>

      {/* ---------- ป๊อปอัพเขียนรีวิว / ข้อเสนอแนะ ---------- */}
      {reviewTarget && (
        <div
          className="rv-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeReviewModal();
          }}
        >
          <section
            className="rv-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedbackModalTitle"
          >
            <button
              type="button"
              className="rv-modal-close"
              aria-label="ปิดหน้าต่าง"
              onClick={closeReviewModal}
            >
              ×
            </button>

            <p className="rv-eyebrow">YOUR FEEDBACK MATTERS</p>
            <h2 id="feedbackModalTitle">เขียนรีวิว / ข้อเสนอแนะ</h2>
            <p className="rv-modal-description">
              ห้อง{" "}
              <strong>
                {reviewTarget.room_name ||
                  reviewTarget.room ||
                  reviewTarget.roomName ||
                  "-"}
              </strong>{" "}
              · แบ่งปันความคิดเห็นของคุณเกี่ยวกับระบบ BookingCSTU
            </p>

            <form onSubmit={handleSubmitReview}>
              <div className="rv-field">
                <label htmlFor="reviewerName">ชื่อที่แสดง</label>
                <input
                  id="reviewerName"
                  name="reviewerName"
                  type="text"
                  maxLength={60}
                  required
                  value={reviewerName}
                  onChange={(event) => setReviewerName(event.target.value)}
                />
              </div>

              {/* แจ้งปัญหาไม่ต้องให้คะแนน จึงซ่อนส่วนนี้ */}
              {feedbackType !== PROBLEM_TYPE && (
                <fieldset className="rv-rating-field">
                  <legend>ให้คะแนนความพึงพอใจ</legend>

                  <div
                    className="rv-star-picker"
                    role="radiogroup"
                    aria-label="เลือกคะแนน 1 ถึง 5"
                  >
                    {[1, 2, 3, 4, 5].map((rating) => (
                      <button
                        key={rating}
                        type="button"
                        className={rating <= selectedRating ? "selected" : ""}
                        role="radio"
                        aria-checked={selectedRating === rating}
                        aria-label={`${rating} ดาว`}
                        onClick={() => setSelectedRating(rating)}
                      >
                        ★
                      </button>
                    ))}
                  </div>

                  <span className="rv-field-hint">
                    {selectedRating
                      ? `${selectedRating} จาก 5 ดาว`
                      : "เลือกคะแนน 1–5 ดาว"}
                  </span>
                </fieldset>
              )}

              <div className="rv-field">
                <label htmlFor="feedbackType">ประเภทความคิดเห็น</label>
                <select
                  id="feedbackType"
                  name="feedbackType"
                  value={feedbackType}
                  onChange={(event) => setFeedbackType(event.target.value)}
                >
                  <option value="รีวิวการใช้งาน">รีวิวการใช้งาน</option>
                  <option value="ข้อเสนอแนะ">ข้อเสนอแนะ</option>
                  <option value={PROBLEM_TYPE}>แจ้งปัญหา</option>
                </select>
              </div>

              <div className="rv-field">
                <label htmlFor="reviewMessage">ความคิดเห็น</label>
                <textarea
                  id="reviewMessage"
                  name="reviewMessage"
                  rows={4}
                  maxLength={1000}
                  placeholder="เล่าประสบการณ์หรือข้อเสนอแนะของคุณ..."
                  required
                  value={reviewMessage}
                  onChange={(event) => setReviewMessage(event.target.value)}
                />
              </div>

              {feedbackError && (
                <p className="rv-form-error" role="alert">
                  {feedbackError}
                </p>
              )}

              <p className="rv-form-note">
                {feedbackType === PROBLEM_TYPE
                  ? "การแจ้งปัญหาจะส่งถึงผู้ดูแลระบบเท่านั้น และจะไม่แสดงในหน้ารีวิว"
                  : "รีวิวและข้อเสนอแนะของคุณจะแสดงในหน้ารีวิวสำหรับผู้ใช้งานทุกคน"}
              </p>

              <div className="rv-modal-actions">
                <button
                  type="button"
                  className="rv-btn rv-btn-light"
                  onClick={closeReviewModal}
                  disabled={submittingReview}
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  className="rv-btn rv-btn-primary"
                  disabled={submittingReview}
                >
                  {submittingReview ? "กำลังส่ง..." : "ส่งความคิดเห็น"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* ข้อความแจ้งผลหลังส่งรีวิว */}
      {toast && (
        <div className="rv-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}

export default Mybooking;