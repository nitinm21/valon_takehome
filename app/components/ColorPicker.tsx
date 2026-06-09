"use client";

import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent as ReactChangeEvent,
  type PointerEvent as ReactPointerEvent
} from "react";

type RGB = { r: number; g: number; b: number };
type HSV = { h: number; s: number; v: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function hexToRgb(hex: string): RGB {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  const num = parseInt(h, 16);
  if (Number.isNaN(num)) {
    return { r: 0, g: 0, b: 0 };
  }
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

function rgbToHex({ r, g, b }: RGB): string {
  const to = (n: number) => clamp(Math.round(n), 0, 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === rn) {
      h = ((gn - bn) / d) % 6;
    } else if (max === gn) {
      h = (bn - rn) / d + 2;
    } else {
      h = (rn - gn) / d + 4;
    }
    h *= 60;
    if (h < 0) {
      h += 360;
    }
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) {
    [r, g] = [c, x];
  } else if (h < 120) {
    [r, g] = [x, c];
  } else if (h < 180) {
    [g, b] = [c, x];
  } else if (h < 240) {
    [g, b] = [x, c];
  } else if (h < 300) {
    [r, b] = [x, c];
  } else {
    [r, b] = [c, x];
  }
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

function hexToHsv(hex: string): HSV {
  return rgbToHsv(hexToRgb(hex));
}

function hsvToHex(hsv: HSV): string {
  return rgbToHex(hsvToRgb(hsv));
}

function normalizeHex(raw: string): string | null {
  let h = raw.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(h)) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (/^[0-9a-fA-F]{6}$/.test(h)) {
    return `#${h.toLowerCase()}`;
  }
  return null;
}

// Custom HSV color picker: a saturation/value square, a hue slider, and a hex
// field. HSV is the internal source of truth so hue survives the black/white
// extremes (where the hex alone would lose it); we only resync from `value`
// when an outside change (preset, gradient stop) doesn't match our own output.
export function ColorPicker({
  value,
  onChange
}: {
  value: string;
  onChange: (hex: string) => void;
}) {
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(value));
  const [hexText, setHexText] = useState(value.toUpperCase());
  const svRef = useRef<HTMLDivElement>(null);
  const hueRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<null | "sv" | "hue">(null);

  useEffect(() => {
    if (hsvToHex(hsv) !== value.toLowerCase()) {
      setHsv(hexToHsv(value));
    }
    if (normalizeHex(hexText) !== value.toLowerCase()) {
      setHexText(value.toUpperCase());
    }
    // Only react to external `value` changes; internal state is read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  function emit(next: HSV) {
    setHsv(next);
    onChange(hsvToHex(next));
  }

  function updateSv(clientX: number, clientY: number) {
    const rect = svRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const s = clamp((clientX - rect.left) / rect.width, 0, 1);
    const v = 1 - clamp((clientY - rect.top) / rect.height, 0, 1);
    emit({ ...hsv, s, v });
  }

  function updateHue(clientX: number) {
    const rect = hueRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }
    const h = clamp((clientX - rect.left) / rect.width, 0, 1) * 360;
    emit({ ...hsv, h });
  }

  function onPointerMove(event: ReactPointerEvent) {
    if (dragRef.current === "sv") {
      updateSv(event.clientX, event.clientY);
    } else if (dragRef.current === "hue") {
      updateHue(event.clientX);
    }
  }

  function endDrag(event: ReactPointerEvent) {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function onHexInput(event: ReactChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    setHexText(raw);
    const norm = normalizeHex(raw);
    if (norm) {
      onChange(norm);
    }
  }

  const hueColor = `hsl(${hsv.h}, 100%, 50%)`;
  const current = hsvToHex(hsv);

  return (
    <div className="color-picker">
      <div
        className="cp-sv"
        // Don't let a drag steal focus — when this picker opens over an editing
        // text box, blurring the contentEditable would commit & exit edit mode.
        onMouseDown={(event) => event.preventDefault()}
        onPointerCancel={endDrag}
        onPointerDown={(event) => {
          dragRef.current = "sv";
          event.currentTarget.setPointerCapture(event.pointerId);
          updateSv(event.clientX, event.clientY);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        ref={svRef}
        style={{
          background: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), ${hueColor}`
        }}
      >
        <span
          className="cp-sv-handle"
          style={{
            background: current,
            left: `${hsv.s * 100}%`,
            top: `${(1 - hsv.v) * 100}%`
          }}
        />
      </div>

      <div
        className="cp-hue"
        onMouseDown={(event) => event.preventDefault()}
        onPointerCancel={endDrag}
        onPointerDown={(event) => {
          dragRef.current = "hue";
          event.currentTarget.setPointerCapture(event.pointerId);
          updateHue(event.clientX);
        }}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        ref={hueRef}
      >
        <span
          className="cp-hue-handle"
          style={{ background: hueColor, left: `${(hsv.h / 360) * 100}%` }}
        />
      </div>

      <div className="cp-hex">
        <span className="cp-hex-preview" style={{ background: current }} />
        <input
          aria-label="Hex color"
          className="cp-hex-input"
          onChange={onHexInput}
          spellCheck={false}
          value={hexText}
        />
      </div>
    </div>
  );
}
