import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import Review from "./review";

jest.mock("react-router-dom", () => {
  const ReactRouter = require("react");
  const navigate = jest.fn();
  return {
    MemoryRouter: ({ children }) => ReactRouter.createElement(ReactRouter.Fragment, null, children),
    useNavigate: () => navigate,
    useLocation: () => ({ pathname: "/review" })
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const ROOM_IMAGE_PATH = `/uploads/rooms/${"a".repeat(32)}.jpg`;
const rooms = [
  {
    room_id: 301,
    room_name: "ห้อง 301",
    floor: 3,
    image_url: ROOM_IMAGE_PATH,
    description: "ห้องประชุม"
  },
  { room_id: 302, room_name: "ห้อง 302", floor: 3, image_url: null }
];
const systemReviews = [
  {
    id: 901,
    name: "ผู้รีวิวระบบ A",
    rating: 5,
    message: "system review from API A",
    status: "visible",
    created_at: "2026-11-03"
  },
  {
    id: 902,
    name: "ผู้รีวิวระบบ B",
    rating: 4,
    message: "system review from API B",
    status: "visible",
    created_at: "2026-11-02"
  },
  {
    id: 903,
    name: "รีวิวที่ถูกซ่อน",
    rating: 1,
    message: "hidden system review",
    status: "hidden",
    created_at: "2026-11-01"
  }
];

function response(data, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

function roomReviews(roomId) {
  const reviews = roomId === "301"
    ? [{ id: 1, name: "ผู้รีวิว 301", rating: 5, message: "รีวิวของห้อง 301", created_at: "2026-11-01" }]
    : [{ id: 2, name: "ผู้รีวิว 302", rating: 4, message: "รีวิวของห้อง 302", created_at: "2026-11-02" }];
  return response({ success: true, average_rating: 4.5, review_count: reviews.length, usage_count: 3, reviews });
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function setFieldValue(element, value) {
  act(() => {
    const prototype = element.tagName === "TEXTAREA"
      ? window.HTMLTextAreaElement.prototype
      : element.tagName === "SELECT"
        ? window.HTMLSelectElement.prototype
        : window.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value").set.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("Review page room reviews and feedback form", () => {
  let container;
  let root;
  let fetchMock;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.setItem("user", JSON.stringify({ user_id: 17, name: "Tester" }));
    localStorage.setItem("token", "test-token");
    fetchMock = jest.fn(async (url) => {
      if (String(url).includes("/api/rooms?")) return response({ success: true, rooms });
      if (String(url).includes("/api/system-reviews")) return response({ success: true, data: systemReviews });
      const match = String(url).match(/\/api\/rooms\/(\d+)\/reviews/);
      if (match) return roomReviews(match[1]);
      return response({ success: true });
    });
    global.fetch = fetchMock;
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
    jest.restoreAllMocks();
  });

  async function renderPage() {
    await act(async () => {
      root.render(<MemoryRouter initialEntries={["/review"]}><Review /></MemoryRouter>);
    });
    await settle();
  }

  test("removes submitted items, restores real system review statistics, and loads room images", async () => {
    await renderPage();

    expect(container.textContent).not.toContain("รายการที่ฉันส่ง");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/mine"))).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/system-reviews"))).toBe(true);
    expect(container.textContent).toContain("ภาพรวมคะแนนรีวิว");
    expect(container.textContent).toContain("4.5");
    expect(container.textContent).toContain("จาก 2 รีวิว");
    expect(container.textContent).toContain("system review from API A");
    expect(container.textContent).toContain("system review from API B");
    expect(container.textContent).not.toContain("hidden system review");

    const roomCard = Array.from(container.querySelectorAll(".room-card"))
      .find((card) => card.textContent.includes("ห้อง 301"));
    expect(roomCard.querySelector("img").getAttribute("src")).toBe(`http://localhost:5001${ROOM_IMAGE_PATH}`);
    expect(roomCard.textContent).toContain("ห้องประชุม");
  });

  test("shows an empty image state for rooms without a database image", async () => {
    await renderPage();
    const roomCard = Array.from(container.querySelectorAll(".room-card"))
      .find((card) => card.textContent.includes("ห้อง 302"));
    expect(roomCard.textContent).toContain("ยังไม่มีรูปภาพ");
  });

  test("shows an image error state without breaking the room list", async () => {
    await renderPage();
    const image = container.querySelector('img[src*="/uploads/rooms/"]');
    act(() => image.dispatchEvent(new Event("error")));
    expect(container.textContent).toContain("ไม่สามารถโหลดรูปภาพได้");
    expect(container.textContent).toContain("ห้อง 302");
  });

  test("shows room-specific reviews and reviewer names from the room reviews API only", async () => {
    await renderPage();
    const selectButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent.includes("ดูรีวิวห้องนี้") && button.closest(".room-card")?.textContent.includes("ห้อง 301"));
    act(() => selectButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    await settle();

    expect(container.textContent).toContain("รีวิวของห้อง 301");
    expect(container.textContent).toContain("ผู้รีวิว 301");
    expect(container.textContent).not.toContain("รีวิวของห้อง 302");
    expect(container.querySelector("#roomReviewDetail").textContent).not.toContain("system review from API");
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/api/rooms/301/reviews"))).toBe(true);
  });

  test("shows loading, empty, and error states for room data", async () => {
    let finishRoomRequest;
    fetchMock.mockImplementation((url) => {
      if (String(url).includes("/api/rooms?")) {
        return new Promise((resolve) => { finishRoomRequest = resolve; });
      }
      return response({ success: true });
    });
    act(() => {
      root.render(<MemoryRouter><Review /></MemoryRouter>);
    });
    expect(container.textContent).toContain("กำลังโหลดรายการห้อง");
    await act(async () => finishRoomRequest(response({ success: true, rooms: [] })));
    expect(container.textContent).toContain("ยังไม่มีห้องที่คุณมีสิทธิ์ดูรีวิว");

    act(() => root.unmount());

    root = createRoot(container);
    fetchMock.mockImplementation(async () => response({ success: false, message: "โหลดห้องไม่สำเร็จ" }, false, 500));
    await renderPage();
    expect(container.querySelector('[role="alert"]').textContent).toContain("โหลดห้องไม่สำเร็จ");
  });

  test.each([
    ["รีวิว", "/api/system-reviews"],
    ["คอมเพลน", "/api/complaints"],
    ["แจ้งซ่อม", "/api/repair-reports"]
  ])("keeps the %s feedback form submission wired to its existing API", async (type, endpoint) => {
    await renderPage();
    const openButton = Array.from(container.querySelectorAll("button"))
      .find((button) => button.textContent.includes("รีวิว / คอมเพลน / แจ้งซ่อม"));
    act(() => openButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const typeSelect = container.querySelector("#feedbackType");
    setFieldValue(typeSelect, type === "คอมเพลน" ? "ร้องเรียน" : type);
    if (type !== "รีวิว") setFieldValue(container.querySelector("#feedbackSubject"), "หัวข้อทดสอบ");
    if (type === "รีวิว") {
      act(() => container.querySelector('.feedback-modal [aria-label="5 ดาว"]').dispatchEvent(new MouseEvent("click", { bubbles: true })));
    }
    setFieldValue(container.querySelector("#reviewMessage"), "รายละเอียดทดสอบที่ยาวพอ");
    act(() => container.querySelector("form").dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
    await settle();

    expect(fetchMock.mock.calls.some(([url, options]) => String(url).endsWith(endpoint) && options?.method === "POST")).toBe(true);
  });
});
