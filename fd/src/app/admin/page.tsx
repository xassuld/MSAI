import type { Metadata } from "next";
import AdminEventEditor from "./admin-event-editor";

export const metadata: Metadata = {
  title: "Event Admin | Mongolian Students in Italy",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return <AdminEventEditor />;
}
