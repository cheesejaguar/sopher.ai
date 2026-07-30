import type { ReactNode } from "react";

import { ClerkRouteProvider } from "@/components/auth/clerk-route-provider";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return <ClerkRouteProvider>{children}</ClerkRouteProvider>;
}
