import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { workerJobs, mediaLibraries } from "@/src/lib/db/schema";
import { desc, eq } from "drizzle-orm";
import Link from "next/link";
import {
  CheckCircledIcon,
  CrossCircledIcon,
  ClockIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";

export default async function JobsPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  // Get recent jobs
  const jobs = await db
    .select({
      id: workerJobs.id,
      type: workerJobs.type,
      status: workerJobs.status,
      progress: workerJobs.progress,
      totalItems: workerJobs.totalItems,
      processedItems: workerJobs.processedItems,
      errorCount: workerJobs.errorCount,
      dryRun: workerJobs.dryRun,
      startedAt: workerJobs.startedAt,
      completedAt: workerJobs.completedAt,
      createdAt: workerJobs.createdAt,
      libraryName: mediaLibraries.name,
    })
    .from(workerJobs)
    .leftJoin(mediaLibraries, eq(workerJobs.libraryId, mediaLibraries.id))
    .orderBy(desc(workerJobs.createdAt))
    .limit(50);

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "completed":
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-900/20 text-green-400 border border-green-900/50">
            <CheckCircledIcon className="w-3 h-3" />
            Completed
          </span>
        );
      case "running":
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-blue-900/20 text-blue-400 border border-blue-900/50">
            <ReloadIcon className="w-3 h-3 animate-spin" />
            Running
          </span>
        );
      case "failed":
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-900/20 text-red-400 border border-red-900/50">
            <CrossCircledIcon className="w-3 h-3" />
            Failed
          </span>
        );
      default:
        return (
          <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
            <ClockIcon className="w-3 h-3" />
            Queued
          </span>
        );
    }
  };

  const formatDuration = (started: Date | null, completed: Date | null) => {
    if (!started || !completed) return "-";
    const duration = completed.getTime() - started.getTime();
    const seconds = Math.floor(duration / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <main className="mx-auto w-full max-w-6xl px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-xl font-medium text-zinc-300">Worker Jobs</h1>
          <p className="text-xs text-zinc-500 mt-0.5">
            View history of automated renaming jobs
          </p>
        </div>

        {/* Jobs Table */}
        {jobs.length > 0 ? (
          <div className="bg-zinc-900 rounded border border-zinc-800 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-zinc-800/50 border-b border-zinc-800">
                  <tr>
                    <th className="px-4 py-2 text-left text-[10px] font-medium text-zinc-400">
                      Library
                    </th>
                    <th className="px-4 py-2 text-left text-[10px] font-medium text-zinc-400">
                      Status
                    </th>
                    <th className="px-4 py-2 text-left text-[10px] font-medium text-zinc-400">
                      Progress
                    </th>
                    <th className="px-4 py-2 text-left text-[10px] font-medium text-zinc-400">
                      Mode
                    </th>
                    <th className="px-4 py-2 text-left text-[10px] font-medium text-zinc-400">
                      Duration
                    </th>
                    <th className="px-4 py-2 text-left text-[10px] font-medium text-zinc-400">
                      Started
                    </th>
                    <th className="px-4 py-2 text-left text-[10px] font-medium text-zinc-400">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {jobs.map((job) => (
                    <tr
                      key={job.id}
                      className="hover:bg-zinc-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 text-xs text-zinc-300">
                        {job.libraryName || "Unknown"}
                      </td>
                      <td className="px-4 py-3">{getStatusBadge(job.status)}</td>
                      <td className="px-4 py-3 text-xs text-zinc-400">
                        {job.totalItems && job.totalItems > 0 ? (
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-zinc-800 rounded overflow-hidden">
                              <div
                                className="h-full bg-blue-500 transition-all"
                                style={{
                                  width: `${job.progress || 0}%`,
                                }}
                              />
                            </div>
                            <span className="text-[10px] text-zinc-500 min-w-[60px]">
                              {job.processedItems}/{job.totalItems}
                            </span>
                          </div>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {job.dryRun ? (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/20 text-yellow-400 border border-yellow-900/50">
                            Dry Run
                          </span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-500">
                            Live
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-400">
                        {formatDuration(job.startedAt, job.completedAt)}
                      </td>
                      <td className="px-4 py-3 text-xs text-zinc-500">
                        {job.createdAt
                          ? new Date(job.createdAt).toLocaleString()
                          : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/jobs/${job.id}`}
                          className="text-xs text-blue-400 hover:text-blue-300 underline"
                        >
                          View Logs
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center bg-zinc-900 rounded border border-zinc-800">
            <ClockIcon className="w-8 h-8 text-zinc-600 mb-3" />
            <h2 className="text-sm font-medium text-zinc-300 mb-1">
              No jobs yet
            </h2>
            <p className="text-xs text-zinc-500 max-w-sm">
              Worker jobs will appear here once they start running. The worker
              service runs automatically every 4 hours.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
