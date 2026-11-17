
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "../css/homepage.css";
import "../css/review.css";
import Navbar from "../components/navbar";
import FeedbackTypeFields, { FEEDBACK_TYPES } from "../components/FeedbackTypeFields";
import { validateFeedbackForm } from "../utils/feedback-validation";
import API_BASE_URL, { getApiAssetUrl } from "../services/api";
import RoomImage from "../components/RoomImage";

const USER_KEY = "user";
const TOKEN_KEY = "token";
const ROOMS_ENDPOINT = `${API_BASE_URL}/api/rooms`;
const ROOM_PAGE_SIZE = 5;

function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || "null");
  } catch (error) {
    console.error("Unable to read stored user:", error);
    return null;
  }
}

function getUserId(user) {
  return user?.user_id ?? user?.id ?? user?.userId ?? null;
}

function getBangkokDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function formatThaiDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("th-TH", {
    day: "numeric", month: "short", year: "numeric"
  }).format(date);
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

  const [reviews, setReviews] = useState([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("latest");
  const [ratingFilter, setRatingFilter] = useState("all");
  const [visibleCount, setVisibleCount] = useState(5);
  const [feedbackLoading, setFeedbackLoading] = useState(true);
  const [feedbackLoadError, setFeedbackLoadError] = useState("");
  const [feedbackReload, setFeedbackReload] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedRating, setSelectedRating] = useState(0);
  const [feedbackType, setFeedbackType] = useState(FEEDBACK_TYPES.REVIEW);
  const [feedbackSubject, setFeedbackSubject] = useState("");
  const [feedbackRoomId, setFeedbackRoomId] = useState("");
  const [reviewMessage, setReviewMessage] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
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
  }, [navigate]);

  useEffect(() => {
    if (!user) return undefined;

    const controller = new AbortController();
    const token = localStorage.getItem(TOKEN_KEY);

    async function loadSystemReviews() {
      setFeedbackLoading(true);
      setFeedbackLoadError("");
      try {
        const response = await fetch(`${API_BASE_URL}/api/system-reviews`, {
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {})
          },
          signal: controller.signal
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
          throw new Error(data.message || "ไม่สามารถโหลดรีวิวระบบได้");
        }

        const entries = Array.isArray(data.reviews)
          ? data.reviews
          : Array.isArray(data.data)
            ? data.data
            : [];
        setReviews(entries.filter((review) => review.status !== "hidden"));
      } catch (error) {
        if (error.name === "AbortError") return;
        setReviews([]);
        setFeedbackLoadError(error.message || "ไม่สามารถโหลดรีวิวระบบได้");
      } finally {
        if (!controller.signal.aborted) setFeedbackLoading(false);
      }
    }

    loadSystemReviews();
    return () => controller.abort();
  }, [user, feedbackReload]);

  // โหลดรายการห้องตามสิทธิ์ของผู้ใช้
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
          {
            method: "GET",
            headers,
            signal: controller.signal,
          }
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

  // โหลดคะแนนและจำนวนรีวิวของแต่ละห้อง
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

            const apiReviews = Array.isArray(data.reviews)
              ? data.reviews
              : [];

            return [
              id,
              {
                average: Number(data.average_rating) || 0,
                count: Number(data.review_count) || apiReviews.length,
              },
            ];
          } catch (error) {
            if (error.name !== "AbortError") {
              console.error(`Failed to load review stats for room ${id}:`, error);
            }

            return [id, null];
          }
        })
      );

      if (controller.signal.aborted) return;

      setRoomStats(
        Object.fromEntries(entries.filter(([, value]) => value !== null))
      );
    }

    loadStats();

    return () => controller.abort();
  }, [rooms]);

  
