"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { CaretSortIcon } from "@radix-ui/react-icons";

interface SortSelectorProps {
  libraryId: string;
}

const sortOptions = [
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "name-desc", label: "Name (Z-A)" },
  { value: "year-desc", label: "Year (Newest)" },
  { value: "year-asc", label: "Year (Oldest)" },
  { value: "date-desc", label: "Date Added (Newest)" },
  { value: "date-asc", label: "Date Added (Oldest)" },
  { value: "size-desc", label: "Size (Largest)" },
  { value: "size-asc", label: "Size (Smallest)" },
];

export function SortSelector({ libraryId }: SortSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSort = searchParams.get("sort") || "name-asc";
  const status = searchParams.get("status") || "all";
  const search = searchParams.get("search") || "";
  const page = searchParams.get("page") || "1";

  const handleSortChange = (newSort: string) => {
    const params = new URLSearchParams();
    params.set("sort", newSort);
    if (status !== "all") params.set("status", status);
    if (search) params.set("search", search);
    if (page !== "1") params.set("page", page);

    router.push(`/libraries/${libraryId}?${params.toString()}`);
  };

  return (
    <div className="relative">
      <select
        value={currentSort}
        onChange={(e) => handleSortChange(e.target.value)}
        className="appearance-none h-8 pl-3 pr-8 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-400 hover:border-zinc-700 focus:outline-none focus:ring-1 focus:ring-violet-600 cursor-pointer"
      >
        {sortOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <CaretSortIcon className="absolute right-2 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500 pointer-events-none" />
    </div>
  );
}
