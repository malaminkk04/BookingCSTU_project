import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../../css/admin/admin_booking.css";

const API_BASE_URL = "http://localhost:5001";

const STATUS_OPTIONS = [
  { value: "all", label: "ทุกสถานะ" },
  { value: "reserved", label: "จองสำเร็จ" },
  { value: "checked_in", label: "เช็คอิน" },
  { value: "completed", label: "ใช้งานสำเร็จ" },
  { value: "cancelled", label: "ยกเลิก" },
  { value: "no_show", label: "ไม่มาใช้งาน" },
];

const STATUS_LABELS = {
  reserved: "Reserved",
  checked_in: "Checked in",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No-show",
};

const VALID_STATUSES = Object.keys(STATUS_LABELS);

function getBangkokDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = {};

  parts.forEach((part) => {
    if (part.type !== "literal") values[part.type] = part.value;
  });

  return `${values.year}-${values.month}-${values.day}`;
}

function formatDateParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);

  const check = new Date(Date.UTC(y, m - 1, d));

  if (
    !Number.isFinite(y) ||
    !Number.isFinite(m) ||
    !Number.isFinite(d) ||
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== m - 1 ||
    check.getUTCDate() !== d
  ) {
    return "";
  }

  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function normalizeDate(value) {
  if (value == null || value === "") return "";

  if (value instanceof Date || typeof value === "number") {
    const date = value instanceof Date ? value : new Date(value);

    if (Number.isNaN(date.getTime())) return "";

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(date);

    const values = {};

    parts.forEach((part) => {
      if (part.type !== "literal") values[part.type] = part.value;
    });

    return `${values.year}-${values.month}-${values.day}`;
  }

  if (typeof value !== "string") return "";

  const text = value.trim();
  if (!text) return "";

  // รูปแบบ YYYY-MM-DD ซึ่งเป็นวันที่ล้วนจาก input หรือ MySQL DATE
  const dateOnlyMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (dateOnlyMatch) {
    return formatDateParts(
      dateOnlyMatch[1],
      dateOnlyMatch[2],
      dateOnlyMatch[3]
    );
  }

  // รูปแบบวันที่ไทย DD/MM/YYYY
  const thaiDateMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);

  if (thaiDateMatch) {
    return formatDateParts(
      thaiDateMatch[3],
      thaiDateMatch[2],
      thaiDateMatch[1]
    );
  }

  // รูปแบบวันเวลาจาก SQL ที่ไม่มี timezone ให้ใช้วันที่ตามที่ฐานข้อมูลส่งมา
  const sqlDateTimeMatch = text.match(
    /^(\d{4})-(\d{2})-(\d{2})[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/
  );

  if (sqlDateTimeMatch) {
    return formatDateParts(
      sqlDateTimeMatch[1],
      sqlDateTimeMatch[2],
      sqlDateTimeMatch[3]
    );
  }

  // ISO datetime ที่มี timezone ต้องแปลงเป็นวันที่ในประเทศไทยก่อน
  const parsed = new Date(text);

  if (!Number.isNaN(parsed.getTime())) {
    return normalizeDate(parsed);
  }

  return "";
}

function getBookingDateValue(booking) {
  return (
    booking.booking_date ??
    booking.bookingDate ??
    booking.date ??
    booking.reservation_date ??
    booking.reservationDate ??
    ""
  );
}

function normalizeStatus(value) {
  return String(value ?? "").trim().toLowerCase();
}

