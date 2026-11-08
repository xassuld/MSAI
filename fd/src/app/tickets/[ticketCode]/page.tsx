import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { backendApiUrl } from "@/lib/backend-api";

type TicketData = {
  event: {
    title: string;
    date: string;
    time: string;
    location: string;
    posterUrl: string;
    partyDescription: string;
  };
  ticket: {
    code: string;
    tier: "earlyBird" | "regular" | "late";
    amountPaidCents: number;
    ticketNumber: number;
    isComplimentary: boolean;
    qrCodeDataUrl: string;
  };
};

const ticketTierLabels = {
  earlyBird: "Early Bird",
  regular: "Regular",
  late: "Late",
} as const;

export const metadata: Metadata = {
  title: "Admission Ticket | Mongolian Students in Italy",
};

function formatDate(date: string): string {
  if (!date) return "To be announced";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
}

export default async function TicketPage({
  params,
}: {
  params: Promise<{ ticketCode: string }>;
}) {
  const { ticketCode } = await params;
  const response = await fetch(
    `${backendApiUrl}/api/tickets/${encodeURIComponent(ticketCode)}`,
    { cache: "no-store" },
  );
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error("Could not load the ticket.");

  const data = (await response.json()) as TicketData;
  const { event, ticket } = data;
  const ticketType = ticket.isComplimentary
    ? "Complimentary"
    : ticketTierLabels[ticket.tier];

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6 sm:py-16">
      <article className="mx-auto w-full max-w-[720px] overflow-hidden rounded-[28px] border border-[#c7b995]/80 bg-[#fffdf8] text-[#15294b] shadow-[0_30px_90px_rgb(21_41_75/14%)]">
        <div aria-hidden="true" className="flex h-2">
          <span className="flex-1 bg-[#16845b]" />
          <span className="flex-1 bg-[#fffdf8]" />
          <span className="flex-1 bg-[#cf4d4d]" />
        </div>
        <div className="p-6 sm:p-10">
          <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#80643a]">
            Mongolian Students&apos; Association in Italy
          </p>
          <h1 className="mt-3 font-serif text-4xl">{event.title}</h1>

          <div className="mt-8 rounded-2xl bg-[#15294b] px-5 py-7 text-center text-[#fffdf8]">
            <p className="text-[11px] font-bold uppercase tracking-[.2em] text-[#e4c77e]">
              Ticket type
            </p>
            <p className="mt-2 text-5xl font-black tracking-tight sm:text-6xl">
              {ticketType}
            </p>
            <p className="mt-3 text-sm text-[#d9e1eb]">
              {ticket.isComplimentary
                ? "No payment required"
                : `€${(ticket.amountPaidCents / 100).toFixed(2)} paid`}
            </p>
          </div>

          <div className="mt-7 grid gap-5 sm:grid-cols-2">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#80643a]">
                Date
              </p>
              <p className="mt-1 text-sm font-semibold">{formatDate(event.date)}</p>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#80643a]">
                Time
              </p>
              <p className="mt-1 text-sm font-semibold">
                {event.time || "To be announced"}
              </p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#80643a]">
                Location
              </p>
              <p className="mt-1 text-sm font-semibold">
                {event.location || "To be announced"}
              </p>
            </div>
          </div>

          {event.posterUrl && (
            <Image
              src={event.posterUrl}
              alt={`${event.title} event poster`}
              width={640}
              height={360}
              className="mt-8 max-h-[360px] w-full rounded-xl object-contain"
            />
          )}

          <div className="mt-8 grid gap-5 rounded-2xl border border-[#c7b995] bg-[#f3ecdf] p-5 sm:grid-cols-[1fr_auto] sm:items-center sm:p-6">
            <div className="text-sm">
              <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#80643a]">
                Scan at entry
              </p>
              <p className="mt-2 font-semibold">Ticket code: {ticket.code}</p>
              <p className="mt-1 text-[#535044]">
                Ticket number: {ticket.ticketNumber} ·{" "}
                {ticket.isComplimentary ? "Complimentary admission" : "Payment confirmed"}
              </p>
              <p className="mt-3 text-xs leading-relaxed text-[#535044]">
                Scan this QR code to open this ticket and view its admission
                details.
              </p>
            </div>
            <Image
              alt={`QR code for ticket ${ticket.code}`}
              className="mx-auto h-40 w-40 rounded-lg border border-[#c7b995] bg-white p-2 sm:mx-0"
              height={160}
              src={ticket.qrCodeDataUrl}
              unoptimized
              width={160}
            />
          </div>
          {event.partyDescription && (
            <p className="mt-5 text-sm leading-6 text-[#535044]">
              <strong>What&apos;s included:</strong> {event.partyDescription}
            </p>
          )}
          <Link
            className="mt-8 inline-flex rounded-full border border-[#15294b]/20 px-4 py-2 text-xs font-semibold hover:bg-[#e8dfd0]"
            href="/events/christmas"
          >
            View event page
          </Link>
        </div>
      </article>
    </main>
  );
}
