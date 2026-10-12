import Link from 'next/link';
import { Breadcrumbs, ButtonLink, Container, PageTitle } from '@/components/ui';
import { GRADES, NECKLACE_LENGTHS, PEARL_TYPES, RING_SIZES } from '@/lib/guides';
import { breadcrumbJsonLd, JsonLd, meta } from '@/lib/seo';

export const metadata = meta({
  title: 'Pearl Guide: types, grades, sizes and care',
  description: 'How to choose a pearl: freshwater, Akoya, South Sea and Tahitian; what our AAA–A grades mean; lustre, surface and size; necklace lengths, ring sizes and care.',
  path: '/pearl-guide',
});

const SECTIONS = [
  ['types', 'Pearl types'],
  ['grading', 'How we grade'],
  ['lustre', 'Lustre'],
  ['surface', 'Surface'],
  ['shape', 'Shape'],
  ['size', 'Size'],
  ['necklace-lengths', 'Necklace lengths'],
  ['ring-size', 'Ring size'],
  ['care', 'Caring for pearls'],
  ['certificate', 'Your certificate'],
] as const;

function H2({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="scroll-mt-28 font-serif text-3xl lg:text-4xl">
      {children}
    </h2>
  );
}

const table = 'w-full border-collapse text-left text-sm [&_td]:border-t [&_td]:border-line [&_td]:py-3 [&_td]:pr-4 [&_th]:pb-2 [&_th]:pr-4 [&_th]:font-normal [&_th]:text-muted';

