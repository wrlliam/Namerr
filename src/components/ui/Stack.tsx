/**
 * Stack component
 * Flexbox container with consistent spacing
 */

import React from "react";
import { cn } from "@/src/lib/utils";

type StackDirection = "row" | "column";
type StackAlign = "start" | "center" | "end" | "stretch" | "baseline";
type StackJustify = "start" | "center" | "end" | "between" | "around" | "evenly";
type StackSpacing = "none" | "xs" | "sm" | "md" | "lg" | "xl";

interface StackProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  direction?: StackDirection;
  align?: StackAlign;
  justify?: StackJustify;
  spacing?: StackSpacing;
  wrap?: boolean;
}

const alignMap: Record<StackAlign, string> = {
  start: "items-start",
  center: "items-center",
  end: "items-end",
  stretch: "items-stretch",
  baseline: "items-baseline",
};

const justifyMap: Record<StackJustify, string> = {
  start: "justify-start",
  center: "justify-center",
  end: "justify-end",
  between: "justify-between",
  around: "justify-around",
  evenly: "justify-evenly",
};

const spacingMap: Record<StackSpacing, string> = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-8",
};

export function Stack({
  children,
  direction = "column",
  align = "stretch",
  justify = "start",
  spacing = "md",
  wrap = false,
  className,
  ...props
}: StackProps) {
  return (
    <div
      className={cn(
        "flex",
        direction === "column" ? "flex-col" : "flex-row",
        alignMap[align],
        justifyMap[justify],
        spacingMap[spacing],
        wrap && "flex-wrap",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
