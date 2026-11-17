export function validateFeedbackForm({ isSystemReview, rating, subject, description }) {
  const text = typeof description === "string" ? description.trim() : "";
  const title = typeof subject === "string" ? subject.trim() : "";

  if (!text || text.length > 20_000) return "กรุณากรอกรายละเอียดให้ครบถ้วน";
  if (!isSystemReview && (!title || title.length > 255)) return "กรุณากรอกหัวข้อ";
  if (isSystemReview && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    return "กรุณาเลือกคะแนนระหว่าง 1 ถึง 5 ดาว";
  }
  if (isSystemReview && text.length > 1000) return "รายละเอียดรีวิวต้องไม่เกิน 1,000 ตัวอักษร";
  return "";
}
