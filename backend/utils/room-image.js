const ROOM_IMAGE_MIME_TYPES = {
  "image/jpeg": { extension: "jpg", mimeType: "image/jpeg" },
  "image/jpg": { extension: "jpg", mimeType: "image/jpeg" },
  "image/png": { extension: "png", mimeType: "image/png" },
  "image/webp": { extension: "webp", mimeType: "image/webp" }
};

function detectRoomImage(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    return null;
  }

  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { extension: "jpg", mimeType: "image/jpeg" };
  }

  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    )
  ) {
    return { extension: "png", mimeType: "image/png" };
  }

  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return { extension: "webp", mimeType: "image/webp" };
  }

  return null;
}

function validateRoomImage(buffer, reportedMimeType) {
  const detected = detectRoomImage(buffer);
  const reported = ROOM_IMAGE_MIME_TYPES[reportedMimeType];

  if (!detected || !reported || detected.mimeType !== reported.mimeType) {
    return null;
  }

  return detected;
}

function getManagedRoomImageFilename(imageUrl) {
  const prefix = "/uploads/rooms/";

  if (typeof imageUrl !== "string" || !imageUrl.startsWith(prefix)) {
    return null;
  }

  const filename = imageUrl.slice(prefix.length);

  return /^[a-f0-9]{32}\.(jpg|png|webp)$/.test(filename)
    ? filename
    : null;
}

module.exports = {
  detectRoomImage,
  validateRoomImage,
  getManagedRoomImageFilename
};
