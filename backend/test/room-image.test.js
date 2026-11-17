const assert = require("node:assert/strict");
const { test } = require("node:test");
const {
  detectRoomImage,
  validateRoomImage,
  getManagedRoomImageFilename
} = require("../utils/room-image");

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a
]);
const WEBP_HEADER = Buffer.from("RIFF0000WEBP", "ascii");

test("detects JPEG, PNG, and WebP signatures from buffer contents", async (t) => {
  const cases = [
    [JPEG_HEADER, { extension: "jpg", mimeType: "image/jpeg" }],
    [PNG_HEADER, { extension: "png", mimeType: "image/png" }],
    [WEBP_HEADER, { extension: "webp", mimeType: "image/webp" }]
  ];

  for (const [buffer, expected] of cases) {
    await t.test(expected.mimeType, () => {
      assert.deepEqual(detectRoomImage(buffer), expected);
    });
  }
});

test("rejects unsupported, truncated, and non-buffer image content", () => {
  assert.equal(detectRoomImage(Buffer.from("not an image")), null);
  assert.equal(detectRoomImage(Buffer.from([0xff, 0xd8])), null);
  assert.equal(detectRoomImage(null), null);
});

test("accepts image content only when the reported MIME type matches", () => {
  assert.deepEqual(
    validateRoomImage(JPEG_HEADER, "image/jpeg"),
    { extension: "jpg", mimeType: "image/jpeg" }
  );
  assert.equal(validateRoomImage(JPEG_HEADER, "image/png"), null);
  assert.equal(validateRoomImage(PNG_HEADER, "application/octet-stream"), null);
  assert.deepEqual(validateRoomImage(WEBP_HEADER, "image/webp"), {
    extension: "webp",
    mimeType: "image/webp"
  });
});

test("accepts only managed room image URLs with supported names and extensions", async (t) => {
  const hash = "a".repeat(32);
  const cases = [
    [`/uploads/rooms/${hash}.jpg`, `${hash}.jpg`],
    [`/uploads/rooms/${hash}.png`, `${hash}.png`],
    [`/uploads/rooms/${hash}.webp`, `${hash}.webp`]
  ];

  for (const [url, expected] of cases) {
    await t.test(url.slice(-4), () => {
      assert.equal(getManagedRoomImageFilename(url), expected);
    });
  }
});

test("rejects missing, external, traversal, and unsupported room image URLs", () => {
  const hash = "a".repeat(32);

  for (const url of [
    null,
    "",
    `https://example.test/uploads/rooms/${hash}.jpg`,
    `/uploads/rooms/../${hash}.jpg`,
    `/uploads/rooms/${hash}.gif`,
    `/uploads/rooms/${hash}.jpg?download=1`
  ]) {
    assert.equal(getManagedRoomImageFilename(url), null);
  }
});
