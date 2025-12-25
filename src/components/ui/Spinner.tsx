/**
 * Spinner component
 * Loading indicator with consistent styling
 */

import React from "react";
import { cn } from "@/src/lib/utils";

type SpinnerSize = "xs" | "sm" | "md" | "lg" | "xl";

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: SpinnerSize;
}

const sizeMap: Record<SpinnerSize, string> = {
  xs: "w-3 h-3 border",
  sm: "w-4 h-4 border",
  md: "w-6 h-6 border-2",
  lg: "w-8 h-8 border-2",
  xl: "w-12 h-12 border-2",
};

export function Spinner({ size = "md", className, ...props }: SpinnerProps) {
  return (
    <div
      className={cn(
        "inline-block rounded-full border-zinc-700 border-t-zinc-400 animate-spin",
        sizeMap[size],
        className
      )}
      role="status"
      aria-label="Loading"
      {...props}
    >
      <span className="sr-only">Loading...</span>
    </div>
  );
}

interface LoadingProps {
  text?: string;
  size?: SpinnerSize;
}

export function Loading({ text = "Loading...", size = "md" }: LoadingProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <Spinner size={size} />
      {text && <p className="text-xs text-zinc-500">{text}</p>}
    </div>
  );
}
