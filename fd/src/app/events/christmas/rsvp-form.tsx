"use client";

import { useState, type FormEvent } from "react";
import { backendApiUrl } from "@/lib/backend-api";

export default function RsvpForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const response = await fetch(
        `${backendApiUrl}/api/events/christmas/checkout`,
        {
          method: "POST",
          signal: AbortSignal.timeout(30_000),
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formData.get("name"),
            email: formData.get("email"),
            consent: formData.get("consent") === "on",
          }),
        },
      );
      const result = (await response.json()) as {
        error?: string;
        checkoutUrl?: string;
      };

      if (!response.ok || !result.checkoutUrl) {
        throw new Error(result.error ?? "Could not start checkout.");
      }

      if (!result.checkoutUrl) {
        throw new Error("Could not start checkout.");
      }

      window.location.assign(result.checkoutUrl);
    } catch (error) {
      setMessage(
        error instanceof DOMException && error.name === "TimeoutError"
          ? "The request timed out. Please try again."
          : error instanceof Error
          ? error.message
          : "Could not start checkout. Please try again.",
      );
      setIsError(true);
    } finally {
      setBusy(false);
    }
  }

  const fieldClass =
    "mt-1.5 w-full rounded-xl border border-[#c7b995] bg-[#fffdf8] px-3.5 py-3 text-sm text-[#15294b] outline-none transition focus:border-[#15294b] focus:ring-2 focus:ring-[#15294b]/15";

  return (
    <section className="mt-8 border-t border-[#b9aa8c]/70 pt-6">
      <h2 className="font-serif text-2xl text-[#15294b]">Sign up to attend</h2>
      <p className="mt-2 text-sm leading-relaxed text-[#62645f]">
        Enter your details and we’ll email your admission ticket.
      </p>
      <form className="mt-5 grid gap-4" onSubmit={handleSubmit}>
        <label className="grid text-sm font-semibold text-[#15294b]">
          Full name
          <input
            autoComplete="name"
            className={fieldClass}
            maxLength={120}
            name="name"
            required
          />
        </label>
        <label className="grid text-sm font-semibold text-[#15294b]">
          Email
          <input
            autoComplete="email"
            className={fieldClass}
            maxLength={254}
            name="email"
            required
            type="email"
          />
        </label>
        <label className="flex items-start gap-2 text-xs leading-relaxed text-[#62645f]">
          <input
            className="mt-0.5 accent-[#15294b]"
            name="consent"
            required
            type="checkbox"
          />
          <span>
            I agree to provide my name and email so the organizers can manage
            this event and send my admission ticket.
          </span>
        </label>
        <button
          className="rounded-xl bg-[#15294b] px-5 py-3.5 text-sm font-semibold text-[#f5efe3] transition hover:bg-[#263d75] disabled:opacity-50"
          disabled={busy}
          type="submit"
        >
          {busy ? "Sending ticket…" : "Sign up"}
        </button>
      </form>
      {message && (
        <p
          aria-live="polite"
          className={`mt-4 text-sm ${isError ? "text-red-700" : "text-[#24523c]"}`}
          role={isError ? "alert" : "status"}
        >
          {message}
        </p>
      )}
    </section>
  );
}
