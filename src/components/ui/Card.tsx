/**
 * Card component
 * Reusable container with consistent dark theme styling
 */

import React from "react";
import { cn } from "@/src/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: "none" | "sm" | "md" | "lg";
  hoverable?: boolean;
  clickable?: boolean;
}

const paddingMap = {
  none: "p-0",
  sm: "p-2",
  md: "p-4",
  lg: "p-6",
};

export function Card({
  children,
  padding = "md",
  hoverable = false,
  clickable = false,
  className,
  ...props
}: CardProps) {
  return (
    <div
      className={cn(
        "bg-zinc-900 rounded border border-zinc-800",
        paddingMap[padding],
        hoverable && "hover:border-zinc-700 transition-colors",
        clickable && "cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function CardHeader({ children, className, ...props }: CardHeaderProps) {
  return (
    <div className={cn("mb-4", className)} {...props}>
      {children}
    </div>
  );
}

interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  children: React.ReactNode;
  size?: "sm" | "md" | "lg";
}

export function CardTitle({ children, size = "md", className, ...props }: CardTitleProps) {
  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-base",
  };

  return (
    <h3
      className={cn("font-medium text-zinc-200", sizeClasses[size], className)}
      {...props}
    >
      {children}
    </h3>
  );
}

interface CardDescriptionProps extends React.HTMLAttributes<HTMLParagraphElement> {
  children: React.ReactNode;
}

export function CardDescription({ children, className, ...props }: CardDescriptionProps) {
  return (
    <p className={cn("text-xs text-zinc-500 mt-0.5", className)} {...props}>
      {children}
    </p>
  );
}

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function CardContent({ children, className, ...props }: CardContentProps) {
  return (
    <div className={className} {...props}>
      {children}
    </div>
  );
}

interface CardFooterProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function CardFooter({ children, className, ...props }: CardFooterProps) {
  return (
    <div
      className={cn("mt-4 pt-4 border-t border-zinc-800", className)}
      {...props}
    >
      {children}
    </div>
  );
}
