import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Simulate } from "react-dom/test-utils";
import FeedbackTypeFields, { FEEDBACK_TYPES } from "./FeedbackTypeFields";
import { validateFeedbackForm } from "../utils/feedback-validation";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("System review, complaint and repair form fields", () => {
  let container;
  let root;
  const onTypeChange = jest.fn();
  const onRatingChange = jest.fn();

  function render(type) {
    act(() => root.render(
      <FeedbackTypeFields
        feedbackType={type}
        onTypeChange={onTypeChange}
        subject=""
        onSubjectChange={jest.fn()}
        roomId=""
        onRoomChange={jest.fn()}
        rating={0}
        onRatingChange={onRatingChange}
        rooms={[{ room_id: 3, room_name: "Room 303" }]}
      />
    ));
  }

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    jest.clearAllMocks();
  });

  test("lets users select all three feedback types", () => {
    render(FEEDBACK_TYPES.REVIEW);
    const selector = container.querySelector("#feedbackType");
    expect(Array.from(selector.options).map((option) => option.textContent)).toEqual([
      "รีวิว", "คอมเพลน", "แจ้งซ่อม"
    ]);
    act(() => Simulate.change(selector, { target: { value: FEEDBACK_TYPES.COMPLAINT } }));
    expect(onTypeChange).toHaveBeenCalledTimes(1);
  });

  test("system review shows only the 1–5 rating control", () => {
    render(FEEDBACK_TYPES.REVIEW);
    expect(container.querySelectorAll('[role="radio"]')).toHaveLength(5);
    expect(container.querySelector("#feedbackSubject")).toBeNull();
    act(() => Simulate.click(container.querySelector('[aria-label="4 ดาว"]')));
    expect(onRatingChange).toHaveBeenCalledWith(4);
  });

  test.each([FEEDBACK_TYPES.COMPLAINT, FEEDBACK_TYPES.REPAIR])(
    "%s asks for a required subject and provides an optional room selector",
    (type) => {
      render(type);
      expect(container.querySelector("#feedbackSubject").required).toBe(true);
      expect(container.querySelector("#feedbackRoom").required).toBe(false);
      expect(container.querySelector("#feedbackRoom option[value='3']").textContent).toBe("Room 303");
      expect(container.querySelector('[role="radio"]')).toBeNull();
    }
  );

  test("validates system review rating and comment length", () => {
    for (const rating of [0, 6, 1.5]) {
      expect(validateFeedbackForm({ isSystemReview: true, rating, description: "Comment" })).not.toBe("");
    }
    expect(validateFeedbackForm({ isSystemReview: true, rating: 5, description: "Comment" })).toBe("");
    expect(validateFeedbackForm({ isSystemReview: true, rating: 5, description: "x".repeat(1001) })).not.toBe("");
  });

  test.each([FEEDBACK_TYPES.COMPLAINT, FEEDBACK_TYPES.REPAIR])(
    "%s requires subject and details",
    (type) => {
      expect(validateFeedbackForm({ isSystemReview: false, subject: "", description: "Details" })).not.toBe("");
      expect(validateFeedbackForm({ isSystemReview: false, subject: `valid ${type}`, description: "" })).not.toBe("");
      expect(validateFeedbackForm({ isSystemReview: false, subject: "Issue", description: "Details" })).toBe("");
    }
  );
});
