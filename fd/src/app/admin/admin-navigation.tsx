import Link from "next/link";

type AdminSection = "details" | "recipients" | "prices";

const sections: { href: string; key: AdminSection; label: string }[] = [
  { href: "/admin", key: "details", label: "Event details" },
  { href: "/admin/tickets", key: "recipients", label: "Recipients" },
  { href: "/admin/prices", key: "prices", label: "Prices" },
];

export default function AdminNavigation({
  active,
}: {
  active: AdminSection;
}) {
  return (
    <nav aria-label="Admin sections" className="mb-7 flex flex-wrap gap-2">
      {sections.map((section) => (
        <Link
          aria-current={section.key === active ? "page" : undefined}
          className={`rounded-full border px-4 py-2 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15294b] ${
            section.key === active
              ? "border-[#15294b] bg-[#15294b] text-[#f5efe3]"
              : "border-[#15294b]/20 text-[#15294b] hover:bg-[#e8dfd0]"
          }`}
          href={section.href}
          key={section.key}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
