import React from "react";

export const FEEDBACK_TYPES = {
  REVIEW: "รีวิว",
  COMPLAINT: "ร้องเรียน",
  REPAIR: "แจ้งซ่อม"
};

export default function FeedbackTypeFields({
  feedbackType,
  onTypeChange,
  subject,
  onSubjectChange,
  roomId,
  onRoomChange,
  rating,
  onRatingChange,
  rooms
}) {
  return (
    <>
      <div className="form-field">
        <label htmlFor="feedbackType">ประเภทความคิดเห็น</label>
        <select id="feedbackType" value={feedbackType} onChange={onTypeChange}>
          <option value={FEEDBACK_TYPES.REVIEW}>รีวิว</option>
          <option value={FEEDBACK_TYPES.COMPLAINT}>คอมเพลน</option>
          <option value={FEEDBACK_TYPES.REPAIR}>แจ้งซ่อม</option>
        </select>
      </div>
      {feedbackType === FEEDBACK_TYPES.REVIEW ? (
        <fieldset className="rating-field">
          <legend>ให้คะแนนความพึงพอใจ</legend>
          <div className="star-picker" role="radiogroup" aria-label="เลือกคะแนน 1 ถึง 5">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={value}
                type="button"
                className={value <= rating ? "selected" : ""}
                role="radio"
                aria-checked={rating === value}
                aria-label={`${value} ดาว`}
                onClick={() => onRatingChange(value)}
              >★</button>
            ))}
          </div>
          <span className="field-hint">{rating ? `${rating} จาก 5 ดาว` : "เลือกคะแนน 1–5 ดาว"}</span>
        </fieldset>
      ) : (
        <>
          <div className="form-field">
            <label htmlFor="feedbackSubject">หัวข้อ</label>
            <input id="feedbackSubject" maxLength={255} required value={subject} onChange={(event) => onSubjectChange(event.target.value)} />
          </div>
          <div className="form-field">
            <label htmlFor="feedbackRoom">ห้องที่เกี่ยวข้อง (ไม่บังคับ)</label>
            <select id="feedbackRoom" value={roomId} onChange={(event) => onRoomChange(event.target.value)}>
              <option value="">ไม่ระบุห้อง</option>
              {rooms.map((room) => (
                <option key={room.room_id ?? room.id} value={room.room_id ?? room.id}>
                  {room.room_name || room.room_code || room.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
    </>
  );
}
