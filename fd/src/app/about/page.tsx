import Link from "next/link";

const focusAreas = [
  {
    title: "Academic",
    description:
      "Information exchange, academic workshops, peer mentorship, and research and discussion activities.",
  },
  {
    title: "Career",
    description:
      "Career panels, internship information, CV and interview workshops, and alumni and professional networks.",
  },
  {
    title: "Community",
    description:
      "Practical information for newly arrived students, peer support, and inter-city connections.",
  },
  {
    title: "Culture",
    description:
      "Naadam, Tsagaan Sar, Mongolian cuisine, art, and presentations on history and culture.",
  },
  {
    title: "Engagement",
    description:
      "Diplomatic, academic, and business meetings; Mongolian–Italian youth cooperation.",
  },
];

const features = [
  "National: not a club limited to a single university or city, but an organization operating across Italy.",
  "Student-centered: its activities are grounded in the real needs of students.",
  "Sustainable: it maintains a structure that allows successive generations of students to carry its work forward.",
  "Open to cooperation: it collaborates with the Embassy, universities, alumni, and professional and cultural organizations.",
];

const leadership = [
  { role: "President", name: "N. Margad" },
  { role: "Vice President", name: "Y. Nandin-Erdene" },
  { role: "Secretary-General", name: "A. Khishigt" },
  { role: "Events & Culture Director", name: "A.L. Altangerel" },
  { role: "Events & Culture Director", name: "A. Mereke" },
  { role: "Communications Director", name: "M. Shine-od" },
  { role: "Academic & Career Director", name: "E. Egsigl" },
];

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-[#f6f1e7] px-5 py-8 text-[#15294b] sm:px-8 sm:py-12">
      <div className="mx-auto max-w-5xl">
        <div className="mb-8 flex items-center justify-between gap-3">
          <Link
            className="inline-flex items-center gap-2 rounded-full border border-[#15294b]/20 bg-white/70 px-4 py-2 text-sm font-medium text-[#15294b] shadow-sm transition hover:bg-white"
            href="/"
          >
            ← Back home
          </Link>
        </div>

        <section className="overflow-hidden rounded-[32px] border border-[#15294b]/15 bg-[#fbfaf6] shadow-[0_18px_48px_rgb(21_41_75/08%)]">
          <div className="border-b border-[#15294b]/10 bg-[#f0e9dc] px-6 py-7 sm:px-10">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[.18em] text-[#72653d]">
              Mongolian Students’ Association in Italy
            </p>
            <h1 className="max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-[#15294b] sm:text-5xl">
              MSAI
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[#47515a] sm:text-lg">
              A student network that brings together Mongolian students living and studying in Italy,
              supports their academic and professional growth, and strengthens Mongolian–Italian
              relations through youth engagement.
            </p>
          </div>

          <div className="grid gap-8 px-6 py-8 sm:px-10 sm:py-10">
            <section>
              <h2 className="mb-4 text-2xl font-semibold tracking-[-0.03em] text-[#15294b]">
                Basis
              </h2>
              <p className="text-base leading-8 text-[#3d4a54]">
                At present, there is no unified student network at the national level that connects
                Mongolian students studying in different cities and universities across Italy and
                supports their academic and professional development. This initiative aims to foster
                mutual support, networking, and mentorship among Mongolian students while also
                increasing youth participation in Mongolian–Italian relations.
              </p>
            </section>

            <section className="grid gap-5 lg:grid-cols-2">
              <article className="rounded-[24px] border border-[#d9d5ca] bg-[#f7f3ea] p-6">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.17em] text-[#72653d]">
                  Vision
                </p>
                <p className="text-base leading-8 text-[#3d4a54]">
                  To establish a united and mutually supportive community of Mongolian students in
                  Italy that is active at the international level and contributes to Mongolian–Italian
                  relations.
                </p>
              </article>

              <article className="rounded-[24px] border border-[#d9d5ca] bg-[#f7f3ea] p-6">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[.17em] text-[#72653d]">
                  Mission
                </p>
                <p className="text-base leading-8 text-[#3d4a54]">
                  To support the academic, professional, and social development of Mongolian students
                  while promoting Mongolia&apos;s history, culture, and values and increasing youth
                  participation in Mongolian–Italian relations.
                </p>
              </article>
            </section>

            <section>
              <h2 className="mb-5 text-2xl font-semibold tracking-[-0.03em] text-[#15294b]">
                Five core focus areas
              </h2>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {focusAreas.map((area) => (
                  <article
                    key={area.title}
                    className="rounded-[22px] border border-[#d9d5ca] bg-[#faf7f1] p-4 shadow-sm"
                  >
                    <div className="mb-3 inline-flex rounded-full bg-[#e8d9b1] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.14em] text-[#5d4730]">
                      {area.title}
                    </div>
                    <p className="text-sm leading-7 text-[#3d4a54]">{area.description}</p>
                  </article>
                ))}
              </div>
            </section>

            <section>
              <h2 className="mb-4 text-2xl font-semibold tracking-[-0.03em] text-[#15294b]">
                Distinguishing features of the association
              </h2>
              <ul className="grid gap-3 text-base leading-8 text-[#3d4a54]">
                {features.map((item) => (
                  <li key={item} className="flex gap-3">
                    <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-[#c4a66e]" aria-hidden="true" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section>
              <h2 className="mb-5 text-2xl font-semibold tracking-[-0.03em] text-[#15294b]">
                Operational members
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {leadership.map((member) => (
                  <div
                    key={`${member.role}-${member.name}`}
                    className="rounded-[20px] border border-[#d9d5ca] bg-[#f3efe8] p-4"
                  >
                    <p className="text-[10px] font-semibold uppercase tracking-[.16em] text-[#72653d]">
                      {member.role}
                    </p>
                    <p className="mt-2 text-lg font-medium text-[#15294b]">{member.name}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </section>
      </div>
    </main>
  );
}
