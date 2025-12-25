/**
 * Icon wrapper for Radix UI icons
 * Provides consistent sizing and styling across the app
 */

import React from "react";
import { IconProps as RadixIconProps } from "@radix-ui/react-icons/dist/types";
import { cn } from "@/src/lib/utils";

type IconSize = "xs" | "sm" | "md" | "lg" | "xl";

interface IconProps extends RadixIconProps {
  icon: React.ComponentType<RadixIconProps>;
  size?: IconSize;
}

const sizeMap: Record<IconSize, string> = {
  xs: "w-3 h-3",
  sm: "w-4 h-4",
  md: "w-5 h-5",
  lg: "w-6 h-6",
  xl: "w-8 h-8",
};

export function Icon({ icon: IconComponent, size = "sm", className, ...props }: IconProps) {
  return (
    <IconComponent
      className={cn(sizeMap[size], className)}
      {...props}
    />
  );
}
