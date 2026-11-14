import React, { act } from "react";
import { createRoot } from "react-dom/client";
import RoomImage from "./RoomImage";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("RoomImage", () => {
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

  test("shows the no-image state when no source is provided", () => {
    act(() => {
      root.render(<RoomImage src={null} alt="Room image" className="room" />);
    });

    expect(container.textContent).toContain("ยังไม่มีรูปภาพ");
  });

  test("shows a distinct error state when an image fails to load", () => {
    act(() => {
      root.render(
        <RoomImage
          src="http://localhost/room.png"
          alt="Room image"
          className="room"
        />
      );
    });

    act(() => {
      container.querySelector("img").dispatchEvent(new Event("error"));
    });

    expect(container.textContent).toContain("ไม่สามารถโหลดรูปภาพได้");
    expect(container.textContent).not.toContain("ยังไม่มีรูปภาพ");
  });
});
