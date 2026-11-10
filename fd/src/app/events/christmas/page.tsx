import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { backendApiUrl } from "@/lib/backend-api";
import RsvpForm from "./rsvp-form";

type EventData = {
  title: string;
  description: string;
  date: string;
  time: string;
  location: string;
  posterUrl: string;
  ticketInfo: string;
  partyDescription: string;
  maxCapacity: number;
  soldCount: number;
  isSoldOut: boolean;
  gateTicketsRemaining: number;
  activeTier: {
    name: string;
    price: number;
    remaining: number;
  } | null;
};

const ticketTiers = [
  {
    key: "earlyBird",
    name: "Early Bird",
    price: 15,
    ticketRange: "First 20 paid sales",
  },
  {
    key: "regular",
    name: "Regular",
    price: 25,
    ticketRange: "Next 55 paid sales",
  },
  {
    key: "late",
    name: "Late",
    price: 28,
    ticketRange: "Next 25 paid sales",
  },
  {
    key: "atGate",
    name: "At-gate · Cash only",
    price: 28,
    ticketRange: "Up to 20 tickets · In-person only",
  },
] as const;

function formatPrice(price: number): string {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency: "EUR",
  }).format(price);
}

export const metadata: Metadata = {
  title: "Christmas Gathering | Mongolian Students in Italy",
  description:
    "Christmas gathering invitation for the Mongolian Students’ Association in Italy.",
};

