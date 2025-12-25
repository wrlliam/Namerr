import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";

export default async function Home() {
  // Check if user is authenticated
  const session = await auth.api.getSession({ headers: await headers() });

  if (session?.user) {
    // Redirect authenticated users to dashboard
    redirect("/dashboard");
  }

  // Redirect unauthenticated users to login
  redirect("/login");
}
