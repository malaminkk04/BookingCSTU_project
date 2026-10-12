
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../css/homepage.css";
import "../css/Mybooking.css";

const API_BASE_URL = "http://localhost:5001";

const CHECKIN_LOCATION = {
  latitude: 14.0735763,
  longitude: 100.606303,
};

const CHECKIN_RADIUS_METERS = 500;

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "null");
  } catch (error) {
    console.error("Unable to read user data:", error);
    return null;
  }
}

function getUserId(user) {
  return user?.id ?? user?.user_id ?? user?.userId ?? null;
}

function getBookingId(booking) {
  return booking?.id ?? booking?.booking_id ?? null;
}

function isAlreadyCheckedIn(booking) {
  return Boolean(
    booking?.checked_in_at ||
      booking?.checkedInAt ||
      booking?.checkin_status === "checked_in" ||
      booking?.check_in_status === "checked_in" ||
      booking?.checked_in === true ||
      booking?.checked_in === 1
  );
}

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

function getStatus(status) {
  const value = String(status || "pending").toLowerCase();

  if (["cancelled", "canceled", "rejected", "expired"].includes(value)) {
    return {
      label:
        value === "canceled"
          ? "Cancelled"
          : value.charAt(0).toUpperCase() + value.slice(1),
      className: "cancelled",
    };
  }

  if (["confirmed", "approved", "success"].includes(value)) {
    return {
      label: value === "success" ? "Confirmed" : value.charAt(0).toUpperCase() + value.slice(1),
      className: "confirmed",
    };
  }

  if (["completed", "finished"].includes(value)) {
    return {
      label: "Completed",
      className: "completed",
    };
  }

  return {
    label: value.charAt(0).toUpperCase() + value.slice(1),
    className: "pending",
  };
}

