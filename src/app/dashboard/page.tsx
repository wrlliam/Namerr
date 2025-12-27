import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { mediaLibraries, users } from "@/src/lib/db/schema";
import { eq } from "drizzle-orm";
import Link from "next/link";
import {
  GearIcon,
  PlusIcon,
  VideoIcon,
  DesktopIcon,
  CopyIcon,
  CounterClockwiseClockIcon,
  BarChartIcon,
} from "@radix-ui/react-icons";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    redirect("/login");
  }

  // Fetch user's role
  const userResult = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  const isAdmin = userResult[0]?.role === "admin";

  // Fetch libraries for this user (or all if admin)
  const libraries = await db
    .select()
    .from(mediaLibraries)
    .where(isAdmin ? undefined : eq(mediaLibraries.userId, session.user.id));

  return (
    <div className="min-h-screen bg-black">
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-xl font-semibold text-zinc-300">Namerr</h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              {libraries.length}{" "}
              {libraries.length === 1 ? "library" : "libraries"}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/libraries/new"
              className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 text-xs text-zinc-300 px-3 py-1.5 hover:border-zinc-700 transition-colors"
            >
              <PlusIcon className="w-3 h-3" />
              Add Library
            </Link>
            <Link
              href="/duplicates"
              className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 text-xs text-zinc-300 px-3 py-1.5 hover:border-zinc-700 transition-colors"
            >
              <CopyIcon className="w-3 h-3" />
              Duplicates
            </Link>
            <Link
              href="/history"
              className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 text-xs text-zinc-300 px-3 py-1.5 hover:border-zinc-700 transition-colors"
            >
              <CounterClockwiseClockIcon className="w-3 h-3" />
              History
            </Link>
            <Link
              href="/stats"
              className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 text-xs text-zinc-300 px-3 py-1.5 hover:border-zinc-700 transition-colors"
            >
              <BarChartIcon className="w-3 h-3" />
              Stats
            </Link>
            <Link
              href="/settings"
              className="flex items-center gap-1.5 rounded border border-zinc-800 bg-zinc-900 text-xs text-zinc-300 px-3 py-1.5 hover:border-zinc-700 transition-colors"
            >
              <GearIcon className="w-3 h-3" />
              Settings
            </Link>
          </div>
        </div>

        {/* Library Tabs */}
        {libraries.length > 0 ? (
          <div className="space-y-6">
            {/* Tab Navigation */}
            <div className="flex gap-2 border-b border-zinc-800 pb-2 overflow-x-auto">
              <button className="px-3 py-1.5 text-xs font-medium text-zinc-200 border-b border-zinc-200 whitespace-nowrap">
                All Libraries
              </button>
              {libraries.map((lib) => (
                <Link
                  key={lib.id}
                  href={`/libraries/${lib.id}`}
                  className="px-3 py-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-400 whitespace-nowrap transition-colors"
                >
                  {lib.label}
                </Link>
              ))}
            </div>

            {/* Libraries Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {libraries.map((lib) => (
                <Link
                  key={lib.id}
                  href={`/libraries/${lib.id}`}
                  className="bg-zinc-900 rounded border border-zinc-800 p-4 hover:border-zinc-700 transition-colors group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div
                      className={`p-2 rounded ${
                        lib.type === "movie"
                          ? "bg-violet-900/20 text-violet-400"
                          : "bg-emerald-900/20 text-emerald-400"
                      }`}
                    >
                      {lib.type === "movie" ? (
                        <VideoIcon className="w-4 h-4" />
                      ) : (
                        <DesktopIcon className="w-4 h-4" />
                      )}
                    </div>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        lib.scanStatus === "scanning"
                          ? "bg-blue-900/20 text-blue-400 border border-blue-900/50"
                          : lib.scanStatus === "error"
                            ? "bg-red-900/20 text-red-400 border border-red-900/50"
                            : "bg-zinc-800 text-zinc-500"
                      }`}
                    >
                      {lib.scanStatus || "idle"}
                    </span>
                  </div>

                  <h3 className="text-sm font-medium text-zinc-300 mb-1 group-hover:text-zinc-200 transition-colors">
                    {lib.label}
                  </h3>
                  <p className="text-xs text-zinc-500 mb-2">{lib.name}</p>
                  <p className="text-[10px] text-zinc-600 truncate">
                    {lib.path}
                  </p>

                  {lib.lastScanAt && (
                    <p className="text-[10px] text-zinc-600 mt-2">
                      Last scan:{" "}
                      {new Date(lib.lastScanAt).toLocaleDateString()}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </div>
        ) : (
          /* Empty State */
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="p-4 rounded-full bg-zinc-900 border border-zinc-800 mb-4">
              <VideoIcon className="w-8 h-8 text-zinc-600" />
            </div>
            <h2 className="text-sm font-medium text-zinc-300 mb-1">
              No libraries yet
            </h2>
            <p className="text-xs text-zinc-500 mb-4 max-w-sm">
              Add a media library to start organizing and renaming your files
              with Seerr metadata.
            </p>
            <Link
              href="/libraries/new"
              className="flex items-center gap-1.5 rounded bg-zinc-800 text-xs text-zinc-200 px-4 py-2 hover:bg-zinc-700 transition-colors"
            >
              <PlusIcon className="w-3 h-3" />
              Add Your First Library
            </Link>
          </div>
        )}

        {/* Quick Stats (if libraries exist) */}
        {libraries.length > 0 && (
          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
              <p className="text-xs text-zinc-500 mb-1">Total Libraries</p>
              <p className="text-lg font-medium text-zinc-300">
                {libraries.length}
              </p>
            </div>
            <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
              <p className="text-xs text-zinc-500 mb-1">Movie Libraries</p>
              <p className="text-lg font-medium text-zinc-300">
                {libraries.filter((l) => l.type === "movie").length}
              </p>
            </div>
            <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
              <p className="text-xs text-zinc-500 mb-1">TV Libraries</p>
              <p className="text-lg font-medium text-zinc-300">
                {libraries.filter((l) => l.type === "tv").length}
              </p>
            </div>
            <div className="bg-zinc-900 rounded border border-zinc-800 p-4">
              <p className="text-xs text-zinc-500 mb-1">Enabled</p>
              <p className="text-lg font-medium text-zinc-300">
                {libraries.filter((l) => l.enabled).length}
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