export default async function ChristmasPage() {
  const response = await fetch(`${backendApiUrl}/api/events/christmas`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Could not load the event from the backend.");
  }

  const event = (await response.json()) as EventData;
  const formattedDate = event.date
    ? new Intl.DateTimeFormat("en", {
        dateStyle: "long",
        timeZone: "UTC",
      }).format(new Date(`${event.date}T12:00:00Z`))
    : "";
  const activeTicket = ticketTiers.find(
    (tier) => tier.name === event.activeTier?.name,
  );

  return (
    <main className="relative flex min-h-screen items-center justify-center px-5 py-12 max-[480px]:px-[14px] sm:py-16">
      <article className="w-full max-w-[1040px] overflow-hidden rounded-[30px] border border-[#c7b995]/80 bg-[#f7f2e8] text-[#15294b] shadow-[0_30px_90px_rgb(21_41_75/14%)]">
        <div aria-hidden="true" className="flex h-2">
          <span className="flex-1 bg-[#16845b]" />
          <span className="flex-1 bg-[#fffdf8]" />
          <span className="flex-1 bg-[#cf4d4d]" />
        </div>

        <div className="grid items-stretch lg:grid-cols-[1fr_0.92fr]">
          <section className="order-2 flex flex-col px-7 py-8 sm:px-12 sm:py-11 lg:order-1 lg:px-14 lg:py-12">
            <Link
              className="inline-flex w-fit items-center rounded-full border border-[#15294b]/20 px-4 py-2 text-[10px] font-semibold uppercase tracking-[.12em] text-[#15294b] transition hover:bg-[#e8dfd0] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#15294b]"
              href="/"
            >
              <span aria-hidden="true" className="mr-2">
                ←
              </span>
              Back to MSAI
            </Link>

            <div className="mt-12 lg:mt-16">
              <p className="text-[9px] font-bold uppercase tracking-[.2em] text-[#80643a]">
                Mongolian Students’ Association in Italy
              </p>
              <div aria-hidden="true" className="my-5 text-3xl text-[#c59d50]">
                ✦
              </div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#24523c]">
                You&apos;re invited
              </p>
              <h1 className="mt-3 font-serif text-[clamp(42px,7vw,68px)] leading-[.98] tracking-[-.045em]">
                {event.title}
              </h1>
              <p className="mt-5 max-w-[390px] text-[15px] leading-7 text-[#535044]">
                {event.description}
              </p>
            </div>

            <div className="mt-9 border-t border-[#b9aa8c]/70 pt-6">
              {(formattedDate || event.time || event.location) ? (
                <dl className="grid gap-4 sm:grid-cols-2">
                  {formattedDate && (
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-[.16em] text-[#80643a]">
                        Date
                      </dt>
                      <dd className="mt-1 text-sm font-medium">{formattedDate}</dd>
                    </div>
                  )}
                  {event.time && (
                    <div>
                      <dt className="text-[9px] font-bold uppercase tracking-[.16em] text-[#80643a]">
                        Time
                      </dt>
                      <dd className="mt-1 text-sm font-medium">{event.time}</dd>
                    </div>
                  )}
                  {event.location && (
                    <div className="sm:col-span-2">
                      <dt className="text-[9px] font-bold uppercase tracking-[.16em] text-[#80643a]">
                        Location
                      </dt>
                      <dd className="mt-1 text-sm font-medium">{event.location}</dd>
                    </div>
                  )}
                </dl>
              ) : (
                <div className="flex items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#e8dfcc] text-[#80643a]"
                  >
                    ✦
                  </span>
                  <div>
                    <p className="text-sm font-semibold">Event details coming soon</p>
                    <p className="mt-1 text-xs leading-relaxed text-[#666256]">
                      Date and location will be shared here soon.
                    </p>
                  </div>
                </div>
              )}
              {event.ticketInfo && (
                <p className="mt-5 max-w-[380px] text-xs leading-relaxed text-[#666256]">
                  {event.ticketInfo}
                </p>
              )}
            </div>

            <section className="mt-7 grid gap-4">
              <div className="rounded-2xl border-2 border-[#24523c]/20 bg-[#dce5d6] px-5 py-5 text-center text-[#24523c] shadow-[0_8px_20px_rgb(36_82_60/10%)]">
                <p className="text-[11px] font-black uppercase tracking-[.16em]">
                  Pay securely online — your ticket is issued after payment
                </p>
              </div>
              <p className="rounded-xl border border-[#923a35]/20 bg-[#f0ded6] px-4 py-3 text-center text-xs font-bold text-[#923a35]">
                All ticket sales are final. No refunds.
              </p>
              {event.partyDescription && (
                <div className="rounded-2xl border border-[#c7b995] bg-[#fffdf8]/70 px-5 py-4">
                  <p className="text-[9px] font-bold uppercase tracking-[.16em] text-[#80643a]">
                    What&apos;s included
                  </p>
                  <p className="mt-2 text-sm leading-relaxed text-[#535044]">
                    {event.partyDescription}
                  </p>
                </div>
              )}
              <div className="rounded-2xl border border-[#24523c]/20 bg-[#dce5d6] px-5 py-4 text-[#24523c]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-[9px] font-bold uppercase tracking-[.16em]">
                    Ticket prices
                  </p>
                  {activeTicket && (
                    <span className="rounded-full bg-[#24523c] px-3 py-1 text-[9px] font-bold uppercase tracking-[.1em] text-white">
                      {activeTicket.name} now
                    </span>
                  )}
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {ticketTiers.map((tier) => (
                    <div
                      className={`rounded-xl border px-3 py-3 ${
                        activeTicket?.key === tier.key
                          ? "border-[#24523c] bg-white/70"
                          : "border-[#24523c]/15 bg-white/35"
                      }`}
                      key={tier.key}
                    >
                      <p className="text-xs font-bold">{tier.name}</p>
                      <p className="mt-1 text-xl font-semibold">{formatPrice(tier.price)}</p>
                      <p className="mt-1 text-[10px] leading-relaxed text-[#24523c]/75">
                        {tier.ticketRange}
                      </p>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs font-semibold">
                  {event.isSoldOut
                    ? event.gateTicketsRemaining > 0
                      ? `Online sales are closed. ${event.gateTicketsRemaining} cash-only At-gate ${
                          event.gateTicketsRemaining === 1 ? "ticket is" : "tickets are"
                        } available in person.`
                      : "Sold out — all 120 admission tickets have been issued."
                    : `${event.activeTier?.name ?? "Tickets"} · ${event.activeTier?.remaining ?? 0} tickets remaining`}
                </p>
                <p className="mt-2 text-xs">
                  {event.gateTicketsRemaining} At-gate tickets remain. Available
                  in person at any time while supplies last. Cash only · €28.
                </p>
              </div>
            </section>

            <RsvpForm soldOut={event.isSoldOut} />

            <p className="mt-auto pt-10 text-[9px] font-medium uppercase tracking-[.16em] text-[#77786f]">
              Mongolia <span className="px-1 text-[#c59d50]">×</span> Italia
            </p>
          </section>

          <section
            aria-label="Event poster"
            className="relative order-1 flex flex-col items-center justify-center overflow-hidden bg-[#e8dfcf] px-7 py-9 sm:px-12 lg:order-2 lg:px-10 lg:py-12"
          >
            <div
              aria-hidden="true"
              className="absolute -right-24 -top-24 h-72 w-72 rounded-full border border-[#c5b696]/50"
            />
            <div
              aria-hidden="true"
              className="absolute -bottom-28 -left-24 h-72 w-72 rounded-full border border-[#c5b696]/50"
            />
            <p className="relative mb-4 text-[9px] font-bold uppercase tracking-[.2em] text-[#80643a]">
              The event poster
            </p>
            <div className="relative w-full max-w-[390px] rotate-[1deg] rounded-[3px] bg-white p-2 shadow-[0_22px_45px_rgb(37_35_28/24%)] sm:p-[10px]">
              <div className="relative aspect-[210/297] overflow-hidden bg-[#f3ecdf]">
                {event.posterUrl ? (
                  <Image
                    alt={`${event.title} event poster`}
                    className="h-full w-full object-contain"
                    fill
                    priority
                    sizes="(max-width: 768px) 85vw, 390px"
                    src={event.posterUrl}
                    unoptimized
                  />
                ) : (
                  <div className="flex h-full flex-col items-center justify-center px-8 text-center">
                    <svg className="h-[68px] w-[68px]" viewBox="0 0 80 80" fill="none">
                      <path
                        d="M40 11 26 31h8L21 46h13L19 62h42L46 46h13L46 31h8L40 11Z"
                        fill="#28563f"
                      />
                      <path d="M36 62h8v9h-8z" fill="#805d40" />
                      <path
                        d="m40 8 1.8 4 4.3.4-3.2 2.8 1 4.2-3.9-2.2-3.8 2.2.9-4.2-3.2-2.8 4.3-.4L40 8Z"
                        fill="#c59d50"
                      />
                      <circle cx="34" cy="37" r="2" fill="#cf4d4d" />
                      <circle cx="46" cy="47" r="2" fill="#c59d50" />
                      <circle cx="34" cy="54" r="2" fill="#cf4d4d" />
                    </svg>
                    <p className="mt-6 text-[9px] font-bold uppercase tracking-[.2em] text-[#24523c]">
                      You&apos;re invited
                    </p>
                    <h2 className="mt-3 font-serif text-3xl leading-tight text-[#15294b]">
                      {event.title}
                    </h2>
                    <p className="mt-4 text-xs leading-relaxed text-[#666256]">
                      Official poster coming soon
                    </p>
                  </div>
                )}
              </div>
            </div>
            <p className="relative mt-5 text-[9px] font-medium uppercase tracking-[.16em] text-[#77786f]">
              Mongolia <span className="px-1 text-[#c59d50]">×</span> Italia
            </p>
          </section>
        </div>
      </article>
    </main>
  );
}
