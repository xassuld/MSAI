import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Mongolian Students in Italy",
  description:
    "How the Mongolian Students’ Association in Italy handles personal information and uses Google Gmail to send event tickets.",
  robots: { index: true, follow: true },
};

const sections = [
  {
    title: "Who we are",
    paragraphs: [
      "The Mongolian Students’ Association in Italy (MSAI) operates this website and organizes the events described here. For questions about this policy or your personal information, email msai.imokh@gmail.com.",
    ],
  },
  {
    title: "Information we collect",
    paragraphs: [
      "When you buy or receive an event ticket, we collect the name and email address you provide and create a ticket record. The record includes ticket details such as its code, number, type, issue date, payment status, and check-in status.",
      "For paid tickets, payment is handled by Stripe. We receive payment and transaction details needed to confirm and administer the ticket; we do not receive or store your full payment card number.",
      "If you contact us, we receive the information you choose to include in your message.",
    ],
  },
  {
    title: "How we use information",
    paragraphs: [
      "We use ticket information to process ticket requests and payments, send admission tickets and event information, verify tickets at entry, provide customer support, and meet applicable accounting and legal requirements.",
      "We use Google’s Gmail API only to send ticket emails from the association’s account. The permission is limited to sending email: we do not use it to read your inbox or access your other Gmail messages.",
    ],
  },
  {
    title: "Service providers",
    paragraphs: [
      "We use service providers to operate the website, store ticket records, process payments, and send email. These providers process information as needed to provide their services to MSAI and may handle it in other countries. Their own privacy terms also apply to information they process.",
    ],
  },
  {
    title: "Retention and security",
    paragraphs: [
      "We keep ticket records for event administration and for as long as needed to meet applicable legal, accounting, and security requirements. We apply reasonable measures to protect personal information, but no online service can be guaranteed completely secure.",
    ],
  },
  {
    title: "Your choices and rights",
    paragraphs: [
      "Depending on where you live, you may have rights to request access to, correction of, or deletion of your personal information, or to object to or restrict some processing. Contact us at msai.imokh@gmail.com to make a request or ask a question. We may need to retain some information where required by law or for legitimate event and record-keeping needs.",
      "If you are in the European Economic Area, you may also lodge a complaint with your local data protection authority.",
    ],
  },
  {
    title: "Changes to this policy",
    paragraphs: [
      "We may update this policy when our practices or legal requirements change. The latest version will be published on this page.",
    ],
  },
];

export default function PrivacyPolicyPage() {
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
          Privacy Policy
        </h1>
        <p className="mt-3 text-sm text-[#62645f]">
          Effective November 10, 2026
        </p>
        <p className="mt-6 text-sm leading-7 text-[#62645f]">
          This policy explains what personal information MSAI handles when you
          use this website or receive one of our event tickets.
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
          Contact us:{" "}
          <a
            className="font-semibold text-[#15294b] underline underline-offset-4"
            href="mailto:msai.imokh@gmail.com"
          >
            msai.imokh@gmail.com
          </a>
        </p>
      </article>
    </main>
  );
}
