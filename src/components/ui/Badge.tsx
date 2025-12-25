/**
 * Badge component
 * For status indicators, labels, and tags
 */

import React from "react";
import { cn } from "@/src/lib/utils";

type BadgeVariant = "default" | "success" | "error" | "warning" | "info" | "outline";
type BadgeSize = "xs" | "sm" | "md";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  children: React.ReactNode;
  variant?: BadgeVariant;
  size?: BadgeSize;
}

const variantStyles: Record<BadgeVariant, string> = {
  default: "bg-zinc-800 text-zinc-500 border-zinc-700",
  success: "bg-green-900/20 text-green-400 border-green-900/50",
  error: "bg-red-900/20 text-red-400 border-red-900/50",
  warning: "bg-yellow-900/20 text-yellow-400 border-yellow-900/50",
  info: "bg-blue-900/20 text-blue-400 border-blue-900/50",
  outline: "bg-transparent text-zinc-400 border-zinc-700",
};

const sizeStyles: Record<BadgeSize, string> = {
  xs: "text-[10px] px-1.5 py-0.5",
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-1",
};

export function Badge({
  children,
  variant = "default",
  size = "xs",
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded border font-medium",
        variantStyles[variant],
        sizeStyles[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
