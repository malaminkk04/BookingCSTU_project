import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../css/homepage.css";

const API_BASE_URL = "http://localhost:5001";
const STORAGE_USER_KEY = "user";
const STORAGE_TOKEN_KEY = "token";
const [refreshRooms, setRefreshRooms] = useState(0);

function isWeekendDate(value) {
  if (!value) return false;

  const day = new Date(`${value}T00:00:00`).getDay();
  return day === 0 || day === 6;
}

function localISODate(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function roomName(room) {
  return room.room_name ?? room.name ?? room.roomName ?? "ไม่ระบุชื่อห้อง";
}

function roomFloor(room) {
  const raw = room.floor ?? room.floor_number ?? room.floorNumber ?? room.building_floor;
  if (raw === undefined || raw === null || raw === "") return "";
  const match = String(raw).match(/[123]/);
  return match ? match[0] : String(raw);
}

function roomCapacity(room) {
  return room.capacity ?? room.room_capacity ?? room.people_capacity ?? "ไม่ระบุ";
}

function roomDescription(room) {
  const value = room.description ?? room.facilities ?? room.equipment ?? room.detail;
  return Array.isArray(value) ? value.join(", ") : value || "ไม่มีรายละเอียดเพิ่มเติม";
}

function thaiDate(value) {
  if (!value) return "เลือกวันที่ต้องการจอง";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "เลือกวันที่ต้องการจอง";
  return new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "long", year: "numeric" }).format(date);
}

function timeToMinutes(value) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

function getTimelineSegment(booking) {
  const openMinutes = 9 * 60;
  const closeMinutes = 16 * 60;
  const startMinutes = timeToMinutes(String(booking.start_time || "09:00").slice(0, 5));
  const endMinutes = timeToMinutes(String(booking.end_time || "09:00").slice(0, 5));
  const start = Math.max(openMinutes, Math.min(startMinutes, closeMinutes));
  const end = Math.max(start, Math.min(endMinutes, closeMinutes));

  return {
    left: `${((start - openMinutes) / (closeMinutes - openMinutes)) * 100}%`,
    width: `${((end - start) / (closeMinutes - openMinutes)) * 100}%`
  };
}

