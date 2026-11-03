"use client";

import { useState, type FormEvent } from "react";
import { backendApiUrl } from "@/lib/backend-api";

export default function RsvpForm() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [isError, setIsError] = useState(false);
  const [ticketCode, setTicketCode] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setTicketCode("");

    const form = event.currentTarget;
    const formData = new FormData(form);
    try {
      const response = await fetch(
        `${backendApiUrl}/api/events/christmas/registrations`,
        {
          method: "POST",
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
        ticketCode?: string;
      };

      if (!response.ok || !result.ticketCode) {
        throw new Error(result.error ?? "Could not send your admission ticket.");
      }

      setTicketCode(result.ticketCode);
      setMessage("Your admission ticket has been sent to your email.");
      setIsError(false);
      form.reset();
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not complete your sign-up. Please try again.",
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
          {ticketCode && (
            <span className="mt-1 block font-mono font-semibold">
              Ticket code: {ticketCode}
            </span>
          )}
        </p>
      )}
    </section>
  );
}
