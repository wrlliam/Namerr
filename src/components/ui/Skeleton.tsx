/**
 * Skeleton component
 * Loading placeholder with animation
 */

import React from "react";
import { cn } from "@/src/lib/utils";

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "text" | "circular";
}

export function Skeleton({ variant = "default", className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse bg-zinc-800",
        variant === "circular" && "rounded-full",
        variant === "text" && "h-4 rounded",
        variant === "default" && "rounded",
        className
      )}
      {...props}
    />
  );
}

interface SkeletonTextProps {
  lines?: number;
  className?: string;
}

export function SkeletonText({ lines = 3, className }: SkeletonTextProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          variant="text"
          className={cn("w-full", i === lines - 1 && "w-3/4")}
        />
      ))}
    </div>
  );
}
