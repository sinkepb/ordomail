import { useState, useRef } from "react";

export function ZoomableImage({ src }) {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [interacting, setInteracting] = useState(false); // désactive la transition CSS pendant le geste
  const pinchRef = useRef(null); // {startDist, startScale} | null
  const panRef = useRef(null);   // {startX, startY, startTranslate} | null
  const lastTapRef = useRef(0);

  function dist(touches) {
    const [a, b] = touches;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }

  function handleTouchStart(e) {
    if (e.touches.length === 2) {
      e.stopPropagation();
      pinchRef.current = { startDist: dist(e.touches), startScale: scale };
      setInteracting(true);
      return;
    }
    if (e.touches.length === 1) {
      if (scale > 1) {
        e.stopPropagation();
        panRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, startTranslate: translate };
        setInteracting(true);
      }
      const now = Date.now();
      if (now - lastTapRef.current < 300) {
        e.stopPropagation();
        if (scale > 1) { setScale(1); setTranslate({ x: 0, y: 0 }); }
        else setScale(2.5);
      }
      lastTapRef.current = now;
    }
  }
  function handleTouchMove(e) {
    if (e.touches.length === 2 && pinchRef.current) {
      e.stopPropagation();
      const next = Math.min(4, Math.max(1, pinchRef.current.startScale * (dist(e.touches) / pinchRef.current.startDist)));
      setScale(next);
    } else if (e.touches.length === 1 && panRef.current) {
      e.stopPropagation();
      const dx = e.touches[0].clientX - panRef.current.startX;
      const dy = e.touches[0].clientY - panRef.current.startY;
      setTranslate({ x: panRef.current.startTranslate.x + dx, y: panRef.current.startTranslate.y + dy });
    }
  }
  function handleTouchEnd(e) {
    if (pinchRef.current) {
      e.stopPropagation();
      pinchRef.current = null;
      if (scale < 1.05) { setScale(1); setTranslate({ x: 0, y: 0 }); }
    }
    if (panRef.current) { e.stopPropagation(); panRef.current = null; }
    setInteracting(false);
  }

  return (
    <div style={{ width: "100%", maxHeight: "68vh", overflow: "hidden", borderRadius: 14, touchAction: "none" }}
      onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}>
      <img src={src} alt="" draggable={false} onDragStart={e => e.preventDefault()}
        style={{
          width: "100%", display: "block", borderRadius: 14,
          transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
          transformOrigin: "center center",
          transition: interacting ? "none" : "transform 0.2s ease-out",
        }}/>
    </div>
  );
}