function getRoomStat(room) {
  const stat = roomStats[getRoomId(room)];

  if (stat) {
    return {
      average: stat.average,
      count: stat.count,
    };
  }

  return {
    average: Number(room?.average_rating) || 0,
    count: Number(room?.review_count) || 0,
  };
}


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

  const selectedRoom = rooms.find(
    (room) => getRoomId(room) === selectedRoomId
  );

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
          `${API_BASE_URL}/api/rooms/${encodeURIComponent(selectedRoomId)}/reviews`,
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
          throw new Error(data.message || "ไม่สามารถโหลดรีวิวของห้องนี้ได้");
        }

        
        const apiReviews = Array.isArray(data.reviews) ? data.reviews : [];

        setRoomData({
            ...data,
            reviews: apiReviews,
            review_count:
            data.review_count != null
                ? data.review_count
                : apiReviews.length,
            average_rating: Number(data.average_rating) || 0,
        });

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
  }, [selectedRoomId, rooms]);

  // ปิด Modal ด้วย Escape และล็อกการเลื่อนหน้าด้านหลัง
  useEffect(() => {
    if (!modalOpen) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") closeModal();
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
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
    return reviews.reduce((sum, review) => sum + (Number(review.rating) || 0), 0) / reviews.length;
  }, [reviews]);

  const ratingCounts = useMemo(
    () => [5, 4, 3, 2, 1].map((rating) => ({
      rating,
      count: reviews.filter((review) => Number(review.rating) === rating).length
    })),
    [reviews]
  );

  const filteredReviews = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("th-TH");
    const result = reviews.filter((review) => {
      const searchableText = `${review.name || review.reviewer_name || ""} ${review.message || review.comment || ""}`.toLocaleLowerCase("th-TH");
      return searchableText.includes(query) &&
        (ratingFilter === "all" || String(review.rating) === ratingFilter);
    });

    return result.sort((a, b) => {
      const dateA = String(a.date || a.created_at || "");
      const dateB = String(b.date || b.created_at || "");
      if (sort === "highest") return Number(b.rating) - Number(a.rating) || dateB.localeCompare(dateA);
      if (sort === "lowest") return Number(a.rating) - Number(b.rating) || dateB.localeCompare(dateA);
      return dateB.localeCompare(dateA);
    });
  }, [reviews, search, sort, ratingFilter]);

  const visibleReviews = filteredReviews.slice(0, visibleCount);

  const roomReviews = roomData?.reviews || [];
  const visibleRoomReviews = roomReviews.slice(0, roomVisible);

  function openModal() {
    setFeedbackError("");
    setSelectedRating(0);
    setFeedbackType(FEEDBACK_TYPES.REVIEW);
    setFeedbackSubject("");
    setFeedbackRoomId("");
    setReviewMessage("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setFeedbackError("");
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const subject = feedbackSubject.trim();
    const message = reviewMessage.trim();
    const isReview = feedbackType === FEEDBACK_TYPES.REVIEW;

    const validationError = validateFeedbackForm({
      isSystemReview: isReview,
      rating: selectedRating,
      subject,
      description: message
    });
    if (validationError) {
      setFeedbackError(validationError);
      return;
    }

    const path = isReview
      ? "/api/system-reviews"
      : feedbackType === FEEDBACK_TYPES.COMPLAINT
        ? "/api/complaints"
        : "/api/repair-reports";
    const payload = isReview
      ? { rating: selectedRating, comment: message }
      : { subject, description: message, room_id: feedbackRoomId || null };
    setSubmittingFeedback(true);
    setFeedbackError("");
    try {
      const token = localStorage.getItem(TOKEN_KEY);
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.success === false) {
        throw new Error(result.message || "ไม่สามารถส่งข้อมูลได้");
      }
      if (isReview) setFeedbackReload((value) => value + 1);
      setToast(isReview ? "ส่งรีวิวระบบเรียบร้อยแล้ว" : "ส่งข้อมูลเรียบร้อยแล้ว");
      closeModal();
    } catch (error) {
      setFeedbackError(error.message || "เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmittingFeedback(false);
    }
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
            <h2>รีวิวระบบ คอมเพลน หรือแจ้งซ่อม</h2>
            <p>แบ่งปันความคิดเห็น แจ้งข้อร้องเรียน หรือปัญหาห้องและอุปกรณ์</p>
          </div>

          <button
            type="button"
            className="button button-primary"
            onClick={openModal}
          >
            ＋ รีวิว / คอมเพลน / แจ้งซ่อม
          </button>
        </section>

        <section className="section-block" aria-labelledby="overviewTitle">
          <div className="section-heading">
            <span className="section-icon">★</span>
            <h2 id="overviewTitle">ภาพรวมคะแนนรีวิว</h2>
          </div>

          {feedbackLoading && <p className="empty-state">กำลังโหลดสถิติรีวิว...</p>}
          {!feedbackLoading && feedbackLoadError && (
            <p className="empty-state" role="alert">{feedbackLoadError}</p>
          )}
          {!feedbackLoading && !feedbackLoadError && (
            <div className="overview-grid">
              <article className="panel overall-rating">
                <div className="rating-number">
                  <span>{averageRating.toFixed(1)}</span>
                  <small>/ 5</small>
                </div>
                <div className="stars"><Stars rating={averageRating} /></div>
                <p>จาก <strong>{reviews.length.toLocaleString("en-US")}</strong> รีวิว</p>
                <span className="subtle-note">คะแนนจาก System Review ที่แสดงได้</span>
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
                          <div className="bar-fill" style={{ width: `${percent}%` }} />
                        </div>
                        <strong>{percent}%</strong>
                      </div>
                    );
                  })}
                </div>
              </article>
            </div>
          )}
        </section>

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
                const image = getApiAssetUrl(room.image_url);
                const description = getRoomDescription(room);
                const active = selectedRoomId === id;

                return (
                  <article
                    key={id}
                    className={`room-card ${active ? "active" : ""}`}
                  >
                    <div className="room-card-image">
                      <RoomImage
                        src={image}
                        alt={`รูปภาพ ${getRoomName(room)}`}
                        className="room-card-room-image"
                      />

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
                        {Number(roomData.review_count) > 0
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
                      <article
                        className="review-card"
                        key={review.id}
                      >
                        <div className="avatar" aria-hidden="true">
                          {(review.name || "?")
                            .trim()
                            .charAt(0)
                            .toUpperCase()}
                        </div>

                        <div className="review-main">
                          <div className="review-meta">
                            <span className="reviewer-name">
                            {review.name || review.reviewer_name || "ผู้ใช้งาน"}
                            </span>

                            {review.verified && (
                              <span className="verified">
                                ✓ เคยจองห้องจริง
                              </span>
                            )}

                          </div>

                          <p className="review-date">
                        {formatThaiDate(review.date || review.created_at)} · {review.type || "รีวิว"}
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

        <section className="section-block" aria-labelledby="systemReviewsTitle">
          <div className="reviews-toolbar">
            <div className="section-heading">
              <span className="section-icon">▣</span>
              <h2 id="systemReviewsTitle">รีวิวจากผู้ใช้งาน</h2>
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
                    setVisibleCount(5);
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
                    setVisibleCount(5);
                  }}
                >
                  <option value="latest">ล่าสุด</option>
                  <option value="highest">คะแนนสูงสุด</option>
                  <option value="lowest">คะแนนต่ำสุด</option>
                </select>
              </label>

              <label className="rating-filter" htmlFor="ratingFilter">
                <span className="sr-only">กรองตามคะแนน</span>
                <select
                  id="ratingFilter"
                  value={ratingFilter}
                  onChange={(event) => {
                    setRatingFilter(event.target.value);
                    setVisibleCount(5);
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

          {feedbackLoading && <p className="empty-state">กำลังโหลดรีวิวระบบ...</p>}
          {!feedbackLoading && feedbackLoadError && (
            <p className="empty-state" role="alert">{feedbackLoadError}</p>
          )}
          {!feedbackLoading && !feedbackLoadError && (
            <>
              <div className="review-list" aria-live="polite">
                {visibleReviews.map((review) => {
                  const reviewerName = review.name || review.reviewer_name || "ผู้ใช้งาน";
                  const reviewMessage = review.message || review.comment || "";
                  return (
                    <article className="review-card" key={review.id || review.review_id}>
                      <div className="avatar" aria-hidden="true">
                        {reviewerName.trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="review-main">
                        <div className="review-meta">
                          <span className="reviewer-name">{reviewerName}</span>
                          {review.verified && <span className="verified">✓ ผู้ใช้ที่เข้าสู่ระบบ</span>}
                        </div>
                        <p className="review-date">
                          {formatThaiDate(review.date || review.created_at)} · รีวิวระบบ
                        </p>
                        <div className="review-stars" aria-label={`${review.rating} จาก 5 ดาว`}>
                          <Stars rating={review.rating} />
                          <span className="rating-text">{review.rating}/5</span>
                        </div>
                        <p className="review-message">{reviewMessage}</p>
                      </div>
                      <span className="review-status">✓ รีวิวระบบ</span>
                    </article>
                  );
                })}
              </div>

              {filteredReviews.length === 0 && (
                <p className="empty-state">
                  {reviews.length ? "ไม่พบรีวิวที่ตรงกับการค้นหา" : "ยังไม่มีรีวิวระบบ"}
                </p>
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
            </>
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
            <h2 id="feedbackModalTitle">รีวิวระบบ / คอมเพลน / แจ้งซ่อม</h2>

            <p className="modal-description">
              เลือกประเภทที่ต้องการส่ง เพื่อช่วยพัฒนาระบบและการให้บริการ
            </p>

            <form onSubmit={handleSubmit}>
              <FeedbackTypeFields
                feedbackType={feedbackType}
                onTypeChange={(event) => {
                  setFeedbackType(event.target.value);
                  setSelectedRating(0);
                  setFeedbackError("");
                }}
                subject={feedbackSubject}
                onSubjectChange={setFeedbackSubject}
                roomId={feedbackRoomId}
                onRoomChange={setFeedbackRoomId}
                rating={selectedRating}
                onRatingChange={(rating) => {
                  setSelectedRating(rating);
                  setFeedbackError("");
                }}
                rooms={rooms}
              />

              <div className="form-field">
                <label htmlFor="reviewMessage">
                  {feedbackType === FEEDBACK_TYPES.REVIEW
                    ? "ความคิดเห็นรีวิว"
                    : feedbackType === FEEDBACK_TYPES.COMPLAINT
                      ? "รายละเอียดการร้องเรียน"
                      : "รายละเอียดปัญหาอุปกรณ์"}
                </label>

                <textarea
                  id="reviewMessage"
                  name="reviewMessage"
                  rows={4}
                  maxLength={1000}
                  placeholder={
                    feedbackType === FEEDBACK_TYPES.REVIEW
                      ? "แบ่งปันความคิดเห็นเกี่ยวกับระบบจองห้อง..."
                      : feedbackType === FEEDBACK_TYPES.COMPLAINT
                        ? "อธิบายเรื่องที่ต้องการร้องเรียน..."
                        : "ระบุอุปกรณ์ที่ชำรุดและรายละเอียดของปัญหา..."
                  }
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

              <p className="form-note">ข้อมูลผู้ส่งจะอ้างอิงจากบัญชีที่เข้าสู่ระบบ</p>

              <div className="modal-actions">
                <button
                  type="button"
                  className="button button-light"
                  onClick={closeModal}
                  disabled={submittingFeedback}
                >
                  ยกเลิก
                </button>

                <button type="submit" className="button button-primary" disabled={submittingFeedback}>
                  {submittingFeedback ? "กำลังส่ง..." : `ส่ง${feedbackType}`}
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