function Mybooking() {
  const navigate = useNavigate();

  const [user] = useState(() => getStoredUser());
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [cancellingId, setCancellingId] = useState(null);
  const [checkingInId, setCheckingInId] = useState(null);
  const [checkedInIds, setCheckedInIds] = useState([]);
  const [notice, setNotice] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);

  const userId = getUserId(user);

  useEffect(() => {
    if (!user || userId == null || userId === "") {
      navigate("/", { replace: true });
    }
  }, [user, userId, navigate]);

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

  const handleCheckIn = (booking) => {
    const bookingId = getBookingId(booking);

    if (bookingId == null) {
      setError("Unable to identify this booking.");
      return;
    }

    const checkedIn =
      isAlreadyCheckedIn(booking) ||
      checkedInIds.includes(String(bookingId));

    if (checkedIn) {
      setNotice("You have already checked in for this booking.");
      return;
    }

    const status = getStatus(booking.status);
    const rawStatus = String(booking.status || "").toLowerCase();

    if (
      ["cancelled", "completed"].includes(status.className) ||
      ["canceled", "rejected", "expired"].includes(rawStatus)
    ) {
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
              `You are approximately ${Math.round(distance)} meters away. Please move within 500 meters of the check-in location.`
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

  const handleCancel = async (booking) => {
    const bookingId = getBookingId(booking);

    if (bookingId == null) {
      setError("Unable to identify this booking.");
      return;
    }

    const status = getStatus(booking.status);

    if (["cancelled", "completed"].includes(status.className)) {
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

      setNotice(data.message || "Booking cancelled successfully.");
      await fetchBookings();
    } catch (err) {
      console.error("Failed to cancel booking:", err);
      setError(err.message || "Something went wrong while cancelling.");
    } finally {
      setCancellingId(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    navigate("/", { replace: true });
  };

  return (
    <div className="homepage mybooking-page">
      <header className="site-header">
        <a
          className="brand"
          href="/homepage"
          aria-label="Booking CSTU Home"
          onClick={(event) => {
            event.preventDefault();
            navigate("/homepage");
          }}
        >
          <img
            className="brand-logo"
            src={`${process.env.PUBLIC_URL}/logo.png`}
            alt="Booking CSTU logo"
          />
          <span className="brand-copy">
            <strong>CSTU ROOM BOOKING</strong>
            <small>BOOKING CSTU ROOM</small>
          </span>
        </a>

        <nav className="main-nav" aria-label="Main navigation">
          <button type="button" className="nav-link" onClick={() => navigate("/homepage")}>
            HOME
          </button>

          <button
            type="button"
            className="nav-link active"
            aria-current="page"
            onClick={() => navigate("/mybooking")}
          >
            MY BOOKING
          </button>

          <a href={`${process.env.PUBLIC_URL}/Guide.html`} className="nav-link">
            GUIDE
          </a>

          <a href={`${process.env.PUBLIC_URL}/Rule.html`} className="nav-link">
            RULE
          </a>

          <a href={`${process.env.PUBLIC_URL}/review.html`} className="nav-link">
            REVIEW
          </a>

          <div className="profile-menu">
            <button
              type="button"
              id="profileButton"
              className="profile-button"
              aria-expanded={profileOpen}
              aria-controls="profilePopup"
              onClick={() => setProfileOpen((value) => !value)}
            >
              <span>PROFILE</span>
              <span className="chevron" aria-hidden="true">⌄</span>
            </button>

            {profileOpen && (
              <section id="profilePopup" className="profile-popup">
                <h2>ข้อมูลผู้ใช้</h2>

                <dl className="profile-details">
                  <div>
                    <dt>ชื่อ</dt>
                    <dd>{user?.displayname_th || user?.displayname_en || "-"}</dd>
                  </div>
                  <div>
                    <dt>Username</dt>
                    <dd>{user?.username || "-"}</dd>
                  </div>
                  <div>
                    <dt>คณะ</dt>
                    <dd>{user?.faculty || "-"}</dd>
                  </div>
                  <div>
                    <dt>สาขา</dt>
                    <dd>{user?.department || user?.major || "-"}</dd>
                  </div>
                  <div>
                    <dt>Email</dt>
                    <dd>{user?.email || "-"}</dd>
                  </div>
                </dl>

                <button
                  type="button"
                  id="logoutButton"
                  className="button button-danger button-full"
                  onClick={handleLogout}
                >
                  LOGOUT
                </button>
              </section>
            )}
          </div>
        </nav>
      </header>

      <main className="mybooking-main">
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
                <span className="summary-label">Total reservations</span>
                <strong>{bookings.length}</strong>
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
          ) : bookings.length === 0 ? (
            <div className="booking-state empty-booking-state">
              <div className="state-icon" aria-hidden="true">▢</div>
              <h3>No bookings yet</h3>
              <p>
                You haven't made any reservations. Find a room and make your
                first booking.
              </p>
              <button type="button" className="primary-button" onClick={() => navigate("/homepage")}>
                Explore rooms <span aria-hidden="true">→</span>
              </button>
            </div>
          ) : (
            <div className="booking-list">
              {bookings.map((booking, index) => {
                const bookingId = getBookingId(booking) ?? index;
                const roomName = booking.room_name || booking.room || booking.roomName || "Room";
                const bookingDate = booking.booking_date || booking.date || booking.bookingDate;
                const status = getStatus(booking.status);

                const canCancel = !["cancelled", "completed"].includes(status.className);

                const checkedIn =
                  isAlreadyCheckedIn(booking) ||
                  checkedInIds.includes(String(bookingId));

                const isIneligible = [
                  "cancelled",
                  "canceled",
                  "completed",
                  "expired",
                  "rejected",
                ].includes(String(booking.status || "").toLowerCase());

                return (
                  <article className="booking-card" key={bookingId}>
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
                      {canCancel && (
                        <button
                          type="button"
                          className="checkin-button"
                          onClick={() => handleCheckIn(booking)}
                          disabled={
                            checkingInId === getBookingId(booking) ||
                            checkedIn ||
                            isIneligible
                          }
                        >
                          {checkingInId === getBookingId(booking)
                            ? "Checking in..."
                            : checkedIn
                              ? "✓ Checked in"
                              : "Check-in"}
                        </button>
                      )}

                      {canCancel && (
                        <button
                          type="button"
                          className="cancel-booking-button"
                          disabled={cancellingId === getBookingId(booking)}
                          onClick={() => handleCancel(booking)}
                        >
                          {cancellingId === getBookingId(booking)
                            ? "Cancelling..."
                            : "Cancel booking"}
                        </button>
                      )}

                      <span className="booking-footer-note">
                        {status.className === "cancelled"
                          ? "This reservation has been cancelled."
                          : status.className === "completed"
                            ? "This reservation is complete."
                            : checkedIn
                              ? "You have checked in."
                              : "Please check in at the venue."}
                      </span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <footer className="mybooking-footer">
          <p>ROOM RESERVE</p>
          <span>Make room for what matters.</span>
        </footer>
      </main>
    </div>
  );
}

export default Mybooking;
