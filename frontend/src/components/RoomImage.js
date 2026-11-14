import { useEffect, useState } from "react";

function RoomImage({ src, alt, className }) {
  const [failedSource, setFailedSource] = useState("");

  useEffect(() => {
    setFailedSource("");
  }, [src]);

  const imageFailed = Boolean(src && failedSource === src);

  if (!src || imageFailed) {
    return (
      <div
        className={`${className} room-image-placeholder`}
        role="img"
        aria-label={
          imageFailed ? `${alt} ไม่สามารถโหลดรูปภาพได้` : alt
        }
      >
        <span aria-hidden="true">▧</span>
        <small>
          {imageFailed ? "ไม่สามารถโหลดรูปภาพได้" : "ยังไม่มีรูปภาพ"}
        </small>
      </div>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt={alt}
      onError={() => setFailedSource(src)}
    />
  );
}

export default RoomImage;
