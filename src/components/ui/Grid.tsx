/**
 * Grid component
 * Responsive grid layout with consistent spacing
 */

import React from "react";
import { cn } from "@/src/lib/utils";

type GridCols = 1 | 2 | 3 | 4 | 5 | 6 | 12;
type GridGap = "none" | "xs" | "sm" | "md" | "lg" | "xl";

interface GridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  cols?: GridCols;
  gap?: GridGap;
  responsive?: {
    sm?: GridCols;
    md?: GridCols;
    lg?: GridCols;
    xl?: GridCols;
  };
}

const colsMap: Record<GridCols, string> = {
  1: "grid-cols-1",
  2: "grid-cols-2",
  3: "grid-cols-3",
  4: "grid-cols-4",
  5: "grid-cols-5",
  6: "grid-cols-6",
  12: "grid-cols-12",
};

const gapMap: Record<GridGap, string> = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
};

export function Grid({
  children,
  cols = 1,
  gap = "md",
  responsive,
  className,
  ...props
}: GridProps) {
  const responsiveClasses = responsive
    ? Object.entries(responsive)
        .map(([breakpoint, cols]) => {
          const prefix = breakpoint === "sm" ? "sm:" : breakpoint === "md" ? "md:" : breakpoint === "lg" ? "lg:" : "xl:";
          return `${prefix}grid-cols-${cols}`;
        })
        .join(" ")
    : "";

  return (
    <div
      className={cn(
        "grid",
        colsMap[cols],
        gapMap[gap],
        responsiveClasses,
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
