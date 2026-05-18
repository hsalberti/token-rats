interface AvatarProps {
  src: string | null;
  handle: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
}

const sizeClasses = {
  xs: "h-6 w-6 text-xs",
  sm: "h-8 w-8 text-sm",
  md: "h-10 w-10 text-base",
  lg: "h-12 w-12 text-lg",
  xl: "h-16 w-16 text-xl",
};

export function Avatar({ src, handle, size = "md" }: AvatarProps) {
  const initials = handle.slice(0, 2).toUpperCase();

  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={handle}
        className={[sizeClasses[size], "rounded-full object-cover ring-2 ring-zinc-800"].join(" ")}
      />
    );
  }

  return (
    <div
      aria-label={handle}
      className={[
        sizeClasses[size],
        "rounded-full bg-rat-700 ring-2 ring-zinc-800",
        "flex items-center justify-center font-bold text-rat-100",
      ].join(" ")}
    >
      {initials}
    </div>
  );
}
