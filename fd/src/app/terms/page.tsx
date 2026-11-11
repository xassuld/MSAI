import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Mongolian Students in Italy",
  description:
    "Terms for using the Mongolian Students’ Association in Italy website and purchasing event tickets.",
  robots: { index: true, follow: true },
};

const sections = [
  {
    title: "About these terms",
    paragraphs: [
      "These terms apply when you use this website or purchase or use an event ticket offered by the Mongolian Students’ Association in Italy (MSAI). By using the website or proceeding with a ticket purchase, you agree to these terms. If you do not agree, do not use the website or purchase a ticket.",
    ],
  },
  {
    title: "Event information and tickets",
    paragraphs: [
      "Event details, ticket availability, and prices are shown on the relevant event page and may be updated. Check the event page and your ticket email for the latest information.",
      "For online purchases, payment is processed by Stripe. A ticket is issued after the payment is confirmed. At-gate tickets, when offered, are sold in person for cash as described on the event page.",
      "Keep your ticket email, ticket code, or online ticket available for admission checks. A ticket is valid for the event and admission described on that ticket. Do not share your ticket code publicly, as it may be used to verify admission.",
    ],
  },
  {
    title: "Payments and refunds",
    paragraphs: [
      "Ticket prices and available payment methods are displayed before purchase. Online payment details are handled by Stripe under its own terms and policies.",
      "As stated during checkout, ticket sales are final and non-refundable, except where a refund or other remedy is required by applicable law. These terms do not limit any rights you have that cannot legally be excluded.",
    ],
  },
  {
    title: "Acceptable use",
    paragraphs: [
      "Use the website lawfully and do not attempt to interfere with its operation, access accounts or ticket records without authorization, or use another person’s personal information or ticket code without permission.",
    ],
  },
  {
    title: "Third-party services",
    paragraphs: [
      "The website relies on third-party services for functions such as payment processing, hosting, and ticket email delivery. Those services may have their own terms and privacy policies, which apply to your use of them.",
    ],
  },
  {
    title: "Changes and contact",
    paragraphs: [
      "We may update these terms when our services or legal requirements change. The latest version will be published on this page. For questions about these terms or an event ticket, contact MSAI at msai.imokh@gmail.com.",
    ],
  },
];

export default function TermsOfServicePage() {
  return (
    <main className="min-h-screen px-4 py-10 sm:px-6">
      <article className="mx-auto w-full max-w-[760px] rounded-[26px] border border-[#15294b]/20 bg-[#fffdf8] p-6 shadow-[0_20px_65px_rgb(21_41_75/12%)] sm:p-10">
        <Link
          className="text-sm font-semibold text-[#80643a] underline underline-offset-4 hover:text-[#15294b]"
          href="/"
        >
          MSAI
        </Link>
        <p className="mt-8 text-[10px] font-bold uppercase tracking-[.2em] text-[#80643a]">
          Mongolian Students’ Association in Italy
        </p>
        <h1 className="mt-2 font-serif text-4xl text-[#15294b]">
          Terms of Service
        </h1>
        <p className="mt-3 text-sm text-[#62645f]">
          Effective November 10, 2026
        </p>
        <p className="mt-6 text-sm leading-7 text-[#62645f]">
          These terms explain the basic rules for using our website and event
          ticketing service.
        </p>

        <div className="mt-8 grid gap-7">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-serif text-xl text-[#15294b]">
                {section.title}
              </h2>
              {section.paragraphs.map((paragraph) => (
                <p
                  className="mt-2 text-sm leading-7 text-[#62645f]"
                  key={paragraph}
                >
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </div>

        <p className="mt-9 border-t border-[#c7b995]/70 pt-5 text-sm text-[#62645f]">
          Also see our{" "}
          <Link
            className="font-semibold text-[#15294b] underline underline-offset-4"
            href="/privacy"
          >
            Privacy Policy
          </Link>
          .
        </p>
      </article>
    </main>
  );
}
