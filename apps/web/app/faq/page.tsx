import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { JsonLd, meta } from '@/lib/seo';
import { get } from '@/lib/server-api';

export const metadata = meta({ title: 'FAQ', description: 'Answers about our pearls, orders, delivery and returns.', path: '/faq' });

interface Faq { id: string; question: string; answer: string; group: string | null }

export default async function FaqPage() {
  const faqs = (await get<Faq[]>('/content/faq', { revalidate: 300 })) ?? [];
  const groups = [...new Set(faqs.map((f) => f.group ?? 'General'))];
  return (
    <Container className="max-w-4xl">
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'FAQ' }]} />
      <PageTitle title="Frequently asked questions" />
      {groups.map((g) => (
        <section key={g} className="mb-10">
          <h2 className="eyebrow mb-3">{g}</h2>
          <div className="divide-y divide-line border-y border-line">
            {faqs.filter((f) => (f.group ?? 'General') === g).map((f) => (
              <details key={f.id} className="group py-5">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 font-serif text-xl">
                  {f.question}
                  <span aria-hidden className="text-2xl text-muted transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="mt-3 leading-relaxed whitespace-pre-line text-muted">{f.answer}</p>
              </details>
            ))}
          </div>
        </section>
      ))}
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) }} />
    </Container>
  );
}
