import * as React from "react";
import { cn } from "@/src/lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm" | "lg";
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => {
    return (
      <button
        className={cn(
          "inline-flex items-center justify-center rounded text-xs font-medium focus:outline-none disabled:pointer-events-none disabled:opacity-50",
          variant === "default" && "bg-zinc-800 text-zinc-200 hover:bg-zinc-700",
          variant === "outline" && "border border-zinc-800 bg-zinc-900 hover:bg-zinc-800",
          variant === "ghost" && "hover:bg-zinc-800",
          size === "default" && "h-7 px-3 py-1",
          size === "sm" && "h-6 px-2 text-[10px]",
          size === "lg" && "h-8 px-4",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button };