function formatDate(value) {
  const date = normalizeDate(value);

  if (!date) return "-";

  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function formatTime(value) {
  if (!value) return "-";
  return String(value).slice(0, 5);
}

function formatDateTime(value) {
  if (!value) return "-";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleString("th-TH", {
    timeZone: "Asia/Bangkok",
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function getStatusLabel(status) {
  const normalized = normalizeStatus(status);
  return STATUS_LABELS[normalized] || `Unknown (${status || "-"})`;
}

function getUserDisplayName(booking) {
  return (
    booking.user_name ||
    booking.displayname_th ||
    booking.name ||
    booking.username ||
    booking.tu_id ||
    `User #${booking.user_id ?? "-"}`
  );
}

function getRoomDisplayName(booking) {
  return (
    booking.room_name ||
    booking.room_code ||
    booking.room ||
    `Room #${booking.room_id ?? "-"}`
  );
}

function getHeaders() {
  const token = localStorage.getItem("token");

  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function getBookingSearchText(booking) {
  return [
    booking.booking_id,
    booking.user_id,
    booking.username,
    booking.tu_id,
    booking.email,
    booking.name,
    booking.displayname_th,
    booking.user_name,
    booking.room_code,
    booking.room_name,
    booking.room,
    booking.purpose,
    booking.status,
  ]
    .map((value) => String(value ?? ""))
    .join(" ")
    .toLocaleLowerCase();
}

export default function AdminBooking() {
  const navigate = useNavigate();
  const requestIdRef = useRef(0);

  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("");
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const loadBookings = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    setLoading(true);
    setError("");
    setNotice("");

    try {
      const params = new URLSearchParams();

      // ส่งวันที่ให้ API เฉพาะเมื่อผู้ใช้เลือกวันที่
      if (dateFilter) {
        params.set("date", dateFilter);
      }

      const query = params.toString();
      const url = `${API_BASE_URL}/api/admin/bookings${
        query ? `?${query}` : ""
      }`;

      console.log("[ADMIN BOOKINGS REQUEST]", {
        url,
        dateFilter: dateFilter || null,
        statusFilter,
        search: search.trim(),
      });

      const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
      });

      const result = await response.json().catch(() => ({}));

      if (requestId !== requestIdRef.current) return;

      if (response.status === 401) {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        navigate("/login", { replace: true });
        return;
      }

      if (response.status === 403) {
        throw new Error("บัญชีนี้ไม่มีสิทธิ์เข้าถึงหน้าจัดการการจอง");
      }

      if (!response.ok || !result.success) {
        throw new Error(
          result.message || result.error || "ไม่สามารถโหลดรายการจองได้"
        );
      }

      const receivedBookings = Array.isArray(result.bookings)
        ? result.bookings
        : [];

      const today = getBangkokDate();
      const keyword = search.trim().toLocaleLowerCase();

      const visibleBookings = receivedBookings.filter((booking) => {
        const rawDate = getBookingDateValue(booking);
        const bookingDate = normalizeDate(rawDate);
        const bookingStatus = normalizeStatus(booking.status);

        // ถ้าเลือกวันที่ ให้เปรียบเทียบวันที่ที่แปลงเป็น YYYY-MM-DD แล้ว
        // ถ้าไม่ได้เลือกวันที่ ให้แสดงรายการตั้งแต่วันนี้เป็นต้นไป
        const matchesDate = dateFilter
          ? bookingDate === dateFilter
          : bookingDate !== "" && bookingDate >= today;

        const matchesStatus =
          statusFilter === "all" ||
          bookingStatus === normalizeStatus(statusFilter);

        const matchesSearch =
          !keyword || getBookingSearchText(booking).includes(keyword);

        return matchesDate && matchesStatus && matchesSearch;
      });

      console.log("[ADMIN BOOKINGS RESULT]", {
        totalFromApi: receivedBookings.length,
        totalDisplayed: visibleBookings.length,
        todayBangkok: today,
        selectedDate: dateFilter || null,
        datesFromApi: receivedBookings.map((booking) => ({
          booking_id: booking.booking_id,
          rawBookingDate: getBookingDateValue(booking),
          normalizedDate: normalizeDate(getBookingDateValue(booking)),
          status: booking.status,
        })),
      });

      const unexpectedStatuses = visibleBookings.filter(
        (booking) =>
          !VALID_STATUSES.includes(normalizeStatus(booking.status))
      );

      if (unexpectedStatuses.length > 0) {
        setNotice(
          `มีรายการที่ใช้สถานะที่ไม่รู้จัก ${unexpectedStatuses.length} รายการ กรุณาตรวจสอบข้อมูล`
        );
      }

      setBookings(visibleBookings);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;

      setError(err.message || "เกิดข้อผิดพลาดในการโหลดรายการจอง");
      setBookings([]);
    } finally {
      if (requestId === requestIdRef.current) {
        setLoading(false);
      }
    }
  }, [navigate, statusFilter, dateFilter, search]);

  useEffect(() => {
    loadBookings();

    return () => {
      requestIdRef.current += 1;
    };
  }, [loadBookings, refreshKey]);

  const summary = useMemo(() => {
    const counts = {
      total: bookings.length,
      reserved: 0,
      checked_in: 0,
      completed: 0,
      cancelled: 0,
      no_show: 0,
    };

    bookings.forEach((booking) => {
      const status = normalizeStatus(booking.status);

      if (Object.prototype.hasOwnProperty.call(counts, status)) {
        counts[status] += 1;
      }
    });

    return counts;
  }, [bookings]);

  function clearFilters() {
    setSearch("");
    setStatusFilter("all");
    setDateFilter("");
  }

  return (
    <div className="admin-bookings-page">
      <main className="admin-bookings-main">
        <section className="admin-bookings-heading">
          <div>
            <p className="admin-bookings-eyebrow">BOOKING CSTU / ADMIN</p>
            <h1>จัดการการจอง</h1>
            <p className="admin-bookings-subtitle">
              ตรวจสอบรายการจองห้องประชุมจากฐานข้อมูล
            </p>
          </div>

          <button
            type="button"
            className="admin-bookings-refresh"
            onClick={() => setRefreshKey((value) => value + 1)}
            disabled={loading}
          >
            {loading ? "กำลังโหลด..." : "รีเฟรชข้อมูล"}
          </button>
        </section>

        {error && (
          <div className="admin-bookings-alert error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={loadBookings}>
              ลองอีกครั้ง
            </button>
          </div>
        )}

        {notice && (
          <div className="admin-bookings-alert success" role="status">
            {notice}
          </div>
        )}

        <section className="admin-bookings-summary">
          <article className="admin-bookings-summary-card">
            <span>รายการที่พบ</span>
            <strong>{summary.total}</strong>
            <small>ตามเงื่อนไขที่เลือก</small>
          </article>

          <article className="admin-bookings-summary-card">
            <span>Reserved</span>
            <strong>{summary.reserved}</strong>
            <small>รายการจองที่ยังอยู่ในสถานะ Reserved</small>
          </article>

          <article className="admin-bookings-summary-card">
            <span>Completed</span>
            <strong>{summary.completed}</strong>
            <small>รายการที่เสร็จสิ้น</small>
            </article>

            <article className="admin-bookings-summary-card">
            <span>Cancelled</span>
            <strong>{summary.cancelled}</strong>
            <small>รายการที่ยกเลิก</small>
            </article>
        </section>

        <section className="admin-bookings-panel">
          <div className="admin-bookings-panel-heading">
            <div>
              <h2>รายการจองทั้งหมด</h2>
              <p>ค้นหาและกรองรายการตามข้อมูลที่ต้องการ</p>
            </div>

            <span className="admin-bookings-count">
              {bookings.length} รายการ
            </span>
          </div>

          <div className="admin-bookings-filters">
            <label className="admin-bookings-search">
              <span>ค้นหา</span>
              <input
                type="search"
                placeholder="ชื่อผู้จอง รหัสผู้ใช้ หรือชื่อห้อง"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <label>
              <span>สถานะ</span>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label>
              <span>วันที่จอง</span>
              <input
                type="date"
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value)}
              />
            </label>

            <button
              type="button"
              className="admin-bookings-clear"
              onClick={clearFilters}
            >
              ล้างตัวกรอง
            </button>
          </div>

          <div className="admin-bookings-table-wrap">
            <table className="admin-bookings-table">
              <thead>
                <tr>
                  <th>รหัสจอง</th>
                  <th>ผู้จอง</th>
                  <th>ห้อง</th>
                  <th>วันที่จอง</th>
                  <th>เวลา</th>
                  <th>สถานะ</th>
                  <th>รายละเอียด</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" className="admin-bookings-empty">
                      กำลังโหลดรายการจอง...
                    </td>
                  </tr>
                ) : bookings.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="admin-bookings-empty">
                      ไม่พบรายการจองตามเงื่อนไขที่เลือก
                    </td>
                  </tr>
                ) : (
                  bookings.map((booking, index) => {
                    const status = normalizeStatus(booking.status);
                    const isKnownStatus = VALID_STATUSES.includes(status);

                    return (
                      <tr
                        key={
                          booking.booking_id ??
                          `${getBookingDateValue(booking)}-${booking.user_id}-${index}`
                        }
                      >
                        <td>
                          <strong className="admin-bookings-id">
                            #{booking.booking_id ?? "-"}
                          </strong>
                        </td>

                        <td>
                          <div className="admin-bookings-user">
                            <strong>{getUserDisplayName(booking)}</strong>
                            <small>
                              {booking.username ||
                                booking.tu_id ||
                                `User ID: ${booking.user_id ?? "-"}`}
                            </small>
                          </div>
                        </td>

                        <td>
                          <div className="admin-bookings-room">
                            <strong>{getRoomDisplayName(booking)}</strong>
                            <small>
                              {booking.room_code ||
                                `Room ID: ${booking.room_id ?? "-"}`}
                            </small>
                          </div>
                        </td>

                        <td>{formatDate(getBookingDateValue(booking))}</td>

                        <td>
                          {formatTime(booking.start_time)} –{" "}
                          {formatTime(booking.end_time)}
                        </td>

                        <td>
                          <span
                            className={`admin-bookings-status status-${
                              isKnownStatus ? status : "unknown"
                            }`}
                          >
                            {getStatusLabel(booking.status)}
                          </span>
                        </td>

                        <td>
                          <button
                            type="button"
                            className="admin-bookings-detail-button"
                            onClick={() => setSelectedBooking(booking)}
                          >
                            ดูรายละเอียด
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="admin-bookings-table-footer">
            <span>แสดง {bookings.length} รายการตามตัวกรองปัจจุบัน</span>

            <button
              type="button"
              onClick={() => setRefreshKey((value) => value + 1)}
              disabled={loading}
            >
              โหลดข้อมูลใหม่
            </button>
          </div>
        </section>
      </main>

      {selectedBooking && (
        <div
          className="admin-bookings-modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedBooking(null);
            }
          }}
        >
          <section
            className="admin-bookings-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="admin-bookings-modal-title"
          >
            <div className="admin-bookings-modal-heading">
              <div>
                <p>BOOKING DETAILS</p>
                <h2 id="admin-bookings-modal-title">
                  รายละเอียดการจอง #{selectedBooking.booking_id}
                </h2>
              </div>

              <button
                type="button"
                className="admin-bookings-modal-close"
                onClick={() => setSelectedBooking(null)}
                aria-label="ปิดหน้าต่าง"
              >
                ×
              </button>
            </div>

            <div className="admin-bookings-detail-grid">
              <div>
                <span>ชื่อผู้จอง</span>
                <strong>{getUserDisplayName(selectedBooking)}</strong>
              </div>

              <div>
                <span>รหัสผู้ใช้</span>
                <strong>
                  {selectedBooking.tu_id ||
                    selectedBooking.username ||
                    selectedBooking.user_id ||
                    "-"}
                </strong>
              </div>

              <div>
                <span>ห้อง</span>
                <strong>{getRoomDisplayName(selectedBooking)}</strong>
              </div>

              <div>
                <span>วันที่จอง</span>
                <strong>
                  {formatDate(getBookingDateValue(selectedBooking))}
                </strong>
              </div>

              <div>
                <span>เวลาเริ่มต้น</span>
                <strong>{formatTime(selectedBooking.start_time)}</strong>
              </div>

              <div>
                <span>เวลาสิ้นสุด</span>
                <strong>{formatTime(selectedBooking.end_time)}</strong>
              </div>

              <div>
                <span>สถานะ</span>
                <strong>{getStatusLabel(selectedBooking.status)}</strong>
              </div>

              <div>
                <span>วัตถุประสงค์</span>
                <strong>{selectedBooking.purpose || "ไม่ได้ระบุ"}</strong>
              </div>

              <div>
                <span>วันที่สร้างรายการ</span>
                <strong>{formatDateTime(selectedBooking.created_at)}</strong>
              </div>
            </div>

            <div className="admin-bookings-modal-actions">
              <button
                type="button"
                onClick={() => setSelectedBooking(null)}
              >
                ปิด
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
