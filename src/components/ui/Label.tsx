/**
 * Label component
 * Form label with consistent styling
 */

import React from "react";
import { cn } from "@/src/lib/utils";

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  children: React.ReactNode;
  required?: boolean;
}

export function Label({ children, required, className, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        "block text-xs font-medium text-zinc-300 mb-1.5",
        className
      )}
      {...props}
    >
      {children}
      {required && <span className="text-red-400 ml-0.5">*</span>}
    </label>
  );
}