function Homepage() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [roomStatus, setRoomStatus] = useState({ message: "กำลังโหลดข้อมูลห้อง...", type: "info" });
  const [floor, setFloor] = useState("all");
  const [dateFilter, setDateFilter] = useState(localISODate());
  const [search, setSearch] = useState("");
  const [profileOpen, setProfileOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [bookingDate, setBookingDate] = useState(localISODate());
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [purpose, setPurpose] = useState("");
  const [bookingError, setBookingError] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_USER_KEY) || "null");
      if (!stored) {
        navigate("/", { replace: true });
        return;
      }
      setUser(stored);
    } catch (error) {
      console.error("Unable to read stored user:", error);
      localStorage.removeItem(STORAGE_USER_KEY);
      localStorage.removeItem(STORAGE_TOKEN_KEY);
      navigate("/", { replace: true });
    }
  }, [navigate]);

  useEffect(() => {
    if (!user) return undefined;
    const controller = new AbortController();
    const headers = {};
    const token = localStorage.getItem(STORAGE_TOKEN_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;

    const date = dateFilter || localISODate();
    fetch(`${API_BASE_URL}/api/rooms?date=${encodeURIComponent(date)}`, { headers, signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then(data => {
        const loadedRooms = Array.isArray(data) ? data : Array.isArray(data.rooms) ? data.rooms : [];
        setRooms(loadedRooms);
        setRoomStatus(loadedRooms.length
          ? { message: "เลือกวันที่และตรวจสอบรายละเอียดก่อนทำการจอง", type: "info" }
          : { message: "ไม่พบข้อมูลห้อง", type: "empty" });
      })
      .catch(error => {
        if (error.name === "AbortError") return;
        console.error("Unable to load rooms:", error);
        setRoomStatus({
          message: "ไม่สามารถโหลดข้อมูลห้องได้ กรุณาตรวจสอบว่า Backend เปิดอยู่ที่ http://localhost:5001 และ API /api/rooms ใช้งานได้",
          type: "error"
        });
      });

    return () => controller.abort();
  }, [user, dateFilter, refreshRooms]);

  const filteredRooms = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th-TH");
    return rooms.filter(room =>
      (floor === "all" || roomFloor(room) === floor) &&
      roomName(room).toLocaleLowerCase("th-TH").includes(query)
    );
  }, [rooms, floor, search]);

  const groupedRooms = useMemo(() => {
    const grouped = new Map();
    filteredRooms.forEach(room => {
      const key = roomFloor(room) || "อื่น ๆ";
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(room);
    });
    return [...grouped.entries()].sort(([a], [b]) => {
      if (a === "อื่น ๆ") return 1;
      if (b === "อื่น ๆ") return -1;
      return Number(a) - Number(b);
    });
  }, [filteredRooms]);

  function logout() {
    localStorage.removeItem(STORAGE_TOKEN_KEY);
    localStorage.removeItem(STORAGE_USER_KEY);
    navigate("/", { replace: true });
  }

  function openBooking(room) {
    setSelectedRoom(room);
    setBookingDate(dateFilter || localISODate());
    setStartTime("09:00");
    setEndTime("10:00");
    setPurpose("");
    setBookingError("");
  }

  function closeBooking() {
    setSelectedRoom(null);
    setBookingError("");
  }

  async function submitBooking(event) {
    event.preventDefault();
    if (!user?.user_id || !selectedRoom) {
      setBookingError("ไม่พบรหัสผู้ใช้ กรุณาเข้าสู่ระบบใหม่อีกครั้ง");
      return;
    }
    if (!bookingDate || bookingDate < localISODate()) {
        setBookingError("ไม่สามารถจองวันที่ผ่านมาแล้วได้");
        return;
}

    if (isWeekendDate(bookingDate)) {
        setBookingError("ไม่สามารถจองห้องในวันเสาร์–อาทิตย์ได้ กรุณาเลือกวันจันทร์–ศุกร์");
        return;
}
    const weekday = new Date(`${bookingDate}T00:00:00`).getDay();
    if (weekday === 0 || weekday === 6) {
      setBookingError("ระบบเปิดให้จองเฉพาะวันจันทร์–ศุกร์");
      return;
    }
    const duration = timeToMinutes(endTime) - timeToMinutes(startTime);
    if (duration < 60 || duration > 120) {
      setBookingError("ระยะเวลาจองต้องอยู่ระหว่าง 1–2 ชั่วโมง");
      return;
    }

    setSaving(true);
    setBookingError("");
    try {
      const headers = { "Content-Type": "application/json" };
      const token = localStorage.getItem(STORAGE_TOKEN_KEY);
      if (token) headers.Authorization = `Bearer ${token}`;
      const response = await fetch(`${API_BASE_URL}/api/bookings`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          user_id: user.user_id,
          room: roomName(selectedRoom),
          date: bookingDate,
          start_time: startTime,
          end_time: endTime,
          purpose: purpose.trim()
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.message || result.error || "จองห้องไม่สำเร็จ กรุณาลองใหม่");
     setDateFilter(bookingDate);
     setRefreshRooms(value => value + 1);
     closeBooking();
     window.alert(result.message || "จองห้องสำเร็จ");
    } catch (error) {
      console.error("Booking error:", error);
      setBookingError(error.message || "เกิดข้อผิดพลาดในการจอง กรุณาลองใหม่");
    } finally {
      setSaving(false);
    }
  }

  if (!user) return <main className="page-content"><p>กำลังตรวจสอบการเข้าสู่ระบบ...</p></main>;

  return (
    <div className="booking-app">
      <header className="site-header">
        <a className="brand" href="/homepage" aria-label="Booking CSTU Home">
          <img className="brand-logo" src={`${process.env.PUBLIC_URL}/logo.png`} alt="Booking CSTU logo" />
          <span className="brand-copy"><strong>CSTU ROOM BOOKING</strong><small>BOOKING CSTU ROOM</small></span>
        </a>
        <nav className="main-nav" aria-label="เมนูหลัก">
          <button type="button" className="nav-link active" onClick={() => navigate("/homepage")}>HOME</button>
          <button type="button" className="nav-link" onClick={() => navigate("/mybooking")}>MY BOOKING</button>
          <a href={`${process.env.PUBLIC_URL}/Guide.html`} className="nav-link">GUIDE</a>
          <a href={`${process.env.PUBLIC_URL}/Rule.html`} className="nav-link">RULE</a>
          <a href={`${process.env.PUBLIC_URL}/review.html`} className="nav-link">REVIEW</a>
          <div className="profile-menu">
            <button type="button" id="profileButton" className="profile-button" aria-expanded={profileOpen} aria-controls="profilePopup" onClick={() => setProfileOpen(value => !value)}>
              <span>PROFILE</span>
              <span className="chevron" aria-hidden="true">⌄</span>
            </button>
            {profileOpen && (
              <section id="profilePopup" className="profile-popup">
                <h2>ข้อมูลผู้ใช้</h2>
                <dl className="profile-details">
                  <div><dt>ชื่อ</dt><dd>{user.displayname_th || user.displayname_en || "-"}</dd></div>
                  <div><dt>Username</dt><dd>{user.username || "-"}</dd></div>
                  <div><dt>คณะ</dt><dd>{user.faculty || "-"}</dd></div>
                  <div><dt>สาขา</dt><dd>{user.department || user.major || "-"}</dd></div>
                  <div><dt>Email</dt><dd>{user.email || "-"}</dd></div>
                </dl>
                <button type="button" id="logoutButton" className="button button-danger button-full" onClick={logout}>LOGOUT</button>
              </section>
            )}
          </div>
        </nav>
      </header>

      <main className="page-content">
        <section className="page-heading"><div><p className="eyebrow">THAMMASAT UNIVERSITY</p><h1>จองห้อง</h1><p className="page-subtitle">อาคารบรรยายเรียนรวม 2 | มหาวิทยาลัยธรรมศาสตร์ ศูนย์รังสิต </p></div><div className="heading-mark" aria-hidden="true">BOOK<br />YOUR<br />ROOM</div></section>

        <section
          className="filter-panel"
          aria-label="ค้นหาและกรองห้อง"
        >
          <div className="filter-field">
            <label htmlFor="floorFilter">ชั้น</label>
            <select
              id="floorFilter"
              value={floor}
              onChange={event => {
                const value = event.target.value;
                setBookingDate(value);

                if (isWeekendDate(value)) {
                setBookingError("ไม่สามารถจองห้องในวันเสาร์–อาทิตย์ได้ กรุณาเลือกวันจันทร์–ศุกร์");
                } else {
                setBookingError("");
                }
}}
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
              min={localISODate()}
              value={dateFilter}
              onChange={event => setDateFilter(event.target.value)}
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
              onChange={event => setSearch(event.target.value)}
            />
          </div>

          <button
            type="button"
            id="clearFiltersButton"
            className="button button-light clear-button"
            onClick={() => {
              setFloor("all");
              setDateFilter(localISODate());
              setSearch("");
            }}
          >
            ล้างตัวกรอง
          </button>
        </section>

        <div className="results-heading"><div><h2>ห้องทั้งหมด</h2><p id="roomCount" className="muted-text">พบ {filteredRooms.length} ห้อง</p></div></div>
        <div id="statusMessage" className={`status-message status-${roomStatus.type}`} role="status" aria-live="polite">{roomStatus.message}</div>
        <div id="roomList" className="room-list">
          {groupedRooms.map(([floorNumber, floorRooms]) => (
            <section className="floor-section" key={floorNumber}>
              <div className="floor-heading">
                <h3>{floorNumber === "อื่น ๆ" ? "ห้องอื่น ๆ" : `ชั้น ${floorNumber}`}</h3>
              </div>
              <div className="room-grid">
                {floorRooms.map(room => (
                  <article className="room-card" key={room.room_id || room.id || room.room_code}>
                    <div className="room-card-top"><span className="room-floor-tag">{floorNumber === "อื่น ๆ" ? "ไม่ระบุชั้น" : `ชั้น ${floorNumber}`}</span></div>
                    <h4 className="room-name">{roomName(room)}</h4>
                    <p className="room-capacity">รองรับ {roomCapacity(room)} คน</p>
                    <p className="room-description">{roomDescription(room)}</p>
                    <div className="room-hours">
                      <div className="room-hours-heading"><span>เวลาให้บริการ</span><strong>09:00–16:00 น.</strong></div>
                      <div className="room-timeline" role="img" aria-label={`${room.bookings?.length || 0} ช่วงเวลาที่ถูกจอง วันที่ ${thaiDate(dateFilter || localISODate())}`}>
                        {(room.bookings || []).map((booking, index) => (
                          <span
                            key={`${booking.start_time}-${booking.end_time}-${index}`}
                            className="room-timeline-booked"
                            style={getTimelineSegment(booking)}
                            title={`ถูกจอง ${booking.start_time}–${booking.end_time}`}
                          />
                        ))}
                      </div>
                      <div className="room-timeline-labels" aria-hidden="true">
                        {["09", "10", "11", "12", "13", "14", "15", "16"].map(hour => <span key={hour}>{hour}:00</span>)}
                      </div>
                      <div className="room-timeline-legend"><span className="room-timeline-legend-dot" />ช่วงเวลาที่ถูกจอง</div>
                    </div>
                    <button type="button" className="button button-primary button-full book-room-button" onClick={() => openBooking(room)}>จองห้องนี้ <span aria-hidden="true">→</span></button>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
        <footer className="site-footer"><p>BOOKING CSTU ROOM · Thammasat University</p></footer>
      </main>

      {selectedRoom && (
        <div id="bookingModal" className="modal-backdrop" role="presentation" onClick={event => { if (event.target === event.currentTarget) closeBooking(); }}>
          <section className="booking-modal" role="dialog" aria-modal="true" aria-labelledby="bookingModalTitle">
            <button type="button" id="closeBookingModal" className="modal-close" aria-label="ปิดหน้าต่าง" onClick={closeBooking}>×</button>
            <p className="eyebrow">BOOKING DETAILS</p><h2 id="bookingModalTitle">จองห้อง</h2><p id="selectedRoomName" className="selected-room-name">{roomName(selectedRoom)}</p>
            <form id="bookingForm" onSubmit={submitBooking}>
              <div className="form-field"><label htmlFor="bookingUserName">ชื่อผู้จอง</label><input id="bookingUserName" type="text" value={user.displayname_th || user.displayname_en || user.name || ""} readOnly /></div>
              <div className="form-field"><label htmlFor="bookingUsername">Username</label><input id="bookingUsername" type="text" value={user.username || user.student_id || user.user_id || ""} readOnly /></div>
              <div className="form-field"><label htmlFor="bookingDate">วันที่จอง</label><input id="bookingDate" name="date" type="date" min={localISODate()} value={bookingDate} onChange={event => setBookingDate(event.target.value)} required /></div>
              <div className="form-row"><div className="form-field"><label htmlFor="startTime">เวลาเริ่มต้น</label><select id="startTime" name="start_time" value={startTime} onChange={event => { const next = event.target.value; setStartTime(next); const firstAllowed = makeBookingTimes().find(option => timeToMinutes(option) - timeToMinutes(next) >= 60); if (firstAllowed) setEndTime(firstAllowed); }} required>{makeBookingTimes().filter(time => timeToMinutes(time) < 16 * 60).map(time => <option key={time} value={time}>{time} น.</option>)}</select></div><div className="form-field"><label htmlFor="endTime">เวลาสิ้นสุด</label><select id="endTime" name="end_time" value={endTime} onChange={event => setEndTime(event.target.value)} required>{makeBookingTimes().filter(time => { const length = timeToMinutes(time) - timeToMinutes(startTime); return length >= 60 && length <= 120; }).map(time => <option key={time} value={time}>{time} น.</option>)}</select></div></div>
              <div className="form-field"><label htmlFor="bookingPurpose">วัตถุประสงค์ (ถ้ามี)</label><textarea id="bookingPurpose" name="purpose" rows="3" maxLength="500" placeholder="ระบุวัตถุประสงค์การใช้ห้อง" value={purpose} onChange={event => setPurpose(event.target.value)} /></div>
              <p className="form-note">เปิดให้บริการในวันจันทร์–ศุกร์ เวลา 09:00–16:00 น. โดยสามารถใช้งานได้มากสุด 2 ชั่วโมง และน้อยสุด 1 ชั่วโมง ต่อรอบการจอง</p>
              {bookingError ? <p id="bookingError" className="form-error" role="alert">{bookingError}</p> : null}
              <div className="modal-actions"><button type="button" id="cancelBookingButton" className="button button-light" onClick={closeBooking}>ยกเลิก</button><button type="submit" id="submitBookingButton" className="button button-primary" disabled={saving}>{saving ? "กำลังบันทึก..." : "ยืนยันการจอง"}</button></div>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function makeBookingTimes() {
  return Array.from({ length: 15 }, (_, index) => {
  const value = 9 * 60 + index * 15;
    return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
  });
}

export default Homepage;
