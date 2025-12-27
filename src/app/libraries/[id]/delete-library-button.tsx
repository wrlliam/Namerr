"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { TrashIcon } from "@radix-ui/react-icons";

interface DeleteLibraryButtonProps {
  libraryId: string;
  libraryName: string;
  fileCount: number;
}

export function DeleteLibraryButton({
  libraryId,
  libraryName,
  fileCount,
}: DeleteLibraryButtonProps) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      const response = await fetch(`/api/libraries/${libraryId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        router.push("/dashboard");
        router.refresh();
      } else {
        const data = await response.json();
        alert(data.error || "Failed to delete library");
      }
    } catch (error) {
      console.error("Delete error:", error);
      alert("An error occurred while deleting the library");
    } finally {
      setIsDeleting(false);
      setShowConfirm(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        disabled={isDeleting}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-900/20 hover:bg-red-900/30 text-red-400 text-xs rounded border border-red-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <TrashIcon className="w-3 h-3" />
        Delete
      </button>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-[2px]"
            onClick={() => !isDeleting && setShowConfirm(false)}
          />
          <div className="relative w-full max-w-md mx-4 bg-zinc-900 rounded-lg border border-zinc-800 shadow-xl">
            <div className="p-4 border-b border-zinc-800">
              <h2 className="text-sm font-medium text-zinc-200">
                Delete Library
              </h2>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-zinc-400">
                Are you sure you want to delete{" "}
                <span className="text-zinc-200 font-medium">{libraryName}</span>?
              </p>
              <p className="text-xs text-zinc-500">
                This will remove the library and all {fileCount} associated media
                file records from the database. Your actual media files on disk
                will not be affected.
              </p>
              <div className="p-3 bg-red-900/20 border border-red-900/50 rounded text-xs text-red-400">
                This action cannot be undone.
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t border-zinc-800">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-medium rounded transition-colors bg-zinc-800 hover:bg-zinc-700 text-zinc-300 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-medium rounded transition-colors bg-red-600 hover:bg-red-700 text-white disabled:opacity-50"
              >
                {isDeleting ? "Deleting..." : "Delete Library"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
