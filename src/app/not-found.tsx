"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    const t = setTimeout(() => {
      router.push("/");
    }, 2500);

    return () => clearTimeout(t);
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-black p-8">
      <div className="max-w-md text-center bg-white rounded-xl p-8 shadow">
        <h2 className="text-2xl font-semibold mb-2">Page not found</h2>
        <p className="text-sm text-zinc-600 mb-4">
          Redirecting to the homepage…
        </p>
        <button
          className="rounded-md bg-black text-white px-4 py-2 text-sm"
          onClick={() => router.push("/")}
        >
          Go to home
        </button>
      </div>
    </div>
  );
}
