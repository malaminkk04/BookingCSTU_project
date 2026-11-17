import React from "react";

function BookingReviewButton({ status, reviewStatusLoaded, reviewed, onReview }) {
  if (status !== "completed") return null;
  if (!reviewStatusLoaded) {
    return (
      <>
        <button type="button" className="review-booking-button" disabled>
          Review status unavailable
        </button>
        <span className="booking-footer-note" role="alert">
          Unable to load this booking&apos;s review status. Refresh to try again.
        </span>
      </>
    );
  }
  if (reviewed) {
    return (
      <button type="button" className="review-booking-button" disabled>
        ✓ Reviewed
      </button>
    );
  }
  return (
    <button type="button" className="review-booking-button" onClick={onReview}>
      ✎ Write review
    </button>
  );
}

export default BookingReviewButton;
