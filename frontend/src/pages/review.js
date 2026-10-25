import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../css/homepage.css";
import "../css/review.css";
import Navbar from "../components/navbar";

const USER_KEY = "user";
const TOKEN_KEY = "token";
const API_BASE_URL = "http://localhost:5001";
const ROOMS_ENDPOINT = `${API_BASE_URL}/api/rooms`;
const ROOM_PAGE_SIZE = 5;

const INITIAL_REVIEWS = [
  { id: 1, name: "Nicha.s", date: "2026-10-12", rating: 5, message: "ห้องสะอาด อุปกรณ์ครบ ระบบจองใช้งานได้ดีมากค่ะ การจองก็ไม่ยุ่งยาก", helpful: 12, verified: true, type: "รีวิวการใช้งาน" },
  { id: 2, name: "Ploy_23", date: "2026-10-08", rating: 4, message: "ห้องโอเคค่ะ แต่เครื่องโปรเจกเตอร์เปิดไม่ติดตอนแรก มีเจ้าหน้าที่เข้ามาช่วยแก้ไขให้", helpful: 8, verified: true, type: "รีวิวการใช้งาน" },
  { id: 3, name: "Beammm", date: "2026-10-03", rating: 4, message: "โต๊ะเก้าอี้ใช้งานได้ดี โดยรวมสะดวกมากค่ะ", helpful: 5, verified: true, type: "รีวิวการใช้งาน" },
  { id: 4, name: "Karn", date: "2026-09-28", rating: 3, message: "เสียงในห้องบางจุดยังไม่ค่อยชัด แต่โดยรวมโอเคค่ะ", helpful: 3, verified: true, type: "ข้อเสนอแนะ" },
  { id: 5, name: "Aomchaa", date: "2026-09-25", rating: 5, message: "การจองผ่านเว็บไซต์สะดวกมากค่ะ ได้ห้องตรงตามที่ต้องการ", helpful: 10, verified: true, type: "รีวิวการใช้งาน" },
  { id: 6, name: "Nampetch", date: "2026-09-20", rating: 4, message: "แอร์เย็นดี แต่เสียงจากห้องข้าง ๆ ค่อนข้างดัง มีข้อเสนอแนะเพิ่มเติมค่ะ", helpful: 6, verified: true, type: "ข้อเสนอแนะ" },
  { id: 7, name: "Tee_CSTU", date: "2026-09-15", rating: 5, message: "ขั้นตอนจองเข้าใจง่าย ตรวจสอบเวลาว่างก่อนจองได้ ช่วยวางแผนการใช้งานได้ดี", helpful: 4, verified: true, type: "รีวิวการใช้งาน" },
  { id: 8, name: "Mild", date: "2026-09-11", rating: 2, message: "อยากให้มีรูปอุปกรณ์และรายละเอียดห้องให้ครบกว่านี้ก่อนกดจอง", helpful: 2, verified: true, type: "ข้อเสนอแนะ" },
];

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch (error) {
    console.error("Unable to read stored user:", error);
    return null;
  }
}

function formatThaiDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value || "-";
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getDisplayName(user) {
  return (
    user?.displayname_th ||
    user?.displayname_en ||
    user?.name ||
    user?.username ||
    ""
  );
}

function getUserId(user) {
  return user?.user_id ?? user?.id ?? user?.userId ?? null;
}

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

function getRoomId(room) {
  const id = room?.room_id ?? room?.id;
  return id == null ? "" : String(id);
}

function getRoomName(room) {
  const id = getRoomId(room);
  return (
    room?.room_name ??
    room?.name ??
    room?.roomName ??
    room?.room_number ??
    room?.room_no ??
    `ห้อง ${id}`
  );
}

function getRoomFloor(room) {
  const explicitFloor =
    room?.floor ??
    room?.floor_number ??
    room?.floorNumber ??
    room?.building_floor ??
    room?.buildingFloor;

  if (
    explicitFloor !== undefined &&
    explicitFloor !== null &&
    String(explicitFloor).trim() !== ""
  ) {
    const floor = String(explicitFloor).replace(/[^\d]/g, "");
    return floor || "";
  }

  const roomName = String(
    room?.room_name ??
      room?.name ??
      room?.roomName ??
      room?.room_number ??
      room?.room_no ??
      ""
  );

  const match = roomName.match(/(?:ชั้น|floor)\s*(\d+)/i);
  return match ? match[1] : "";
}

