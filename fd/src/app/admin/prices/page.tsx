import type { Metadata } from "next";
import AdminPricesEditor from "./prices-editor";

export const metadata: Metadata = {
  title: "Ticket Prices | Mongolian Students in Italy",
  robots: { index: false, follow: false },
};

export default function AdminPricesPage() {
  return <AdminPricesEditor />;
}
