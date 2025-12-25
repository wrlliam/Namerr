/**
 * Container component
 * Centered max-width wrapper for page content
 */

import React from "react";
import { cn } from "@/src/lib/utils";

type ContainerSize = "sm" | "md" | "lg" | "xl" | "2xl" | "full";

interface ContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  size?: ContainerSize;
}

const sizeMap: Record<ContainerSize, string> = {
  sm: "max-w-2xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  "2xl": "max-w-screen-2xl",
  full: "max-w-full",
};

export function Container({ children, size = "xl", className, ...props }: ContainerProps) {
  return (
    <div
      className={cn("mx-auto px-4 sm:px-6", sizeMap[size], className)}
      {...props}
    >
      {children}
    </div>
  );
}