function getRoomImage(room) {
  return (
    room?.image_url ??
    room?.image ??
    room?.photo ??
    room?.picture ??
    room?.thumbnail ??
    ""
  );
}

function getRoomDescription(room) {
  return room?.description ?? room?.detail ?? room?.room_description ?? "";
}

function Stars({ rating }) {
  const value = Math.min(5, Math.max(0, Math.round(Number(rating) || 0)));
  return (
    <>
      {"★".repeat(value)}
      {"☆".repeat(5 - value)}
    </>
  );
}

export default function Review() {
  const navigate = useNavigate();

  const [user, setUser] = useState(() => readStoredUser());

  const [reviews, setReviews] = useState(INITIAL_REVIEWS);
  const [likedReviews, setLikedReviews] = useState(() => new Set());
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("latest");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(5);

  const [modalOpen, setModalOpen] = useState(false);
  const [reviewerName, setReviewerName] = useState("");
  const [selectedRating, setSelectedRating] = useState(0);
  const [feedbackType, setFeedbackType] = useState(
    "รีวิวการใช้งานและข้อเสนอแนะ"
  );
  const [reviewMessage, setReviewMessage] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [toast, setToast] = useState("");

  const [rooms, setRooms] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [roomsError, setRoomsError] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [selectedFloor, setSelectedFloor] = useState("all");
  const [roomSearch, setRoomSearch] = useState("");
  const [roomSort, setRoomSort] = useState("highest");
  const [roomStats, setRoomStats] = useState({});

  const [roomData, setRoomData] = useState(null);
  const [roomLoading, setRoomLoading] = useState(false);
  const [roomError, setRoomError] = useState("");
  const [roomVisible, setRoomVisible] = useState(ROOM_PAGE_SIZE);

  useEffect(() => {
    const storedUser = readStoredUser();

    if (!storedUser) {
      navigate("/", { replace: true });
      return;
    }

    setUser(storedUser);
    setReviewerName(getDisplayName(storedUser));
  }, [navigate]);

  // โหลดห้องตามสิทธิ์ของผู้ใช้จาก API
  useEffect(() => {
    if (!user) {
      setRooms([]);
      setSelectedRoomId("");
      setRoomsLoading(false);
      return undefined;
    }

    const userId = getUserId(user);

    if (userId == null) {
      setRooms([]);
      setSelectedRoomId("");
      setRoomsError("ไม่พบรหัสผู้ใช้ กรุณาออกจากระบบแล้วเข้าสู่ระบบใหม่");
      setRoomsLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const token = localStorage.getItem(TOKEN_KEY);
    const date = getBangkokDate();

    async function loadRooms() {
      setRoomsLoading(true);
      setRoomsError("");

      try {
        const headers = {
          Accept: "application/json",
          "x-user-id": String(userId),
        };

        if (token) headers.Authorization = `Bearer ${token}`;

        const response = await fetch(
          `${ROOMS_ENDPOINT}?date=${encodeURIComponent(date)}`,
          { method: "GET", headers, signal: controller.signal }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.success === false) {
          throw new Error(
            data.message ||
              data.error ||
              `โหลดรายการห้องไม่สำเร็จ (HTTP ${response.status})`
          );
        }

        const list = Array.isArray(data)
          ? data
          : Array.isArray(data.rooms)
            ? data.rooms
            : [];

        setRooms(list);

        // ไม่เลือกห้องอัตโนมัติ ให้ผู้ใช้กด "ดูรีวิวห้องนี้" เอง
        setSelectedRoomId((current) =>
          list.some((room) => getRoomId(room) === current) ? current : ""
        );
      } catch (error) {
        if (error.name === "AbortError") return;

        console.error("Failed to load rooms:", error);
        setRooms([]);
        setSelectedRoomId("");
        setRoomsError(error.message || "ไม่สามารถโหลดรายการห้องได้");
      } finally {
        if (!controller.signal.aborted) setRoomsLoading(false);
      }
    }

    loadRooms();

    return () => controller.abort();
  }, [user]);

  // โหลดคะแนนเฉลี่ย/จำนวนรีวิวของทุกห้อง เพื่อแสดงบนการ์ด
  useEffect(() => {
    if (rooms.length === 0) {
      setRoomStats({});
      return undefined;
    }

    const controller = new AbortController();
    const token = localStorage.getItem(TOKEN_KEY);
    const userId = getUserId(readStoredUser());

    async function loadStats() {
      const entries = await Promise.all(
        rooms.map(async (room) => {
          const id = getRoomId(room);

          try {
            const response = await fetch(
              `${API_BASE_URL}/api/rooms/${encodeURIComponent(id)}/reviews`,
              {
                headers: {
                  Accept: "application/json",
                  ...(userId != null ? { "X-User-Id": String(userId) } : {}),
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                signal: controller.signal,
              }
            );

            const data = await response.json().catch(() => ({}));

            if (!response.ok || data.success === false) return [id, null];

            return [
              id,
              {
                average: Number(data.average_rating) || 0,
                count: Number(data.review_count) || 0,
              },
            ];
          } catch (error) {
            return [id, null];
          }
        })
      );

      if (controller.signal.aborted) return;

      setRoomStats(Object.fromEntries(entries.filter(([, value]) => value)));
    }

    loadStats();

    return () => controller.abort();
  }, [rooms]);

  function getRoomStat(room) {
    const stat = roomStats[getRoomId(room)];
    return {
      average: stat ? stat.average : Number(room?.average_rating) || 0,
      count: stat ? stat.count : Number(room?.review_count) || 0,
    };
  }

  // กรอง + ค้นหา + เรียงลำดับการ์ดห้อง
  const displayRooms = useMemo(() => {
    const query = roomSearch.trim().toLocaleLowerCase("th-TH");

    const list = rooms.filter((room) => {
      const matchesFloor =
        selectedFloor === "all" || getRoomFloor(room) === selectedFloor;
      const matchesSearch = String(getRoomName(room))
        .toLocaleLowerCase("th-TH")
        .includes(query);

      return matchesFloor && matchesSearch;
    });

    return list.sort((a, b) => {
      const statA = getRoomStat(a);
      const statB = getRoomStat(b);

      if (roomSort === "reviews") return statB.count - statA.count;

      if (roomSort === "name") {
        return String(getRoomName(a)).localeCompare(
          String(getRoomName(b)),
          "th"
        );
      }

      return statB.average - statA.average || statB.count - statA.count;
    });
  }, [rooms, roomStats, selectedFloor, roomSearch, roomSort]);

  const selectedRoom = rooms.find((room) => getRoomId(room) === selectedRoomId);

  function handleSelectRoom(id) {
    setSelectedRoomId(id);

    window.setTimeout(() => {
      document
        .getElementById("roomReviewDetail")
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
  }

  // โหลดรีวิวของห้องที่เลือก
  useEffect(() => {
    if (!selectedRoomId) {
      setRoomData(null);
      setRoomError("");
      setRoomLoading(false);
      return undefined;
    }

    const controller = new AbortController();

    async function loadRoomReviews() {
      setRoomLoading(true);
      setRoomError("");
      setRoomData(null);
      setRoomVisible(ROOM_PAGE_SIZE);

      try {
        const token = localStorage.getItem(TOKEN_KEY);
        const userId = getUserId(readStoredUser());

        const response = await fetch(
          `${API_BASE_URL}/api/rooms/${encodeURIComponent(
            selectedRoomId
          )}/reviews`,
          {
            method: "GET",
            headers: {
              Accept: "application/json",
              ...(userId != null ? { "X-User-Id": String(userId) } : {}),
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            signal: controller.signal,
          }
        );

        const data = await response.json().catch(() => ({}));

        if (!response.ok || data.success === false) {
          throw new Error(data.message || "Unable to load room reviews.");
        }

        setRoomData(data);
      } catch (error) {
        if (error.name === "AbortError") return;

        console.error("Failed to load room reviews:", error);
        setRoomData(null);
        setRoomError("ไม่สามารถโหลดรีวิวของห้องนี้ได้");
      } finally {
        if (!controller.signal.aborted) setRoomLoading(false);
      }
    }

    loadRoomReviews();

    return () => controller.abort();
  }, [selectedRoomId]);

  useEffect(() => {
    if (!modalOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") closeModal();
    }

    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [modalOpen]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const averageRating = useMemo(() => {
    if (!reviews.length) return 0;
    return (
      reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length
    );
  }, [reviews]);

  const ratingCounts = useMemo(
    () =>
      [5, 4, 3, 2, 1].map((rating) => ({
        rating,
        count: reviews.filter((review) => review.rating === rating).length,
      })),
    [reviews]
  );

  const filteredReviews = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th-TH");

    const result = reviews.filter((review) => {
      const searchableText =
        `${review.name} ${review.message} ${review.type}`.toLocaleLowerCase(
          "th-TH"
        );

      const matchesSearch = searchableText.includes(query);
      const matchesRating =
        ratingFilter === "all" || String(review.rating) === ratingFilter;

      return matchesSearch && matchesRating;
    });

    return result.sort((a, b) => {
      if (sort === "highest") {
        return b.rating - a.rating || b.date.localeCompare(a.date);
      }

      if (sort === "lowest") {
        return a.rating - b.rating || b.date.localeCompare(a.date);
      }

      if (sort === "helpful") {
        const aHelpful = a.helpful + (likedReviews.has(a.id) ? 1 : 0);
        const bHelpful = b.helpful + (likedReviews.has(b.id) ? 1 : 0);
        return bHelpful - aHelpful;
      }

      return b.date.localeCompare(a.date);
    });
  }, [reviews, search, sort, ratingFilter, likedReviews]);

  const visibleReviews = filteredReviews.slice(0, visibleCount);
  const roomReviews = roomData?.reviews || [];
  const visibleRoomReviews = roomReviews.slice(0, roomVisible);

  function resetVisibleCount() {
    setVisibleCount(5);
  }

  function openModal() {
    setFeedbackError("");
    setReviewerName(getDisplayName(user));
    setSelectedRating(0);
    setFeedbackType("รีวิวการใช้งานและข้อเสนอแนะ");
    setReviewMessage("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setFeedbackError("");
  }

  function handleLike(reviewId) {
    setLikedReviews((previous) => {
      const next = new Set(previous);
      if (next.has(reviewId)) next.delete(reviewId);
      else next.add(reviewId);
      return next;
    });
  }

  function handleSubmit(event) {
    event.preventDefault();

    const name = reviewerName.trim();
    const message = reviewMessage.trim();
    const isReview = feedbackType === "รีวิวการใช้งานและข้อเสนอแนะ";

    if (!name || !message) {
      setFeedbackError("กรุณากรอกชื่อและความคิดเห็น");
      return;
    }

    if (isReview && selectedRating === 0) {
      setFeedbackError("กรุณาเลือกคะแนนก่อนส่งรีวิว");
      return;
    }

    if (isReview) {
      const newReview = {
        id: Date.now(),
        name,
        date: getBangkokDate(),
        rating: selectedRating,
        message,
        helpful: 0,
        verified: false,
        type: feedbackType,
      };

      setReviews((previous) => [newReview, ...previous]);
      setVisibleCount(5);
      setSearch("");
      setRatingFilter("all");
      setSort("latest");
      setToast("เพิ่มรีวิวตัวอย่างแล้ว (ยังไม่ได้บันทึกลงฐานข้อมูล)");
    } else {
      setToast("รับข้อมูลตัวอย่างแล้ว (ยังไม่ได้ส่งไปยังฐานข้อมูล)");
    }

    closeModal();
  }

  return (
    <div className="booking-app review-page">
      <Navbar />

      <main className="page-content">
        <section className="review-hero">
          <div>
            <p className="eyebrow">THAMMASAT UNIVERSITY</p>
            <h1>Review &amp; Feedback</h1>
            <p className="hero-thai">
              ความคิดเห็นของคุณ ช่วยให้บริการของเราดียิ่งขึ้น
            </p>
            <p className="hero-description">
              ขอบคุณทุกรีวิวและข้อเสนอแนะ เพื่อพัฒนาระบบจองห้องให้สะดวกยิ่งขึ้น
            </p>
          </div>

          <div className="hero-mark" aria-hidden="true">
            BETTER
            <br />
            SPACE
            <br />
            <span>BETTER EXPERIENCE</span>
          </div>
        </section>

        <section className="feedback-cta">
          <div className="feedback-cta-icon" aria-hidden="true">
            ✎
          </div>

          <div className="feedback-cta-copy">
            <h2>เขียนรีวิว หรือส่งข้อเสนอแนะ</h2>
            <p>แบ่งปันประสบการณ์หรือแจ้งปัญหา เพื่อให้เราปรับปรุงการให้บริการ</p>
          </div>

          <button
            type="button"
            className="button button-primary"
            onClick={openModal}
          >
            ＋ เขียนรีวิว / ข้อเสนอแนะ
          </button>
        </section>

        <section className="section-block" aria-labelledby="overviewTitle">
          <div className="section-heading">
            <span className="section-icon">★</span>
            <h2 id="overviewTitle">ภาพรวมคะแนนรีวิว</h2>
          </div>

          <div className="overview-grid">
            <article className="panel overall-rating">
              <div className="rating-number">
                <span>{averageRating.toFixed(1)}</span>
                <small>/ 5</small>
              </div>

              <div
                className="stars"
                aria-label={`คะแนนเฉลี่ย ${averageRating.toFixed(1)} จาก 5`}
              >
                <Stars rating={averageRating} />
              </div>

              <p>
                จาก <strong>{reviews.length.toLocaleString("en-US")}</strong>{" "}
                รีวิว
              </p>

              <span className="subtle-note">
                คะแนนจากความคิดเห็นของผู้ใช้งาน
              </span>
            </article>

            <article className="panel rating-distribution">
              <h3>สัดส่วนคะแนน</h3>

              <div className="rating-bars">
                {ratingCounts.map(({ rating, count }) => {
                  const percent = reviews.length
                    ? Math.round((count / reviews.length) * 100)
                    : 0;

                  return (
                    <div className="rating-row" key={rating}>
                      <span>{rating} ดาว</span>

                      <div
                        className="bar-track"
                        role="progressbar"
                        aria-label={`${rating} ดาว`}
                        aria-valuenow={percent}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className="bar-fill"
                          style={{ width: `${percent}%` }}
                        />
                      </div>

                      <strong>{percent}%</strong>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="panel usage-card">
              <div className="usage-icon" aria-hidden="true">
                ♟
              </div>

              <div className="usage-content">
                <h3>จำนวนผู้เข้ามาใช้งาน</h3>

                <div className="usage-number">
                  <span>8,432</span>
                  <small>คน</small>
                </div>

                <p>ในช่วง 1 เดือนที่ผ่านมา</p>

                <span className="usage-trend">
                  ↑ <strong>12%</strong> จากเดือนก่อน
                </span>
              </div>
            </article>
          </div>

          <p className="data-note">
            * สถิติผู้เข้าชมและข้อมูลรีวิวเป็นข้อมูลตัวอย่าง ต้องเชื่อม API
            เพื่อแสดงข้อมูลจริง
          </p>
        </section>

        {/* ===== รีวิวแยกตามห้อง ===== */}
        <section className="section-block" aria-labelledby="roomReviewsTitle">
          <div className="reviews-toolbar room-reviews-toolbar">
            <div className="section-heading">
              <span className="section-icon">🏢</span>
              <h2 id="roomReviewsTitle">รีวิวแยกตามห้อง</h2>
            </div>

            <div className="room-filters">
              <select
                className="room-filter-control"
                aria-label="กรองตามชั้น"
                value={selectedFloor}
                onChange={(event) => setSelectedFloor(event.target.value)}
                disabled={roomsLoading || rooms.length === 0}
              >
                <option value="all">ทุกห้อง</option>
                <option value="1">ชั้น 1</option>
                <option value="2">ชั้น 2</option>
                <option value="3">ชั้น 3</option>
              </select>

              <select
                className="room-filter-control"
                aria-label="เรียงลำดับห้อง"
                value={roomSort}
                onChange={(event) => setRoomSort(event.target.value)}
              >
                <option value="highest">เรียงตาม: คะแนนสูงสุด</option>
                <option value="reviews">เรียงตาม: รีวิวมากที่สุด</option>
                <option value="name">เรียงตาม: ชื่อห้อง</option>
              </select>

              <label className="room-filter-control room-search">
                <input
                  type="search"
                  placeholder="ค้นหาชื่อห้อง..."
                  autoComplete="off"
                  value={roomSearch}
                  onChange={(event) => setRoomSearch(event.target.value)}
                />
                <span aria-hidden="true">⌕</span>
              </label>
            </div>
          </div>

          {roomsLoading && (
            <p className="empty-state">กำลังโหลดรายการห้อง...</p>
          )}

          {!roomsLoading && roomsError && (
            <p className="empty-state" role="alert">
              {roomsError}
            </p>
          )}

          {!roomsLoading && !roomsError && rooms.length === 0 && (
            <p className="empty-state">ยังไม่มีห้องที่คุณมีสิทธิ์ดูรีวิว</p>
          )}

          {!roomsLoading &&
            !roomsError &&
            rooms.length > 0 &&
            displayRooms.length === 0 && (
              <p className="empty-state">ไม่พบห้องที่ตรงกับการค้นหา</p>
            )}

          {!roomsLoading && !roomsError && displayRooms.length > 0 && (
            <div className="room-card-grid">
              {displayRooms.map((room) => {
                const id = getRoomId(room);
                const stat = getRoomStat(room);
                const image = getRoomImage(room);
                const description = getRoomDescription(room);
                const active = selectedRoomId === id;

                return (
                  <article
                    key={id}
                    className={`room-card ${active ? "active" : ""}`}
                  >
                    <div className="room-card-image">
                      {image ? (
                        <img
                          src={image}
                          alt={String(getRoomName(room))}
                          loading="lazy"
                        />
                      ) : (
                        <div
                          className="room-card-placeholder"
                          aria-hidden="true"
                        >
                          🏫
                        </div>
                      )}
                      <span className="room-card-badge">
                        {getRoomName(room)}
                      </span>
                    </div>

                    <h3 className="room-card-title">{getRoomName(room)}</h3>

                    <div className="room-card-rating">
                      <span className="room-card-star" aria-hidden="true">
                        ★
                      </span>
                      <strong>
                        {stat.count > 0 ? stat.average.toFixed(1) : "-"}
                      </strong>
                      <span className="room-card-of">/ 5</span>
                      <span className="room-card-count">
                        ({stat.count} รีวิว)
                      </span>
                    </div>

                    <p className="room-card-desc">
                      {description || "ยังไม่มีรายละเอียดของห้องนี้"}
                    </p>

                    <button
                      type="button"
                      className="room-card-button"
                      aria-pressed={active}
                      onClick={() => handleSelectRoom(id)}
                    >
                      ดูรีวิวห้องนี้ →
                    </button>
                  </article>
                );
              })}
            </div>
          )}

          {/* รายละเอียดรีวิวของห้องที่เลือก */}
          {selectedRoomId && (
            <div id="roomReviewDetail" className="room-review-detail">
              <div className="room-review-detail-head">
                <h3>
                  รีวิวของ {selectedRoom ? getRoomName(selectedRoom) : ""}
                </h3>

                <button
                  type="button"
                  className="button button-light"
                  onClick={() => setSelectedRoomId("")}
                >
                  ปิด ×
                </button>
              </div>

              {roomLoading && (
                <p className="empty-state">กำลังโหลดรีวิวของห้อง...</p>
              )}

              {!roomLoading && roomError && (
                <p className="empty-state" role="alert">
                  {roomError}
                </p>
              )}

              {!roomLoading && roomData && (
                <>
                  <div className="room-summary">
                    <article className="panel room-stat">
                      <span className="room-stat-label">คะแนนเฉลี่ย</span>

                      <div className="room-stat-value">
                        {roomData.review_count > 0
                          ? Number(roomData.average_rating).toFixed(1)
                          : "-"}
                        <small> / 5</small>
                      </div>

                      <div className="stars">
                        <Stars rating={roomData.average_rating} />
                      </div>
                    </article>

                    <article className="panel room-stat">
                      <span className="room-stat-label">จำนวนรีวิว</span>

                      <div className="room-stat-value">
                        {Number(roomData.review_count || 0).toLocaleString(
                          "en-US"
                        )}
                        <small> รีวิว</small>
                      </div>
                    </article>

                    <article className="panel room-stat">
                      <span className="room-stat-label">
                        จำนวนครั้งที่ใช้งาน
                      </span>

                      <div className="room-stat-value">
                        {Number(roomData.usage_count || 0).toLocaleString(
                          "en-US"
                        )}
                        <small> ครั้ง</small>
                      </div>
                    </article>
                  </div>

                  <div className="review-list" aria-live="polite">
                    {visibleRoomReviews.map((review) => (
                      <article className="review-card" key={review.id}>
                        <div className="avatar" aria-hidden="true">
                          {(review.name || "?")
                            .trim()
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div className="review-main">
                          <div className="review-meta">
                            <span className="reviewer-name">{review.name}</span>
                            <span className="verified">✓ เคยจองห้องจริง</span>
                          </div>

                          <p className="review-date">
                            {formatThaiDate(review.date)} · {review.type}
                          </p>

                          {Number(review.rating) >= 1 && (
                            <div
                              className="review-stars"
                              aria-label={`${review.rating} จาก 5 ดาว`}
                            >
                              <Stars rating={review.rating} />
                              <span className="rating-text">
                                {review.rating}/5
                              </span>
                            </div>
                          )}

                          <p className="review-message">{review.message}</p>
                        </div>
                      </article>
                    ))}
                  </div>

                  {roomReviews.length === 0 && (
                    <p className="empty-state">ห้องนี้ยังไม่มีรีวิว</p>
                  )}

                  {roomReviews.length > roomVisible && (
                    <button
                      type="button"
                      className="button button-light load-more"
                      onClick={() =>
                        setRoomVisible((count) => count + ROOM_PAGE_SIZE)
                      }
                    >
                      แสดงรีวิวเพิ่มเติม
                    </button>
                  )}
                </>
              )}
            </div>
          )}
        </section>

        <section className="section-block" aria-labelledby="reviewsTitle">
          <div className="reviews-toolbar">
            <div className="section-heading">
              <span className="section-icon">▣</span>
              <h2 id="reviewsTitle">รีวิวจากผู้ใช้งาน</h2>
            </div>

            <div className="review-controls">
              <label className="search-box" htmlFor="reviewSearch">
                <span aria-hidden="true">⌕</span>

                <input
                  id="reviewSearch"
                  type="search"
                  placeholder="ค้นหารีวิว..."
                  autoComplete="off"
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    resetVisibleCount();
                  }}
                />
              </label>

              <label className="sort-control" htmlFor="reviewSort">
                <span className="sr-only">เรียงรีวิว</span>

                <select
                  id="reviewSort"
                  value={sort}
                  onChange={(event) => {
                    setSort(event.target.value);
                    resetVisibleCount();
                  }}
                >
                  <option value="latest">ล่าสุด</option>
                  <option value="highest">คะแนนสูงสุด</option>
                  <option value="lowest">คะแนนต่ำสุด</option>
                  <option value="helpful">มีประโยชน์มากที่สุด</option>
                </select>
              </label>

              <label className="rating-filter" htmlFor="ratingFilter">
                <span className="sr-only">กรองตามคะแนน</span>

                <select
                  id="ratingFilter"
                  value={ratingFilter}
                  onChange={(event) => {
                    setRatingFilter(event.target.value);
                    resetVisibleCount();
                  }}
                >
                  <option value="all">ทุกคะแนน</option>
                  <option value="5">5 ดาว</option>
                  <option value="4">4 ดาว</option>
                  <option value="3">3 ดาว</option>
                  <option value="2">2 ดาว</option>
                  <option value="1">1 ดาว</option>
                </select>
              </label>
            </div>
          </div>

          <div className="review-list" aria-live="polite">
            {visibleReviews.map((review) => {
              const liked = likedReviews.has(review.id);

              return (
                <article className="review-card" key={review.id}>
                  <div className="avatar" aria-hidden="true">
                    {(review.name || "?").trim().charAt(0).toUpperCase()}
                  </div>

                  <div className="review-main">
                    <div className="review-meta">
                      <span className="reviewer-name">{review.name}</span>

                      {review.verified && (
                        <span className="verified">✓ เคยจองห้องจริง</span>
                      )}
                    </div>

                    <p className="review-date">
                      {formatThaiDate(review.date)} · {review.type}
                    </p>

                    <div
                      className="review-stars"
                      aria-label={`${review.rating} จาก 5 ดาว`}
                    >
                      <Stars rating={review.rating} />
                      <span className="rating-text">{review.rating}/5</span>
                    </div>

                    <p className="review-message">{review.message}</p>

                    <div className="review-actions">
                      <button
                        type="button"
                        className={`action-button ${liked ? "liked" : ""}`}
                        aria-pressed={liked}
                        onClick={() => handleLike(review.id)}
                      >
                        {liked ? "♥" : "♡"} มีประโยชน์{" "}
                        {review.helpful + (liked ? 1 : 0)}
                      </button>
                    </div>
                  </div>

                  <span className="review-status">✓ ยืนยันแล้ว</span>
                </article>
              );
            })}
          </div>

          {filteredReviews.length === 0 && (
            <p className="empty-state">ไม่พบรีวิวที่ตรงกับการค้นหา</p>
          )}

          {filteredReviews.length > visibleCount && (
            <button
              type="button"
              className="button button-light load-more"
              onClick={() => setVisibleCount((count) => count + 5)}
            >
              แสดงรีวิวเพิ่มเติม
            </button>
          )}
        </section>

        <footer className="site-footer">
          <p>BOOKING CSTU ROOM · Thammasat University</p>
        </footer>
      </main>

      {modalOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            className="feedback-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedbackModalTitle"
          >
            <button
              type="button"
              className="modal-close"
              aria-label="ปิดหน้าต่าง"
              onClick={closeModal}
            >
              ×
            </button>

            <p className="eyebrow">YOUR FEEDBACK MATTERS</p>
            <h2 id="feedbackModalTitle">เขียนรีวิว / ข้อเสนอแนะ</h2>

            <p className="modal-description">
              แบ่งปันความคิดเห็นของคุณเกี่ยวกับระบบ BookingCSTU
            </p>

            <form onSubmit={handleSubmit}>
              <div className="form-field">
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

              <fieldset className="rating-field">
                <legend>ให้คะแนนความพึงพอใจ</legend>

                <div
                  className="star-picker"
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

                <span className="field-hint">
                  {selectedRating
                    ? `${selectedRating} จาก 5 ดาว`
                    : "เลือกคะแนน 1–5 ดาว"}
                </span>
              </fieldset>

              <div className="form-field">
                <label htmlFor="feedbackType">ประเภทความคิดเห็น</label>

                <select
                  id="feedbackType"
                  name="feedbackType"
                  value={feedbackType}
                  onChange={(event) => setFeedbackType(event.target.value)}
                >
                  <option value="รีวิวการใช้งานและข้อเสนอแนะ">
                    รีวิวการใช้งานและข้อเสนอแนะ
                  </option>
                  <option value="แจ้งปัญหา">แจ้งปัญหา</option>
                </select>
              </div>

              <div className="form-field">
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
                <p className="form-error" role="alert">
                  {feedbackError}
                </p>
              )}

              <p className="form-note">
                ฟอร์มนี้เป็นตัวอย่าง ข้อมูลยังไม่ได้บันทึกลงฐานข้อมูล
              </p>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-light"
                  onClick={closeModal}
                >
                  ยกเลิก
                </button>

                <button type="submit" className="button button-primary">
                  ส่งความคิดเห็น
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {toast && (
        <div className="toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}
    </div>
  );
}
