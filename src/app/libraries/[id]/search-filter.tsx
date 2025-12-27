"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { MagnifyingGlassIcon, Cross2Icon } from "@radix-ui/react-icons";
import { useDebounce } from "@/src/hooks/use-debounce";

interface SearchFilterProps {
  libraryId: string;
}

export function SearchFilter({ libraryId }: SearchFilterProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentSearch = searchParams.get("search") || "";
  const currentStatus = searchParams.get("status") || "all";

  const [searchValue, setSearchValue] = useState(currentSearch);
  const debouncedSearch = useDebounce(searchValue, 300);

  const updateUrl = useCallback(
    (search: string) => {
      const params = new URLSearchParams();
      if (search) {
        params.set("search", search);
      }
      if (currentStatus !== "all") {
        params.set("status", currentStatus);
      }
      params.set("page", "1"); // Reset to first page on search

      const queryString = params.toString();
      router.push(
        `/libraries/${libraryId}${queryString ? `?${queryString}` : ""}`
      );
    },
    [libraryId, currentStatus, router]
  );

  // Update URL when debounced search changes
  useEffect(() => {
    if (debouncedSearch !== currentSearch) {
      updateUrl(debouncedSearch);
    }
  }, [debouncedSearch, currentSearch, updateUrl]);

  const clearSearch = () => {
    setSearchValue("");
  };

  return (
    <div className="relative w-full max-w-xs">
      <MagnifyingGlassIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
      <input
        type="text"
        value={searchValue}
        onChange={(e) => setSearchValue(e.target.value)}
        placeholder="Search files..."
        className="w-full pl-8 pr-8 py-1.5 text-xs bg-zinc-900 border border-zinc-800 rounded text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition-colors"
      />
      {searchValue && (
        <button
          onClick={clearSearch}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 hover:bg-zinc-800 rounded transition-colors"
        >
          <Cross2Icon className="w-3 h-3 text-zinc-500" />
        </button>
      )}
    </div>
  );
}
