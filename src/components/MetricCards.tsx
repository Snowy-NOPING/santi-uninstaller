import { animate, motion, useMotionValue, useTransform } from "framer-motion";
import { useEffect } from "react";
import { IconBox, IconDrive, IconBroom } from "./Icons";
import { formatBytes } from "../format";

interface Props {
  installedCount: number;
  totalSizeBytes: number;
  leftoverFiles: number;
}

/** Number that counts up smoothly when the value changes. */
function CountUp({
  value,
  format,
}: {
  value: number;
  format?: (n: number) => string;
}) {
  const mv = useMotionValue(0);
  const text = useTransform(mv, (v) =>
    format ? format(v) : Math.round(v).toLocaleString(),
  );
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.6, ease: "easeOut" });
    return controls.stop;
  }, [value, mv]);
  return <motion.span>{text}</motion.span>;
}

const CARDS = [
  { key: "installed", label: "Installed apps", Icon: IconBox, tint: "text-accent" },
  { key: "size", label: "Total size", Icon: IconDrive, tint: "text-info" },
  { key: "leftovers", label: "Leftover files found", Icon: IconBroom, tint: "text-flag" },
] as const;

export function MetricCards({ installedCount, totalSizeBytes, leftoverFiles }: Props) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {CARDS.map(({ key, label, Icon, tint }, i) => (
        <motion.div
          key={key}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.05, duration: 0.3 }}
          className="rounded-xl border border-line bg-surface p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-muted">{label}</span>
            <span className={tint}>
              <Icon width={17} height={17} />
            </span>
          </div>
          <div className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
            {key === "installed" && <CountUp value={installedCount} />}
            {key === "size" && (
              <CountUp value={totalSizeBytes} format={(n) => formatBytes(n)} />
            )}
            {key === "leftovers" && <CountUp value={leftoverFiles} />}
          </div>
        </motion.div>
      ))}
    </div>
  );
}
