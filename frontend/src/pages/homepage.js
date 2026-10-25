import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../css/homepage.css";
import Navbar from "../components/navbar";

const API_BASE_URL = "http://localhost:5001";
const STORAGE_USER_KEY = "user";
const STORAGE_TOKEN_KEY = "token";

function localISODate(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
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
    hourCycle: "h23",
  }).formatToParts(new Date());

  const values = {};

  parts.forEach((part) => {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  });

  return `${values.year}-${values.month}-${values.day} ${values.hour}:${values.minute}:${values.second}`;
}

function getBangkokDate() {
  return getBangkokDateTime().slice(0, 10);
}

function isWeekendDate(value) {
  if (!value) return false;

  const day = new Date(`${value}T00:00:00Z`).getUTCDay();

  return day === 0 || day === 6;
}

function roomName(room) {
  return (
    room.room_name ??
    room.name ??
    room.roomName ??
    "ไม่ระบุชื่อห้อง"
  );
}

function roomFloor(room) {
  const raw =
    room.floor ??
    room.floor_number ??
    room.floorNumber ??
    room.building_floor;

  if (raw === undefined || raw === null || raw === "") {
    return "";
  }

  const match = String(raw).match(/[123]/);

  return match ? match[0] : String(raw);
}

function roomCapacity(room) {
  return (
    room.capacity ??
    room.room_capacity ??
    room.people_capacity ??
    "ไม่ระบุ"
  );
}

function roomDescription(room) {
  const value =
    room.description ??
    room.facilities ??
    room.equipment ??
    room.detail;

  return Array.isArray(value)
    ? value.join(", ")
    : value || "ไม่มีรายละเอียดเพิ่มเติม";
}

function thaiDate(value) {
  if (!value) return "เลือกวันที่ต้องการจอง";

  const date = new Date(`${value}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return "เลือกวันที่ต้องการจอง";
  }

  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value)
    .slice(0, 5)
    .split(":")
    .map(Number);

  return hours * 60 + minutes;
}

function makeBookingTimes() {
  return Array.from({ length: 33 }, (_, index) => {
    const value = 8 * 60 + index * 15;

    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(
      value % 60
    ).padStart(2, "0")}`;
  });
}

function getAvailableStartTimes(date) {
  const now = getBangkokDateTime();
  const today = now.slice(0, 10);

  if (!date || date < today || isWeekendDate(date)) {
    return [];
  }

  return makeBookingTimes().filter((time) => {
    const minutes = timeToMinutes(time);

    if (minutes >= 16 * 60) return false;

    if (date === today) {
      return `${date} ${time}:00` > now;
    }

    return true;
  });
}

function getAvailableEndTimes(date, startTime) {
  const startMinutes = timeToMinutes(startTime);
  const now = getBangkokDateTime();
  const today = now.slice(0, 10);

  return makeBookingTimes().filter((time) => {
    const endMinutes = timeToMinutes(time);
    const duration = endMinutes - startMinutes;

    if (duration < 60 || duration > 120) {
      return false;
    }

    if (endMinutes > 16 * 60) {
      return false;
    }

    if (date === today && `${date} ${time}:00` <= now) {
      return false;
    }

    return true;
  });
}

function getTimelineSegment(booking) {
  const openMinutes = 8 * 60;
  const closeMinutes = 16 * 60;

  const startMinutes = timeToMinutes(
    booking.start_time || "08:00"
  );

  const endMinutes = timeToMinutes(
    booking.end_time || "08:00"
  );

  const start = Math.max(
    openMinutes,
    Math.min(startMinutes, closeMinutes)
  );

  const end = Math.max(
    start,
    Math.min(endMinutes, closeMinutes)
  );

  return {
    left: `${
      ((start - openMinutes) / (closeMinutes - openMinutes)) * 100
    }%`,
    width: `${
      ((end - start) / (closeMinutes - openMinutes)) * 100
    }%`,
  };
}

