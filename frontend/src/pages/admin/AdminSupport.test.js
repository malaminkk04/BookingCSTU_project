import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import AdminSupport from "./admin_support";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("Admin Support feedback management", () => {
  let container;
  let root;

  async function flush() {
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  }

  function response(data, ok = true) {
    return { ok, json: async () => data };
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.setItem("user", JSON.stringify({ user_id: 20, role: "admin" }));
    localStorage.setItem("token", "admin-session");
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    localStorage.clear();
    jest.restoreAllMocks();
  });

  test("shows Loading, Empty and Error states from API responses", async () => {
    let resolveFetch;
    global.fetch = jest.fn(() => new Promise((resolve) => { resolveFetch = resolve; }));
    act(() => root.render(<AdminSupport />));
    expect(container.textContent).toContain("กำลังโหลด...");
    await act(async () => resolveFetch(response({ success: true, data: [] })));
    expect(container.textContent).toContain("ไม่พบข้อมูลที่ตรงกับเงื่อนไข");

    global.fetch = jest.fn().mockRejectedValue(new Error("Failed to fetch"));
    await act(async () => Simulate.click(container.querySelector(".admin-support-refresh")));
    await flush();
    expect(container.querySelector('[role="alert"]').textContent).toContain("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้");
  });

  test("admin can read real review/complaint/repair statuses and save moderation changes", async () => {
    const calls = [];
    global.fetch = jest.fn(async (url, options = {}) => {
      calls.push({ url, options });
      if (options.method === "PATCH") return response({ success: true, status: JSON.parse(options.body).status });
      if (/\/api\/admin\/(complaints|reviews|repairs)\/\d+$/.test(url)) {
        const record = url.includes("complaints")
          ? { complaint_id: 4, subject: "Complaint", description: "Complaint detail from API", status: "รอดำเนินการ", reporter_name: "User", room_name: "Room 1" }
          : url.includes("reviews")
          ? { review_id: 5, comment: "System review detail from API", rating: 4, status: "hidden", reviewer_name: "User" }
          : { repair_id: 6, subject: "Broken device", description: "Repair detail from API", status: "กำลังซ่อม", reporter_name: "User", room_name: "Room 2" };
        return response({ success: true, data: record });
      }
      if (url.endsWith("/api/admin/complaints")) {
        return response({ data: [{ complaint_id: 4, subject: "Complaint", description: "Detail", status: "รอดำเนินการ", reporter_name: "User" }] });
      }
      if (url.endsWith("/api/admin/reviews")) {
        return response({ data: [{ review_id: 5, comment: "System review", rating: 4, status: "hidden", reviewer_name: "User" }] });
      }
      if (url.endsWith("/api/admin/repairs")) {
        return response({ data: [{ repair_id: 6, subject: "Broken device", status: "กำลังซ่อม" }] });
      }
      return response({ success: false, message: "Not found" }, false);
    });

    act(() => root.render(<AdminSupport />));
    await flush();
    expect(container.textContent).toContain("Complaint");
    await act(async () => Simulate.click(container.querySelector(".admin-support-detail-button")));
    await flush();
    expect(container.textContent).toContain("Complaint detail from API");
    expect(container.textContent).toContain("Room 1");
    const complaintStatuses = Array.from(container.querySelectorAll(".admin-support-status-label option"))
      .map((option) => option.value);
    expect(complaintStatuses).toEqual(["รอดำเนินการ", "กำลังตรวจสอบ", "ดำเนินการแล้ว", "เสร็จสิ้น"]);
    await act(async () => Simulate.change(container.querySelector(".admin-support-status-label select"), { target: { value: "กำลังตรวจสอบ" } }));
    await flush();
    expect(calls.some((call) => call.url.includes("/api/admin/complaints/4/status") && JSON.parse(call.options.body).status === "กำลังตรวจสอบ")).toBe(true);
    await act(async () => Simulate.click(container.querySelector(".admin-support-modal-close")));

    const reviewsTab = Array.from(container.querySelectorAll(".admin-support-tab"))
      .find((button) => button.textContent.includes("รีวิวระบบ"));
    await act(async () => Simulate.click(reviewsTab));
    await flush();
    expect(container.textContent).toContain("System review");
    expect(container.textContent).toContain("hidden");
    await act(async () => Simulate.click(container.querySelector(".admin-support-detail-button")));
    await flush();
    expect(container.textContent).toContain("System review detail from API");
    const statusSelect = container.querySelector(".admin-support-status-label select");
    expect(Array.from(statusSelect.options).map((option) => option.value)).toEqual(["visible", "hidden"]);
    await act(async () => Simulate.change(statusSelect, { target: { value: "visible" } }));
    await flush();
    const update = calls.find((call) => call.url.includes("/api/admin/reviews/5/status"));
    expect(update.url).toContain("/api/admin/reviews/5/status");
    expect(JSON.parse(update.options.body)).toEqual({ status: "visible" });

    const repairsTab = Array.from(container.querySelectorAll(".admin-support-tab"))
      .find((button) => button.textContent.includes("แจ้งซ่อม"));
    await act(async () => Simulate.click(repairsTab));
    await flush();
    expect(container.textContent).toContain("Broken device");
    await act(async () => Simulate.click(container.querySelector(".admin-support-detail-button")));
    await flush();
    expect(container.textContent).toContain("Repair detail from API");
    expect(container.textContent).toContain("Room 2");
    const repairStatuses = Array.from(container.querySelectorAll(".admin-support-status-label option"))
      .map((option) => option.value);
    expect(repairStatuses).toEqual(["รอดำเนินการ", "กำลังซ่อม", "ซ่อมเสร็จ", "ยกเลิก"]);
    await act(async () => Simulate.change(container.querySelector(".admin-support-status-label select"), { target: { value: "ซ่อมเสร็จ" } }));
    await flush();
    expect(calls.some((call) => call.url.includes("/api/admin/repairs/6/status") && JSON.parse(call.options.body).status === "ซ่อมเสร็จ")).toBe(true);
  });

  test("rejects invalid status changes and preserves backend state when an update fails", async () => {
    const calls = [];
    global.fetch = jest.fn(async (url, options = {}) => {
      calls.push({ url, options });
      if (options.method === "PATCH") return response({ success: false, message: "บันทึกไม่สำเร็จ" }, false);
      if (/\/api\/admin\/complaints\/\d+$/.test(url)) {
        return response({ data: { complaint_id: 4, subject: "Complaint", description: "Details", status: "รอดำเนินการ" } });
      }
      return response({ data: [{ complaint_id: 4, subject: "Complaint", description: "Details", status: "รอดำเนินการ" }] });
    });

    act(() => root.render(<AdminSupport />));
    await flush();
    await act(async () => Simulate.click(container.querySelector(".admin-support-detail-button")));
    await flush();
    const statusSelect = container.querySelector(".admin-support-status-label select");
    await act(async () => Simulate.change(statusSelect, { target: { value: "forged-status" } }));
    expect(calls.filter((call) => call.options.method === "PATCH")).toHaveLength(0);
    expect(container.querySelector('[role="alert"]').textContent).toContain("สถานะไม่ถูกต้อง");

    await act(async () => Simulate.change(statusSelect, { target: { value: "เสร็จสิ้น" } }));
    await flush();
    expect(container.querySelector('[role="alert"]').textContent).toContain("บันทึกไม่สำเร็จ");
    expect(statusSelect.value).toBe("รอดำเนินการ");
  });
});
