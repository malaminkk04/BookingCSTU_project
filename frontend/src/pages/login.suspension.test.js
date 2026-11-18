
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import axios from "axios";
import Login from "./login";

const mockNavigate = jest.fn();

jest.mock("axios", () => ({
  post: jest.fn(),
}));

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("Login account suspension", () => {
  let container;
  let root;
  let alertSpy;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    localStorage.clear();
    jest.clearAllMocks();

    alertSpy = jest
      .spyOn(window, "alert")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.restoreAllMocks();
  });

  const enterLogin = async (user) => {
    axios.post.mockResolvedValue({
      data: {
        success: true,
        token: "test-token",
        user: {
          faculty: "คณะวิทยาศาสตร์และเทคโนโลยี",
          role: "student",
          ...user,
        },
      },
    });

    act(() => {
      root.render(<Login />);
    });

    const inputs = container.querySelectorAll("input");

    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    ).set;

    await act(async () => {
      setValue.call(inputs[0], "test-user");
      inputs[0].dispatchEvent(
        new Event("input", { bubbles: true })
      );

      setValue.call(inputs[1], "test-password");
      inputs[1].dispatchEvent(
        new Event("input", { bubbles: true })
      );
    });

    await act(async () => {
      container.querySelector(".button-wrapper button").click();
      await Promise.resolve();
    });
  };

  test("Login สำเร็จและไป Homepage เมื่อบัญชียังถูกระงับ", async () => {
    const suspendedUntil = new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString();

    await enterLogin({
      user_id: 999,
      suspended_until: suspendedUntil,
    });

    expect(localStorage.getItem("token")).toBe("test-token");

    const storedUser = JSON.parse(
      localStorage.getItem("user")
    );

    expect(storedUser.suspended_until).toBe(suspendedUntil);

    expect(mockNavigate).toHaveBeenCalledWith("/homepage", {
      replace: true,
    });

    expect(alertSpy).not.toHaveBeenCalled();
  });

  test("Login สำเร็จและไป Homepage เมื่อบัญชีไม่ได้ถูกระงับ", async () => {
    await enterLogin({
      user_id: 999,
      suspended_until: null,
    });

    expect(localStorage.getItem("token")).toBe("test-token");

    const storedUser = JSON.parse(
      localStorage.getItem("user")
    );

    expect(storedUser.suspended_until).toBeNull();

    expect(mockNavigate).toHaveBeenCalledWith("/homepage", {
      replace: true,
    });

    expect(alertSpy).not.toHaveBeenCalled();
  });
});
