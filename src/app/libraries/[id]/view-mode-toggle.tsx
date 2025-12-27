"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { ViewGridIcon, ListBulletIcon } from "@radix-ui/react-icons";

interface ViewModeToggleProps {
  libraryId: string;
}

export function ViewModeToggle({ libraryId }: ViewModeToggleProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view") || "grid";
  const status = searchParams.get("status") || "all";
  const search = searchParams.get("search") || "";
  const sort = searchParams.get("sort") || "name-asc";
  const page = searchParams.get("page") || "1";

  const handleViewChange = (newView: string) => {
    const params = new URLSearchParams();
    params.set("view", newView);
    if (status !== "all") params.set("status", status);
    if (search) params.set("search", search);
    if (sort !== "name-asc") params.set("sort", sort);
    if (page !== "1") params.set("page", page);

    router.push(`/libraries/${libraryId}?${params.toString()}`);
  };

  return (
    <div className="flex rounded border border-zinc-800 overflow-hidden">
      <button
        onClick={() => handleViewChange("grid")}
        className={`flex items-center justify-center w-8 h-8 transition-colors ${
          currentView === "grid"
            ? "bg-zinc-800 text-zinc-200"
            : "bg-zinc-900 text-zinc-500 hover:text-zinc-400"
        }`}
        title="Grid view"
      >
        <ViewGridIcon className="w-4 h-4" />
      </button>
      <button
        onClick={() => handleViewChange("list")}
        className={`flex items-center justify-center w-8 h-8 transition-colors border-l border-zinc-800 ${
          currentView === "list"
            ? "bg-zinc-800 text-zinc-200"
            : "bg-zinc-900 text-zinc-500 hover:text-zinc-400"
        }`}
        title="List view"
      >
        <ListBulletIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
