import { cn } from "@/lib/utils";

const AVATAR_COLORS = ["bg-navy-700", "bg-blue-700", "bg-gray-400"] as const;

const SIZE_CLASSES = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-12 text-base",
} as const;

function hashToIndex(id: string, length: number) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % length;
}

function initialsFromName(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((word) => word[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

export function SenderAvatar({
  id,
  name,
  size = "sm",
  className,
}: {
  id: string;
  name: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}) {
  const color = AVATAR_COLORS[hashToIndex(id, AVATAR_COLORS.length)];
  return (
    <span
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-medium text-white",
        color,
        SIZE_CLASSES[size],
        className
      )}
    >
      {initialsFromName(name)}
    </span>
  );
}
