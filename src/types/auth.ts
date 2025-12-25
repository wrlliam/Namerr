/**
 * Extended auth types to include role field
 */

import { auth } from "@/src/lib/auth";

export type Session = typeof auth.$Infer.Session & {
  user: typeof auth.$Infer.Session.user & {
    role: "user" | "admin";
  };
};

export type User = typeof auth.$Infer.Session.user & {
  role: "user" | "admin";
};