export default function PearlGuidePage() {
  return (
    <Container>
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Pearl Guide' }]} />
      <PageTitle eyebrow="Pearl Guide" title="How to choose a pearl" intro="Everything we look at when we grade a pearl, in plain words, so you can choose with confidence." />
      <div className="grid gap-12 lg:grid-cols-[220px_1fr] lg:gap-16">
        <nav aria-label="On this page" className="lg:sticky lg:top-28 lg:self-start">
          <ul className="no-scrollbar flex gap-2 overflow-x-auto text-sm lg:flex-col lg:gap-1">
            {SECTIONS.map(([id, label]) => (
              <li key={id} className="shrink-0">
                <a href={`#${id}`} className="block border border-line px-3 py-2 hover:text-accent lg:border-0 lg:border-l lg:py-1.5">{label}</a>
              </li>
            ))}
          </ul>
        </nav>
        <article className="flex max-w-3xl flex-col gap-14 leading-relaxed">
          <section className="flex flex-col gap-4">
            <H2 id="types">Pearl types</H2>
            <p>A pearl forms when an oyster or mussel coats a tiny nucleus with layer upon layer of nacre. Where it grows decides its size, colour and look. Each of our product pages names the type and the farm.</p>
            <div className="overflow-x-auto">
              <table className={table}>
                <thead><tr><th>Type</th><th>Where it grows</th><th>Usual size</th><th>The look</th></tr></thead>
                <tbody>{PEARL_TYPES.map((t) => <tr key={t.name}><td className="font-medium">{t.name}</td><td>{t.from}</td><td className="whitespace-nowrap">{t.size}</td><td>{t.look}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-4">
            <H2 id="grading">How we grade</H2>
            <p>There is no single worldwide grading standard for pearls: different sellers use AAA–A or A–D scales in different ways. So here is exactly what our letters mean. Our graders look at every pearl by hand, in daylight, and the grade on the product page is the grade of that piece.</p>
            <div className="overflow-x-auto">
              <table className={table}>
                <thead><tr><th>Grade</th><th>Lustre</th><th>Surface</th><th>Shape and matching</th></tr></thead>
                <tbody>{GRADES.map((g) => <tr key={g.grade}><td className="font-serif text-lg">{g.grade}</td><td>{g.lustre}</td><td>{g.surface}</td><td>{g.shape}</td></tr>)}</tbody>
              </table>
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <H2 id="lustre">Lustre</H2>
            <p>Lustre is the glow and sharpness of light reflected from the pearl, and the most important thing to look at. A fine pearl shows crisp reflections, almost like a mirror; a soft, chalky glow usually means thinner nacre. Photos can flatter or flatten lustre, so we are happy to show any piece on a live video call before you decide.</p>
          </section>

          <section className="flex flex-col gap-3">
            <H2 id="surface">Surface</H2>
            <p>Pearls grow in living animals, so tiny marks are natural and prove a pearl is real. We describe the surface as Clean, Very lightly blemished, Lightly blemished or Moderately blemished. In a strand, marks are usually placed where they will not show.</p>
          </section>

          <section className="flex flex-col gap-3">
            <H2 id="shape">Shape</H2>
            <p>Perfectly round pearls are the rarest. Near-round pearls look round when worn. Drop, button, oval and baroque (free-form) pearls each have their own character, and baroque pearls are prized for being one of a kind.</p>
          </section>

          <section className="flex flex-col gap-3">
            <H2 id="size">Size</H2>
            <p>Pearls are measured across their width in millimetres. As a guide: 6–7 mm is delicate and everyday, 7–8 mm is the classic choice, 8–9 mm makes a statement, and 10 mm and above is bold. Larger pearls of the same quality are much rarer, so the price rises quickly with size.</p>
          </section>

          <section className="flex flex-col gap-4">
            <H2 id="necklace-lengths">Necklace lengths</H2>
            <div className="overflow-x-auto">
              <table className={table}>
                <thead><tr><th>Style</th><th>Length</th><th>How it sits</th></tr></thead>
                <tbody>{NECKLACE_LENGTHS.map((n) => <tr key={n.name}><td className="font-medium">{n.name}</td><td className="whitespace-nowrap">{n.cm} cm ({n.inches}″)</td><td>{n.sits}</td></tr>)}</tbody>
              </table>
            </div>
            <p className="text-sm text-muted">Not sure? Measure a necklace you already love, flat on a table, from clasp to clasp.</p>
          </section>

          <section className="flex flex-col gap-4">
            <H2 id="ring-size">Ring size</H2>
            <p>Wrap a strip of paper around the base of your finger, mark where it meets, and measure the length in millimetres. That is the circumference. Or measure the inside of a ring that fits you well: that is the diameter.</p>
            <div className="overflow-x-auto">
              <table className={table}>
                <thead><tr><th>Indian size</th><th>Circumference</th><th>Diameter</th></tr></thead>
                <tbody>{RING_SIZES.map((r) => <tr key={r.size}><td className="font-medium">{r.size}</td><td>{r.circumference} mm</td><td>{r.diameter} mm</td></tr>)}</tbody>
              </table>
            </div>
            <p className="text-sm text-muted">Fingers are a little larger in the evening and in warm weather. Between two sizes, choose the larger. Our team will confirm the size before a ring is made or altered.</p>
          </section>

          <section className="flex flex-col gap-3">
            <H2 id="care">Caring for pearls</H2>
            <ul className="list-disc space-y-2 pl-5">
              <li><strong>Last on, first off.</strong> Put pearls on after perfume, hairspray and make-up, and take them off before bathing or swimming.</li>
              <li><strong>Wipe after wearing</strong> with a soft, slightly damp cloth, then let them dry flat.</li>
              <li><strong>Store them flat and separately</strong> in the pouch they came in, away from harder jewellery that can scratch them.</li>
              <li><strong>Wear them often.</strong> Pearls like a little humidity from the skin; airtight boxes for years can dry them out.</li>
              <li><strong>Re-string every year or two</strong> if you wear a strand often. Silk stretches; knots between pearls stop them scattering if it breaks.</li>
            </ul>
          </section>

          <section className="flex flex-col gap-3">
            <H2 id="certificate">Your certificate</H2>
            <p>Every piece comes with a Sahyadri Pearls certificate of authenticity naming the pearl type, size, grade and the farm it came from. Each certificate has a QR code: scan it, or enter its number on our <Link href="/verify" className="text-accent underline underline-offset-2">verify page</Link>, to see the record we keep. Our certificate records our own grading; it is not an independent laboratory report. For a high-value piece, ask us about an independent report.</p>
          </section>

          <section className="flex flex-col items-start gap-4 bg-surface-muted p-6 lg:p-10">
            <p className="font-serif text-2xl">Still deciding?</p>
            <p className="text-muted">See pieces on a live video call with our pearl adviser, or visit us in person.</p>
            <div className="flex flex-wrap gap-3">
              <ButtonLink href="/book-consultation">Book a consultation</ButtonLink>
              <ButtonLink href="/jewellery" variant="outline">Browse jewellery</ButtonLink>
            </div>
          </section>
        </article>
      </div>
      <JsonLd data={breadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: 'Pearl Guide', path: '/pearl-guide' }])} />
    </Container>
  );
}
