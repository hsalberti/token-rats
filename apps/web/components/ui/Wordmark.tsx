type Size = "sm" | "md" | "lg" | "xl";

interface WordmarkProps {
  size?: Size;
  showText?: boolean;
  className?: string;
}

const iconSizeClasses: Record<Size, string> = {
  sm: "h-5 w-5",
  md: "h-7 w-7",
  lg: "h-10 w-10",
  xl: "h-14 w-14",
};

const textSizeClasses: Record<Size, string> = {
  sm: "text-base",
  md: "text-xl",
  lg: "text-3xl",
  xl: "text-5xl sm:text-7xl",
};

const gapClasses: Record<Size, string> = {
  sm: "gap-1.5",
  md: "gap-2",
  lg: "gap-3",
  xl: "gap-4",
};

export function Wordmark({ size = "md", showText = true, className = "" }: WordmarkProps) {
  return (
    <span
      className={["inline-flex items-center", gapClasses[size], className].join(" ")}
      aria-label="Token Rats"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/brand/rat-mark.png"
        alt=""
        aria-hidden="true"
        className={[iconSizeClasses[size], "shrink-0 select-none"].join(" ")}
        draggable={false}
      />
      {showText && (
        <span
          className={["font-black tracking-tight leading-none", textSizeClasses[size]].join(" ")}
        >
          Token <span className="text-rat-500">Rats</span>
        </span>
      )}
    </span>
  );
}
