import { redirect, notFound } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { mediaLibraries, mediaFiles, users } from "@/src/lib/db/schema";
import { eq, and, count } from "drizzle-orm";
import Link from "next/link";
import {
  ArrowLeftIcon,
  ReloadIcon,
  VideoIcon,
  DesktopIcon,
  CheckCircledIcon,
  CrossCircledIcon,
  ClockIcon,
} from "@radix-ui/react-icons";
import { ScanButton } from "./scan-button";
import { RefreshMetadataButton } from "./refresh-metadata-button";
import { formatFileSize } from "@/src/lib/file-scanner";

interface PageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; status?: string; search?: string }>;
}

export default async function LibraryDetailPage({
  params,
  searchParams,
}: PageProps) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  const { id } = await params;
  const { page = "1", status = "all", search = "" } = await searchParams;

  // Fetch user's role
  const userResult = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const isAdmin = userResult[0]?.role === "admin";

  // Check library exists and user has access
  const conditions = [eq(mediaLibraries.id, id)];
  if (!isAdmin) {
    conditions.push(eq(mediaLibraries.userId, session.user.id));
  }

  const [library] = await db
    .select()
    .from(mediaLibraries)
    .where(and(...conditions))
    .limit(1);

  if (!library) {
    notFound();
  }

  // Pagination
  const pageNum = parseInt(page, 10) || 1;
  const limit = 50;
  const offset = (pageNum - 1) * limit;

  // Build query for media files
  const mediaConditions = [eq(mediaFiles.libraryId, id)];
  if (status !== "all") {
    mediaConditions.push(eq(mediaFiles.renameStatus, status));
  }

  // Get total count
  const [{ value: totalCount }] = await db
    .select({ value: count() })
    .from(mediaFiles)
    .where(and(...mediaConditions));

  // Get media files
  const files = await db
    .select()
    .from(mediaFiles)
    .where(and(...mediaConditions))
    .orderBy(mediaFiles.fileName)
    .limit(limit)
    .offset(offset);

  const totalPages = Math.ceil(totalCount / limit);

  // Get status counts
  const statusCounts = await db
    .select({
      status: mediaFiles.renameStatus,
      count: count(),
    })
    .from(mediaFiles)
    .where(eq(mediaFiles.libraryId, id))
    .groupBy(mediaFiles.renameStatus);

  const counts = statusCounts.reduce(
    (acc, { status, count }) => {
      if (status) acc[status] = Number(count);
      return acc;
    },
    { pending: 0, ready: 0, renamed: 0, error: 0, skipped: 0 } as Record<
      string,
      number
    >
  );

  const getStatusBadge = (fileStatus: string | null) => {
    switch (fileStatus) {
      case "renamed":
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-900/20 text-green-400 border border-green-900/50">
            <CheckCircledIcon className="w-3 h-3" />
            Renamed
          </span>
        );
      case "ready":
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-900/20 text-blue-400 border border-blue-900/50">
            <ClockIcon className="w-3 h-3" />
            Ready
          </span>
        );
      case "error":
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-900/20 text-red-400 border border-red-900/50">
            <CrossCircledIcon className="w-3 h-3" />
            Error
          </span>
        );
      case "skipped":
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
            Skipped
          </span>
        );
      default:
        return (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
            Pending
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="text-zinc-500 hover:text-zinc-400 transition-colors"
            >
              <ArrowLeftIcon className="w-4 h-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div
                  className={`p-1.5 rounded ${
                    library.type === "movie"
                      ? "bg-violet-900/20 text-violet-400"
                      : "bg-emerald-900/20 text-emerald-400"
                  }`}
                >
                  {library.type === "movie" ? (
                    <VideoIcon className="w-4 h-4" />
                  ) : (
                    <DesktopIcon className="w-4 h-4" />
                  )}
                </div>
                <h1 className="text-xl font-medium text-zinc-300">
                  {library.label}
                </h1>
              </div>
              <p className="text-xs text-zinc-500">
                {library.path} • {totalCount} files
              </p>
            </div>
          </div>

          <div className="flex gap-2">
            <ScanButton libraryId={id} scanStatus={library.scanStatus} />
            <RefreshMetadataButton libraryId={id} fileCount={totalCount} />
          </div>
        </div>

        {/* Status Filters */}
        <div className="flex gap-2 mb-6 flex-wrap">
          <Link
            href={`/libraries/${id}?status=all`}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              status === "all"
                ? "bg-zinc-800 text-zinc-200 border-zinc-700"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-400"
            }`}
          >
            All ({totalCount})
          </Link>
          <Link
            href={`/libraries/${id}?status=pending`}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              status === "pending"
                ? "bg-zinc-800 text-zinc-200 border-zinc-700"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-400"
            }`}
          >
            Pending ({counts.pending || 0})
          </Link>
          <Link
            href={`/libraries/${id}?status=ready`}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              status === "ready"
                ? "bg-blue-900/30 text-blue-400 border-blue-900/50"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-400"
            }`}
          >
            Ready ({counts.ready || 0})
          </Link>
          <Link
            href={`/libraries/${id}?status=renamed`}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              status === "renamed"
                ? "bg-green-900/30 text-green-400 border-green-900/50"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-400"
            }`}
          >
            Renamed ({counts.renamed || 0})
          </Link>
          <Link
            href={`/libraries/${id}?status=error`}
            className={`px-3 py-1.5 text-xs rounded border transition-colors ${
              status === "error"
                ? "bg-red-900/30 text-red-400 border-red-900/50"
                : "border-zinc-800 text-zinc-500 hover:text-zinc-400"
            }`}
          >
            Errors ({counts.error || 0})
          </Link>
        </div>

        {/* Media Grid */}
        {files.length > 0 ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {files.map((file) => (
                <Link
                  key={file.id}
                  href={`/media/${file.id}`}
                  className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden hover:border-zinc-700 transition-colors group"
                >
                  {/* Poster placeholder */}
                  <div className="aspect-[2/3] bg-zinc-800 relative flex items-center justify-center">
                    {file.seerrPosterPath ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={`https://image.tmdb.org/t/p/w300${file.seerrPosterPath}`}
                        alt={file.parsedTitle || file.fileName}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="text-zinc-600">
                        {library.type === "movie" ? (
                          <VideoIcon className="w-8 h-8" />
                        ) : (
                          <DesktopIcon className="w-8 h-8" />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-3">
                    <h4 className="text-xs font-medium text-zinc-300 truncate group-hover:text-zinc-200 transition-colors">
                      {file.manualTitle ||
                        file.seerrTitle ||
                        file.parsedTitle ||
                        file.fileName}
                    </h4>
                    {(file.manualYear ||
                      file.seerrYear ||
                      file.parsedYear ||
                      file.parsedSeason) && (
                      <p className="text-[10px] text-zinc-500 mt-0.5">
                        {library.type === "movie"
                          ? file.manualYear || file.seerrYear || file.parsedYear
                          : `S${String(file.parsedSeason || 1).padStart(2, "0")}E${String(file.parsedEpisode || 1).padStart(2, "0")}`}
                      </p>
                    )}
                    <div className="flex items-center justify-between mt-2">
                      {getStatusBadge(file.renameStatus)}
                      <span className="text-[10px] text-zinc-600">
                        {formatFileSize(file.fileSize || 0)}
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 mt-8">
                {pageNum > 1 && (
                  <Link
                    href={`/libraries/${id}?page=${pageNum - 1}&status=${status}`}
                    className="px-3 py-1.5 text-xs rounded border border-zinc-800 text-zinc-400 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
                  >
                    Previous
                  </Link>
                )}
                <span className="text-xs text-zinc-500">
                  Page {pageNum} of {totalPages}
                </span>
                {pageNum < totalPages && (
                  <Link
                    href={`/libraries/${id}?page=${pageNum + 1}&status=${status}`}
                    className="px-3 py-1.5 text-xs rounded border border-zinc-800 text-zinc-400 hover:text-zinc-300 hover:border-zinc-700 transition-colors"
                  >
                    Next
                  </Link>
                )}
              </div>
            )}
          </>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-full bg-zinc-900 border border-zinc-800 mb-4">
              <ReloadIcon className="w-6 h-6 text-zinc-600" />
            </div>
            <h2 className="text-sm font-medium text-zinc-300 mb-1">
              No media files found
            </h2>
            <p className="text-xs text-zinc-500 max-w-sm">
              {status !== "all"
                ? `No files with "${status}" status. Try a different filter.`
                : "Scan this library to discover media files."}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
