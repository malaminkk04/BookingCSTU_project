
import React, { act } from "react";
import ReactDOM from "react-dom/client";
import Homepage from "./homepage";

const mockNavigate = jest.fn();

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

jest.mock("../components/navbar", () => ({
  __esModule: true,
  default: () => null,
}));

jest.mock("../components/RoomImage", () => ({
  __esModule: true,
  default: () => null,
}));

const SUSPENSION_MESSAGE =
  "บัญชีของคุณถูกระงับการจองชั่วคราว 2 สัปดาห์ เนื่องจากไม่มาใช้งานเกิน 2 ครั้ง";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("Homepage account suspension popup", () => {
  let container;
  let root;
  let alertSpy;
  let fetchMock;

  const testUser = {
    user_id: 999,
    username: "test_student",
    displayname_th: "นักศึกษาทดสอบ",
    role: "student",
    suspended_until: null,
  };

  const renderHomepage = async (userOverrides = {}) => {
  const userData = {
    ...testUser,
    ...userOverrides,
  };

  localStorage.setItem("token", "mock-test-token");
  localStorage.setItem("user", JSON.stringify(userData));

  expect(localStorage.getItem("user")).not.toBeNull();

  expect(
    JSON.parse(localStorage.getItem("user")).user_id
  ).toBe(userData.user_id);

  await act(async () => {
    root.render(<Homepage />);
  });

  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

  const openBookingForm = async () => {
    const bookingButton = Array.from(
      container.querySelectorAll(".book-room-button")
    ).find((button) =>
      button.textContent.includes("จองห้องนี้")
    );

    expect(bookingButton).toBeTruthy();

    await act(async () => {
      bookingButton.click();
    });

    const bookingForm = container.querySelector("#bookingForm");

    expect(bookingForm).toBeTruthy();

    return bookingForm;
  };

  const submitBookingForm = async (bookingForm) => {
    await act(async () => {
      bookingForm.dispatchEvent(
        new Event("submit", {
          bubbles: true,
          cancelable: true,
        })
      );

      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
  };

  const getSuspensionPopup = () =>
    container.querySelector(
      '[role="dialog"][aria-labelledby="suspensionModalTitle"]'
    );

  const closeSuspensionPopup = async () => {
    const closeButton = container.querySelector(
  '.suspension-modal-close[aria-label="ปิดหน้าต่างแจ้งเตือน"]'
    );

    expect(closeButton).toBeTruthy();

    await act(async () => {
      closeButton.click();
    });
  };

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-11-18T00:00:00.000Z"));

    localStorage.clear();
    localStorage.setItem("token", "mock-test-token");

    mockNavigate.mockClear();

    alertSpy = jest
      .spyOn(window, "alert")
      .mockImplementation(() => {});

    fetchMock = jest.fn(async (url, options = {}) => {
      if (
        url.includes("/api/rooms") &&
        options.method === "GET"
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            rooms: [
              {
                room_id: 999,
                room_name: "ห้องทดสอบ",
                floor: 1,
                capacity: 10,
                description: "ห้องสำหรับทดสอบระบบ",
                bookings: [],
              },
            ],
          }),
        };
      }

      if (
        url.includes("/api/bookings/quota") &&
        options.method === "GET"
      ) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            quota: null,
          }),
        };
      }

      if (
        url.endsWith("/api/bookings") &&
        options.method === "POST"
      ) {
        return {
          ok: false,
          status: 403,
          json: async () => ({
            success: false,
            code: "ACCOUNT_SUSPENDED",
            message: SUSPENSION_MESSAGE,
          }),
        };
      }

      throw new Error(`Unexpected API request: ${url}`);
    });

    global.fetch = fetchMock;

    container = document.createElement("div");
    document.body.appendChild(container);

    root = ReactDOM.createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });

    container?.remove();

    alertSpy?.mockRestore();

    delete global.fetch;

    localStorage.clear();
    jest.useRealTimers();
  });

  test("แสดง Popup ทันทีเมื่อเข้า Homepage ด้วยบัญชีที่ยังถูกระงับ", async () => {
    const suspendedUntil = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();

    await renderHomepage({
      suspended_until: suspendedUntil,
    });

    const popup = getSuspensionPopup();

    expect(popup).toBeTruthy();

    expect(
      popup.querySelector("#suspensionModalTitle").textContent
    ).toContain("บัญชีถูกระงับการจอง");

    expect(
      popup.querySelector("p").textContent
    ).toContain(SUSPENSION_MESSAGE);

   const closeButton = popup.querySelector(
  '.suspension-modal-close[aria-label="ปิดหน้าต่างแจ้งเตือน"]'
    );

    expect(closeButton).toBeTruthy();
    expect(closeButton.textContent.trim()).toBe("×");

    // ต้องไม่มีปุ่ม "รับทราบ"
    expect(
      Array.from(popup.querySelectorAll("button")).some(
        (button) => button.textContent.includes("รับทราบ")
      )
    ).toBe(false);

    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("กด X ปิด Popup ได้ แต่ยังไม่สามารถจองห้องได้", async () => {
    const suspendedUntil = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();

    await renderHomepage({
      suspended_until: suspendedUntil,
    });

    expect(getSuspensionPopup()).toBeTruthy();

    await closeSuspensionPopup();

    expect(getSuspensionPopup()).toBeNull();

    const bookingForm = await openBookingForm();

    await submitBookingForm(bookingForm);

    // Frontend ต้องบล็อกก่อนส่งคำขอไป Backend
    const bookingRequests = fetchMock.mock.calls.filter(
      ([url, options = {}]) =>
        url.endsWith("/api/bookings") &&
        options.method === "POST"
    );

    expect(bookingRequests).toHaveLength(0);

    // Popup ต้องแสดงอีกครั้งเมื่อพยายามจอง
    expect(getSuspensionPopup()).toBeTruthy();

    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("แสดง Popup เมื่อ Backend แจ้งว่า ACCOUNT_SUSPENDED", async () => {
    // กรณีข้อมูลใน localStorage ไม่ระบุว่าถูกระงับ
    // แต่ Backend ตรวจพบว่าบัญชีถูกระงับจริง
    await renderHomepage();

    expect(getSuspensionPopup()).toBeNull();

    const bookingForm = await openBookingForm();

    await submitBookingForm(bookingForm);

    const bookingRequests = fetchMock.mock.calls.filter(
      ([url, options = {}]) =>
        url.endsWith("/api/bookings") &&
        options.method === "POST"
    );

    expect(bookingRequests).toHaveLength(1);

    expect(bookingRequests[0][1]).toEqual(
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer mock-test-token",
        }),
      })
    );

    expect(getSuspensionPopup()).toBeTruthy();

    expect(
      getSuspensionPopup()
        .querySelector("p")
        .textContent
    ).toContain(SUSPENSION_MESSAGE);

    expect(alertSpy).not.toHaveBeenCalled();
  });
});
