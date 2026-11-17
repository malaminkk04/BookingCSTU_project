import React, { act } from "react";
import { createRoot } from "react-dom/client";
import BookingReviewButton from "../components/BookingReviewButton";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("My Booking room review action", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  test.each(["reserved", "checked_in", "no_show", "cancelled"])(
    "does not show a review action for %s bookings",
    (status) => {
      act(() => root.render(
        <BookingReviewButton status={status} reviewStatusLoaded reviewed={false} />
      ));
      expect(container.querySelector("button")).toBeNull();
    }
  );

  test("shows an enabled action after Backend confirms an eligible booking is not reviewed", () => {
    const onReview = jest.fn();
    act(() => root.render(
      <BookingReviewButton status="completed" reviewStatusLoaded reviewed={false} onReview={onReview} />
    ));
    const button = container.querySelector("button");
    expect(button.disabled).toBe(false);
    act(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onReview).toHaveBeenCalledTimes(1);
  });

  test("shows a disabled action when Backend reports the booking was reviewed, including after reload", () => {
    const renderFromServer = (reviewed) => act(() => root.render(
      <BookingReviewButton status="completed" reviewStatusLoaded reviewed={reviewed} />
    ));
    renderFromServer(false);
    renderFromServer(true);
    expect(container.querySelector("button").disabled).toBe(true);
    expect(container.textContent).toContain("Reviewed");
  });

  test("does not guess review state when Backend status failed to load", () => {
    act(() => root.render(
      <BookingReviewButton status="completed" reviewStatusLoaded={false} reviewed={false} />
    ));
    expect(container.querySelector("button").disabled).toBe(true);
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(container.textContent).toContain("status unavailable");
  });
});
