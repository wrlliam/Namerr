/**
 * EmptyState component
 * For displaying empty states with icon, message, and optional action
 */

import React from "react";
import { cn } from "@/src/lib/utils";
import { IconProps as RadixIconProps } from "@radix-ui/react-icons/dist/types";
import { Icon } from "./Icon";
import { Button } from "./Button";

interface EmptyStateProps {
  icon?: React.ComponentType<RadixIconProps>;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center py-12 px-4",
        className
      )}
    >
      {icon && (
        <div className="mb-4 p-3 rounded-full bg-zinc-900 border border-zinc-800">
          <Icon icon={icon} size="lg" className="text-zinc-600" />
        </div>
      )}
      <h3 className="text-sm font-medium text-zinc-300 mb-1">{title}</h3>
      {description && (
        <p className="text-xs text-zinc-500 max-w-sm mb-4">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} size="sm">
          {action.label}
        </Button>
      )}
    </div>
  );
}
