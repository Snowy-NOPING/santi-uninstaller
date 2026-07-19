import { useEffect, useState } from "react";
import { readIcon } from "../api";
import { avatarColor, initials } from "../format";
import type { InstalledProgram } from "../types";

interface Props {
  program: InstalledProgram;
  size?: number;
}

/**
 * Tries to load the program's real icon (from DisplayIcon) as a data URL and
 * falls back to a flat colored-initials avatar when unavailable.
 */
export function Avatar({ program, size = 40 }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setSrc(null);
    setFailed(false);
    if (program.iconPath) {
      readIcon(program.iconPath)
        .then((url) => alive && setSrc(url))
        .catch(() => alive && setFailed(true));
    } else {
      setFailed(true);
    }
    return () => {
      alive = false;
    };
  }, [program.id, program.iconPath]);

  const px = { width: size, height: size };
  const radius = Math.round(size * 0.28);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        style={{ ...px, borderRadius: radius }}
        className="shrink-0 object-contain bg-white"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <div
      style={{
        ...px,
        borderRadius: radius,
        background: avatarColor(program.name || program.id),
        fontSize: size * 0.36,
      }}
      className="flex shrink-0 items-center justify-center font-semibold text-white"
    >
      {initials(program.name || "?")}
    </div>
  );
}
