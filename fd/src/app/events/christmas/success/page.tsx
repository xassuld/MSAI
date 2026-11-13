"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { backendApiUrl } from "@/lib/backend-api";

export default function ChristmasCheckoutSuccessPage() {
  const [status, setStatus] = useState<
    | "checking"
    | "confirmed"
    | "processing"
    | "hold_reserved"
    | "hold_released"
    | "awaiting_payment"
    | "refunded"
    | "error"
  >("checking");

  const confirmPayment = useCallback(async () => {
    const sessionId = new URLSearchParams(window.location.search).get("session_id");
    if (!sessionId) {
      setStatus("error");
      return;
    }

    setStatus("checking");
    try {
      const response = await fetch(
        `${backendApiUrl}/api/events/christmas/checkout/confirm`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: AbortSignal.timeout(30_000),
          body: JSON.stringify({ sessionId }),
        },
      );
      const result = (await response.json()) as {
        status?:
          | "confirmed"
          | "processing"
          | "hold_reserved"
          | "hold_released"
          | "awaiting_payment"
          | "refunded";
      };
      if (!response.ok) throw new Error("Could not confirm the ticket.");
      setStatus(
        result.status === "refunded"
          ? "refunded"
          : result.status === "confirmed"
            ? "confirmed"
            : result.status === "processing"
              ? "processing"
              : result.status === "hold_reserved"
                ? "hold_reserved"
                : result.status === "hold_released"
                  ? "hold_released"
              : "awaiting_payment",
      );
    } catch {
      setStatus("error");
    }
  }, []);

  useEffect(() => {
    void Promise.resolve().then(confirmPayment);
  }, [confirmPayment]);

  const heading =
    status === "confirmed"
      ? "Payment confirmed"
      : status === "checking"
        ? "Confirming your payment"
        : status === "processing"
          ? "Preparing your ticket"
          : status === "hold_reserved"
            ? "Card authorization pending"
            : status === "hold_released"
              ? "No ticket was reserved"
              : status === "awaiting_payment"
                ? "Payment not confirmed yet"
                : status === "refunded"
                  ? "The event is sold out"
                  : "We couldn’t confirm your ticket yet";

  return (
    <main className="flex min-h-screen items-center justify-center px-5 py-12">
      <section className="w-full max-w-xl rounded-3xl border border-[#c7b995]/80 bg-[#fffdf8] p-8 text-center text-[#15294b] shadow-[0_30px_90px_rgb(21_41_75/14%)] sm:p-12">
        <p className="text-xs font-bold uppercase tracking-[.2em] text-[#24523c]">
          MSAI · Christmas event
        </p>
        <h1 className="mt-4 font-serif text-4xl">{heading}</h1>
        <p className="mt-4 text-sm leading-6 text-[#535044]">
          {status === "confirmed"
            ? "Your admission ticket and QR code have been sent to your email. If you don’t see them, check your spam or junk folder."
            : status === "checking"
              ? "We’re verifying your payment directly with Stripe. Please keep this page open."
              : status === "processing"
                ? "Your payment is confirmed, and your ticket is being prepared. Please check your email shortly."
                : status === "hold_reserved"
                  ? "Stripe authorized your card but has not captured payment. Your ticket capacity is reserved until the authorization expires. No ticket or email is issued until capture."
                  : status === "hold_released"
                    ? "The event has no remaining capacity, so the authorization was canceled. Your bank may take time to release the pending hold."
                : status === "awaiting_payment"
                  ? "Stripe has not confirmed the payment yet. Don’t pay again; retry confirmation or contact the event organizers if the problem continues."
                : status === "refunded"
                  ? "We couldn’t reserve a ticket because sales are full. Stripe has been asked to refund your payment; check your payment method for the refund."
                : "We couldn’t verify the ticket yet. Don’t pay again; retry below or contact the event organizers if the problem continues."}
        </p>
        {(status === "processing" ||
          status === "hold_reserved" ||
          status === "awaiting_payment" ||
          status === "error") && (
          <button
            className="mt-6 rounded-full border border-[#15294b]/30 px-5 py-3 text-sm font-semibold transition hover:bg-[#e8dfcf]"
            onClick={() => void confirmPayment()}
            type="button"
          >
            Retry confirmation
          </button>
        )}
        <Link
          className="mt-8 inline-flex rounded-full bg-[#15294b] px-5 py-3 text-sm font-semibold text-[#f5efe3] transition hover:bg-[#263d75]"
          href="/events/christmas"
        >
          Return to the event
        </Link>
      </section>
    </main>
  );
}
