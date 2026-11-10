import type { ReactNode } from "react";
import AdminSessionBoundary from "./admin-session-boundary";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminSessionBoundary>{children}</AdminSessionBoundary>;
}
