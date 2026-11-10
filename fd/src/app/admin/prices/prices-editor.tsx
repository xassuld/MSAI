"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import AdminNavigation from "../admin-navigation";

const adminApiUrl = "/api/admin";

type TicketPrices = {
  earlyBird: number;
  regular: number;
  late: number;
  atGate: number;
};

type TicketPriceInputs = Record<keyof TicketPrices, string>;

const priceFields: { key: keyof TicketPrices; label: string; detail: string }[] = [
  { key: "earlyBird", label: "Early Bird", detail: "First 20 online tickets" },
  { key: "regular", label: "Regular", detail: "Next 55 online tickets" },
  { key: "late", label: "Late", detail: "Next 25 online tickets" },
  { key: "atGate", label: "At-gate · Cash only", detail: "Up to 20 in-person tickets" },
];
const priceKeys: (keyof TicketPrices)[] = [
  "earlyBird",
  "regular",
  "late",
  "atGate",
];

function toPriceInputs(prices: TicketPrices): TicketPriceInputs {
  return {
    earlyBird: (prices.earlyBird / 100).toFixed(2),
    regular: (prices.regular / 100).toFixed(2),
    late: (prices.late / 100).toFixed(2),
    atGate: (prices.atGate / 100).toFixed(2),
  };
}

export default function AdminPricesEditor() {
  const router = useRouter();
  const [prices, setPrices] = useState<TicketPriceInputs | null>(null);
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let active = true;
    fetch(`${adminApiUrl}/events/christmas`, {
      cache: "no-store",
      credentials: "include",
    })
      .then(async (response) => {
        const result = (await response.json()) as {
          error?: string;
          ticketPrices?: TicketPrices;
        };
        if (response.status === 401) return;
        if (!response.ok || !result.ticketPrices) {
          throw new Error(result.error ?? "Could not load ticket prices.");
        }
        if (active) {
          setPrices(toPriceInputs(result.ticketPrices));
          setAuthenticated(true);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setMessage(
            cause instanceof Error ? cause.message : "Could not load ticket prices.",
          );
          setIsError(true);
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!loading && !authenticated && !message) router.replace("/admin");
  }, [authenticated, loading, message, router]);

  async function savePrices(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!prices) return;

    if (
      priceKeys.some(
        (key) =>
          !/^\d+(?:\.\d{1,2})?$/.test(prices[key]) ||
          Number(prices[key]) < 0.01 ||
          Number(prices[key]) > 10000,
      )
    ) {
      setMessage("Enter each price from €0.01 to €10,000.00 with up to two decimals.");
      setIsError(true);
      return;
    }

    const ticketPrices: TicketPrices = {
      earlyBird: Math.round(Number(prices.earlyBird) * 100),
      regular: Math.round(Number(prices.regular) * 100),
      late: Math.round(Number(prices.late) * 100),
      atGate: Math.round(Number(prices.atGate) * 100),
    };
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(`${adminApiUrl}/ticket-prices`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketPrices }),
      });
      const result = (await response.json()) as {
        error?: string;
        ticketPrices?: TicketPrices;
      };
      if (!response.ok || !result.ticketPrices) {
        throw new Error(result.error ?? "Could not save ticket prices.");
      }
      setPrices(toPriceInputs(result.ticketPrices));
      setMessage("Prices saved. New checkout sessions will use these amounts.");
      setIsError(false);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "Could not save ticket prices.");
      setIsError(true);
    } finally {
      setSaving(false);
    }
  }

  function updatePrice(key: keyof TicketPrices, value: string) {
    if (!prices) return;
    setPrices({ ...prices, [key]: value });
  }

  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <section className="mx-auto w-full max-w-[620px] rounded-[26px] border border-[#15294b]/20 bg-[#f3ecdf]/90 p-6 text-[#15294b] shadow-[0_20px_65px_rgb(21_41_75/12%)] sm:p-9">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#80643a]">
              MSAI · Admin
            </p>
            <h1 className="mt-2 font-serif text-3xl text-[#15294b]">
              Ticket prices
            </h1>
            <p className="mt-2 text-sm text-[#62645f]">
              Set the amounts displayed on the event page and charged by Stripe.
            </p>
          </div>
        </div>

        <AdminNavigation active="prices" />

        {loading ? (
          <p aria-live="polite" className="py-8 text-center text-sm text-[#62645f]">
            Loading ticket prices…
          </p>
        ) : !authenticated ? (
          <p aria-live="polite" className="py-8 text-center text-sm text-[#62645f]" role="status">
            Redirecting to admin sign-in…
          </p>
        ) : (
          <form className="grid gap-5" onSubmit={savePrices}>
            {priceFields.map((field) => (
              <label
                className="grid gap-1 rounded-2xl border border-[#c7b995]/70 bg-white/45 p-4 text-sm font-semibold"
                key={field.key}
              >
                <span>{field.label}</span>
                <span className="text-xs font-normal text-[#62645f]">{field.detail}</span>
                <span className="mt-1 flex items-center rounded-xl border border-[#c7b995] bg-[#fffdf8] px-3.5 text-[#15294b] focus-within:border-[#15294b] focus-within:ring-2 focus-within:ring-[#15294b]/15">
                  <span aria-hidden="true">€</span>
                  <input
                    className="w-full bg-transparent px-2 py-3 outline-none"
                    inputMode="decimal"
                    onChange={(event) => updatePrice(field.key, event.target.value)}
                    pattern="[0-9]+([.][0-9]{1,2})?"
                    required
                    type="text"
                    value={prices?.[field.key] ?? ""}
                  />
                </span>
              </label>
            ))}

            <p className="rounded-xl border border-[#c7b995]/60 bg-white/40 px-4 py-3 text-xs leading-relaxed text-[#62645f]">
              Price changes apply to new checkout sessions. A checkout already
              opened by a customer keeps its displayed price.
            </p>
            <button
              className="rounded-xl bg-[#15294b] px-5 py-3.5 text-sm font-semibold text-[#f5efe3] transition hover:bg-[#263d75] disabled:opacity-50"
              disabled={saving || !prices}
              type="submit"
            >
              {saving ? "Saving prices…" : "Save prices"}
            </button>
            {message && (
              <p
                aria-live="polite"
                className={`text-sm ${isError ? "text-[#923a35]" : "text-[#24523c]"}`}
                role={isError ? "alert" : "status"}
              >
                {message}
              </p>
            )}
          </form>
        )}
      </section>
    </main>
  );
}