function Homepage() {
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [refreshRooms, setRefreshRooms] = useState(0);

  const [roomStatus, setRoomStatus] = useState({
    message: "กำลังโหลดข้อมูลห้อง...",
    type: "info",
  });

  const [floor, setFloor] = useState("all");
  const [dateFilter, setDateFilter] = useState(getBangkokDate());
  const [search, setSearch] = useState("");

  const [selectedRoom, setSelectedRoom] = useState(null);
  const [bookingDate, setBookingDate] = useState(getBangkokDate());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("09:00");
  const [purpose, setPurpose] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [saving, setSaving] = useState(false);
  const [clockTick, setClockTick] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setClockTick((value) => value + 1);
    }, 15000);

    return () => clearInterval(timer);
  }, []);

  const availableStartTimes = useMemo(
    () => getAvailableStartTimes(bookingDate),
    [bookingDate, clockTick]
  );

  const availableEndTimes = useMemo(
    () => getAvailableEndTimes(bookingDate, startTime),
    [bookingDate, startTime, clockTick]
  );

  useEffect(() => {
    try {
      const storedUser = JSON.parse(
        localStorage.getItem(STORAGE_USER_KEY) || "null"
      );

      if (!storedUser) {
        navigate("/", { replace: true });
        return;
      }

      setUser(storedUser);
    } catch (error) {
      console.error("Unable to read stored user:", error);

      localStorage.removeItem(STORAGE_USER_KEY);
      localStorage.removeItem(STORAGE_TOKEN_KEY);

      navigate("/", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!user) return undefined;

    if (!user.user_id) {
      setRooms([]);
      setRoomStatus({
        message: "ไม่พบรหัสผู้ใช้ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่",
        type: "error",
      });

      return undefined;
    }

    const controller = new AbortController();
    const token = localStorage.getItem(STORAGE_TOKEN_KEY);
    const date = dateFilter || getBangkokDate();

    const headers = {
      "x-user-id": String(user.user_id),
    };

    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    fetch(
      `${API_BASE_URL}/api/rooms?date=${encodeURIComponent(date)}`,
      {
        method: "GET",
        headers,
        signal: controller.signal,
      }
    )
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data.message ||
              data.error ||
              `โหลดข้อมูลห้องไม่สำเร็จ (HTTP ${response.status})`
          );
        }

        return data;
      })
      .then((data) => {
        const loadedRooms = Array.isArray(data)
          ? data
          : Array.isArray(data.rooms)
            ? data.rooms
            : [];

        setRooms(loadedRooms);

        setRoomStatus(
          loadedRooms.length > 0
            ? {
                message: "เลือกวันที่และตรวจสอบรายละเอียดก่อนทำการจอง",
                type: "info",
              }
            : {
                message:
                  "ไม่พบข้อมูลห้องที่แสดงได้ กรุณาตรวจสอบข้อมูลใน rooms.sql และฐานข้อมูล",
                type: "empty",
              }
        );
      })
      .catch((error) => {
        if (error.name === "AbortError") return;

        console.error("Unable to load rooms:", error);
        setRooms([]);

        setRoomStatus({
          message: error.message || "ไม่สามารถโหลดข้อมูลห้องได้",
          type: "error",
        });
      });

    return () => controller.abort();
  }, [user, dateFilter, refreshRooms]);

  useEffect(() => {
    if (!selectedRoom) return;

    if (availableStartTimes.length === 0) {
      setBookingError(
        "ไม่มีเวลาเหลือให้จองในวันที่เลือก กรุณาเลือกวันอื่น"
      );
      return;
    }

    const validStart = availableStartTimes.includes(startTime)
      ? startTime
      : availableStartTimes[0];

    if (validStart !== startTime) {
      setStartTime(validStart);
    }

    const endOptions = getAvailableEndTimes(
      bookingDate,
      validStart
    );

    const validEnd = endOptions.includes(endTime)
      ? endTime
      : endOptions[0];

    if (validEnd && validEnd !== endTime) {
      setEndTime(validEnd);
    }

    if (validEnd) {
      setBookingError("");
    }
  }, [
    selectedRoom,
    bookingDate,
    availableStartTimes,
    startTime,
    endTime,
    clockTick,
  ]);

  const filteredRooms = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th-TH");

    return rooms.filter(
      (room) =>
        (floor === "all" || roomFloor(room) === floor) &&
        roomName(room).toLocaleLowerCase("th-TH").includes(query)
    );
  }, [rooms, floor, search]);

  const groupedRooms = useMemo(() => {
    const grouped = new Map();

    filteredRooms.forEach((room) => {
      const key = roomFloor(room) || "อื่น ๆ";

      if (!grouped.has(key)) {
        grouped.set(key, []);
      }

      grouped.get(key).push(room);
    });

    return [...grouped.entries()].sort(([a], [b]) => {
      if (a === "อื่น ๆ") return 1;
      if (b === "อื่น ๆ") return -1;

      return Number(a) - Number(b);
    });
  }, [filteredRooms]);

  function openBooking(room) {
    const date = dateFilter || getBangkokDate();
    const starts = getAvailableStartTimes(date);
    const start = starts[0] || "";
    const ends = start ? getAvailableEndTimes(date, start) : [];
    const end = ends[0] || "";

    setSelectedRoom(room);
    setBookingDate(date);
    setStartTime(start);
    setEndTime(end);
    setPurpose("");
    setBookingError(
      starts.length === 0
        ? "ไม่มีเวลาเหลือให้จองในวันที่เลือก กรุณาเลือกวันอื่น"
        : ""
    );
  }

  function closeBooking() {
    setSelectedRoom(null);
    setBookingError("");
  }

  function handleBookingDateChange(value) {
    setBookingDate(value);

    if (!value) {
      setBookingError("กรุณาเลือกวันที่จอง");
      return;
    }

    if (value < getBangkokDate()) {
      setBookingError("ไม่สามารถจองวันที่ผ่านมาแล้วได้");
      return;
    }

    if (isWeekendDate(value)) {
      setBookingError(
        "ไม่สามารถจองห้องในวันเสาร์–อาทิตย์ได้ กรุณาเลือกวันจันทร์–ศุกร์"
      );
      return;
    }

    const starts = getAvailableStartTimes(value);

    if (starts.length === 0) {
      setBookingError(
        "ไม่มีเวลาเหลือให้จองในวันที่เลือก กรุณาเลือกวันอื่น"
      );
      return;
    }

    const start = starts[0];
    const ends = getAvailableEndTimes(value, start);

    setStartTime(start);
    setEndTime(ends[0] || "");
    setBookingError("");
  }

  function updateStartTime(value) {
    setStartTime(value);

    const ends = getAvailableEndTimes(bookingDate, value);
    const nextEnd = ends.includes(endTime) ? endTime : ends[0];

    setEndTime(nextEnd || "");
    setBookingError("");
  }

  function updateEndTime(value) {
    setEndTime(value);
    setBookingError("");
  }

  async function submitBooking(event) {
    event.preventDefault();

    if (saving) return;

    if (!user?.user_id || !selectedRoom) {
      setBookingError(
        "ไม่พบรหัสผู้ใช้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง"
      );
      return;
    }

    if (!bookingDate || bookingDate < getBangkokDate()) {
      setBookingError("ไม่สามารถจองวันที่ผ่านมาแล้วได้");
      return;
    }

    if (isWeekendDate(bookingDate)) {
      setBookingError(
        "ไม่สามารถจองห้องในวันเสาร์–อาทิตย์ได้ กรุณาเลือกวันจันทร์–ศุกร์"
      );
      return;
    }

    if (!startTime || !endTime) {
      setBookingError("กรุณาเลือกเวลาเริ่มต้นและเวลาสิ้นสุด");
      return;
    }

    const now = getBangkokDateTime();
    const requestedStart = `${bookingDate} ${startTime}:00`;

    if (requestedStart <= now) {
      setBookingError(
        "เวลาเริ่มต้นผ่านไปแล้ว กรุณาเลือกเวลาใหม่"
      );
      return;
    }

    const start = timeToMinutes(startTime);
    const end = timeToMinutes(endTime);
    const duration = end - start;

    if (start < 8 * 60 || end > 16 * 60) {
      setBookingError("สามารถจองได้เฉพาะเวลา 08:00–16:00 น.");
      return;
    }

    if (duration < 60 || duration > 120) {
      setBookingError("ระยะเวลาจองต้องอยู่ระหว่าง 1–2 ชั่วโมง");
      return;
    }

    setSaving(true);
    setBookingError("");

    try {
      const headers = {
        "Content-Type": "application/json",
        "x-user-id": String(user.user_id),
      };

      const token = localStorage.getItem(STORAGE_TOKEN_KEY);

      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const response = await fetch(`${API_BASE_URL}/api/bookings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          user_id: user.user_id,
          room: roomName(selectedRoom),
          date: bookingDate,
          start_time: startTime,
          end_time: endTime,
          purpose: purpose.trim(),
        }),
      });

      const result = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          result.message ||
            result.error ||
            "จองห้องไม่สำเร็จ กรุณาลองใหม่"
        );
      }

      setDateFilter(bookingDate);
      setRefreshRooms((value) => value + 1);
      closeBooking();

      window.alert(result.message || "จองห้องสำเร็จ");
    } catch (error) {
      console.error("Booking error:", error);

      setBookingError(
        error.message || "เกิดข้อผิดพลาดในการจอง กรุณาลองใหม่"
      );
    } finally {
      setSaving(false);
    }
  }

  if (!user) {
    return (
      <div className="booking-app">
        <Navbar />
        <main className="page-content">
          <p>กำลังตรวจสอบการเข้าสู่ระบบ...</p>
        </main>
      </div>
    );
  }

  return (
    <div className="booking-app">
      <Navbar />

      <main className="page-content">
        <section className="page-heading">
          <div>
            <p className="eyebrow">THAMMASAT UNIVERSITY</p>
            <h1>จองห้อง</h1>
            <p className="page-subtitle">
              อาคารบรรยายเรียนรวม 2 | มหาวิทยาลัยธรรมศาสตร์ ศูนย์รังสิต
            </p>
          </div>

          <div className="heading-mark" aria-hidden="true">
            BOOK
            <br />
            YOUR
            <br />
            ROOM
          </div>
        </section>

        <section className="filter-panel" aria-label="ค้นหาและกรองห้อง">
          <div className="filter-field">
            <label htmlFor="floorFilter">ชั้น</label>
            <select
              id="floorFilter"
              value={floor}
              onChange={(event) => setFloor(event.target.value)}
            >
              <option value="all">ทั้งหมด</option>
              <option value="1">ชั้น 1</option>
              <option value="2">ชั้น 2</option>
              <option value="3">ชั้น 3</option>
            </select>
          </div>

          <div className="filter-field date-filter-field">
            <label htmlFor="bookingDateFilter">วันที่ต้องการจอง</label>
            <input
              id="bookingDateFilter"
              type="date"
              min={getBangkokDate()}
              value={dateFilter}
              onChange={(event) => setDateFilter(event.target.value)}
            />
          </div>

          <div className="filter-field search-field">
            <label htmlFor="roomSearch">ค้นหาห้อง</label>
            <input
              id="roomSearch"
              type="search"
              placeholder="พิมพ์ชื่อห้อง..."
              autoComplete="off"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <button
            type="button"
            id="clearFiltersButton"
            className="button button-light clear-button"
            onClick={() => {
              setFloor("all");
              setDateFilter(getBangkokDate());
              setSearch("");
            }}
          >
            ล้างตัวกรอง
          </button>
        </section>

        <div className="results-heading">
          <div>
            <h2>ห้องทั้งหมด</h2>
            <p id="roomCount" className="muted-text">
              พบ {filteredRooms.length} ห้อง
            </p>
          </div>
        </div>

        <div
          id="statusMessage"
          className={`status-message status-${roomStatus.type}`}
          role="status"
          aria-live="polite"
        >
          {roomStatus.message}
        </div>

        <div id="roomList" className="room-list">
          {groupedRooms.map(([floorNumber, floorRooms]) => (
            <section className="floor-section" key={floorNumber}>
              <div className="floor-heading">
                <h3>
                  {floorNumber === "อื่น ๆ"
                    ? "ห้องอื่น ๆ"
                    : `ชั้น ${floorNumber}`}
                </h3>
              </div>

              <div className="room-grid">
                {floorRooms.map((room) => (
                  <article
                    className="room-card"
                    key={
                      room.room_id ||
                      room.id ||
                      room.room_code ||
                      roomName(room)
                    }
                  >
                    <div className="room-card-top">
                      <span className="room-floor-tag">
                        {floorNumber === "อื่น ๆ"
                          ? "ไม่ระบุชั้น"
                          : `ชั้น ${floorNumber}`}
                      </span>
                    </div>

                    <h4 className="room-name">{roomName(room)}</h4>
                    <p className="room-capacity">
                      รองรับ {roomCapacity(room)} คน
                    </p>
                    <p className="room-description">
                      {roomDescription(room)}
                    </p>

                    <div className="room-hours">
                      <div className="room-hours-heading">
                        <span>เวลาให้บริการ</span>
                        <strong>08:00–16:00 น.</strong>
                      </div>

                      <div
                        className="room-timeline"
                        role="img"
                        aria-label={`${
                          room.bookings?.length || 0
                        } ช่วงเวลาที่ถูกจอง วันที่ ${thaiDate(dateFilter)}`}
                      >
                        {(room.bookings || []).map((booking, index) => (
                          <span
                            key={`${booking.start_time}-${booking.end_time}-${index}`}
                            className="room-timeline-booked"
                            style={getTimelineSegment(booking)}
                            title={`ถูกจอง ${booking.start_time}–${booking.end_time}`}
                          />
                        ))}
                      </div>

                      <div
                        className="room-timeline-labels"
                        aria-hidden="true"
                      >
                        {[
                          "08",
                          "09",
                          "10",
                          "11",
                          "12",
                          "13",
                          "14",
                          "15",
                          "16",
                        ].map((hour) => (
                          <span key={hour}>{hour}:00</span>
                        ))}
                      </div>

                      <div className="room-timeline-legend">
                        <span className="room-timeline-legend-dot" />
                        ช่วงเวลาที่ถูกจอง
                      </div>
                    </div>

                    <button
                      type="button"
                      className="button button-primary button-full book-room-button"
                      onClick={() => openBooking(room)}
                    >
                      จองห้องนี้ <span aria-hidden="true">→</span>
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>

        <footer className="site-footer">
          <p>BOOKING CSTU ROOM · Thammasat University</p>
        </footer>
      </main>

      {selectedRoom && (
        <div
          id="bookingModal"
          className="modal-backdrop"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              closeBooking();
            }
          }}
        >
          <section
            className="booking-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bookingModalTitle"
          >
            <button
              type="button"
              id="closeBookingModal"
              className="modal-close"
              aria-label="ปิดหน้าต่าง"
              onClick={closeBooking}
            >
              ×
            </button>

            <p className="eyebrow">BOOKING DETAILS</p>
            <h2 id="bookingModalTitle">จองห้อง</h2>
            <p id="selectedRoomName" className="selected-room-name">
              {roomName(selectedRoom)}
            </p>

            <form id="bookingForm" onSubmit={submitBooking}>
              <div className="form-field">
                <label htmlFor="bookingUserName">ชื่อผู้จอง</label>
                <input
                  id="bookingUserName"
                  type="text"
                  value={
                    user.displayname_th ||
                    user.displayname_en ||
                    user.name ||
                    ""
                  }
                  readOnly
                />
              </div>

              <div className="form-field">
                <label htmlFor="bookingUsername">Username</label>
                <input
                  id="bookingUsername"
                  type="text"
                  value={user.username || user.tu_id || user.user_id || ""}
                  readOnly
                />
              </div>

              <div className="form-field">
                <label htmlFor="bookingDate">วันที่จอง</label>
                <input
                  id="bookingDate"
                  name="date"
                  type="date"
                  min={getBangkokDate()}
                  value={bookingDate}
                  onChange={(event) =>
                    handleBookingDateChange(event.target.value)
                  }
                  required
                />
              </div>

              <div className="form-row time-select-row">
                <div className="form-field time-select-group">
                  <label>เวลาเริ่มต้น</label>

                  <div className="time-select-pair">
                    <div className="time-select-control">
                      <label htmlFor="startHour">ชั่วโมง</label>
                      <select
                        id="startHour"
                        value={startTime ? startTime.slice(0, 2) : ""}
                        onChange={(event) => {
                          const hour = event.target.value;

                          const nextTime = availableStartTimes.find(
                            (time) => time.slice(0, 2) === hour
                          );

                          if (nextTime) updateStartTime(nextTime);
                        }}
                        required
                        disabled={availableStartTimes.length === 0}
                      >
                        {[
                          ...new Set(
                            availableStartTimes.map((time) =>
                              time.slice(0, 2)
                            )
                          ),
                        ].map((hour) => (
                          <option key={hour} value={hour}>
                            {hour}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="time-select-control">
                      <label htmlFor="startMinute">นาที</label>
                      <select
                        id="startMinute"
                        value={startTime ? startTime.slice(3, 5) : ""}
                        onChange={(event) =>
                          updateStartTime(
                            `${startTime.slice(0, 2)}:${event.target.value}`
                          )
                        }
                        required
                        disabled={availableStartTimes.length === 0}
                      >
                        {availableStartTimes
                          .filter(
                            (time) =>
                              time.slice(0, 2) ===
                              (startTime ? startTime.slice(0, 2) : "")
                          )
                          .map((time) => time.slice(3, 5))
                          .map((minute) => (
                            <option key={minute} value={minute}>
                              {minute}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>

                <div className="form-field time-select-group">
                  <label>เวลาสิ้นสุด</label>

                  <div className="time-select-pair">
                    <div className="time-select-control">
                      <label htmlFor="endHour">ชั่วโมง</label>
                      <select
                        id="endHour"
                        value={endTime ? endTime.slice(0, 2) : ""}
                        onChange={(event) => {
                          const hour = event.target.value;

                          const nextTime = availableEndTimes.find(
                            (time) => time.slice(0, 2) === hour
                          );

                          if (nextTime) updateEndTime(nextTime);
                        }}
                        required
                        disabled={availableEndTimes.length === 0}
                      >
                        {[
                          ...new Set(
                            availableEndTimes.map((time) =>
                              time.slice(0, 2)
                            )
                          ),
                        ].map((hour) => (
                          <option key={hour} value={hour}>
                            {hour}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="time-select-control">
                      <label htmlFor="endMinute">นาที</label>
                      <select
                        id="endMinute"
                        value={endTime ? endTime.slice(3, 5) : ""}
                        onChange={(event) =>
                          updateEndTime(
                            `${endTime.slice(0, 2)}:${event.target.value}`
                          )
                        }
                        required
                        disabled={availableEndTimes.length === 0}
                      >
                        {availableEndTimes
                          .filter(
                            (time) =>
                              time.slice(0, 2) ===
                              (endTime ? endTime.slice(0, 2) : "")
                          )
                          .map((time) => time.slice(3, 5))
                          .map((minute) => (
                            <option key={minute} value={minute}>
                              {minute}
                            </option>
                          ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>

              <div className="form-field">
                <label htmlFor="bookingPurpose">
                  วัตถุประสงค์ (ถ้ามี)
                </label>

                <textarea
                  id="bookingPurpose"
                  name="purpose"
                  rows="3"
                  maxLength="500"
                  placeholder="ระบุวัตถุประสงค์การใช้ห้อง"
                  value={purpose}
                  onChange={(event) => setPurpose(event.target.value)}
                />
              </div>

              <p className="form-note">
                เปิดให้บริการวันจันทร์–ศุกร์ เวลา 08:00–16:00 น.
                โดยสามารถจองได้รอบละ 1–2 ชั่วโมง
              </p>

              {bookingError && (
                <p id="bookingError" className="form-error" role="alert">
                  {bookingError}
                </p>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  id="cancelBookingButton"
                  className="button button-light"
                  onClick={closeBooking}
                >
                  ยกเลิก
                </button>

                <button
                  type="submit"
                  id="submitBookingButton"
                  className="button button-primary"
                  disabled={
                    saving ||
                    availableStartTimes.length === 0 ||
                    !startTime ||
                    !endTime
                  }
                >
                  {saving ? "กำลังบันทึก..." : "ยืนยันการจอง"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

export default Homepage;