import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { get } from '@/lib/server-api';
import { meta } from '@/lib/seo';
import type { Site } from '@/lib/types';

export const metadata = meta({
  title: 'Delivery app privacy policy',
  description: 'What the Sahyadri Pearls Delivery app collects, why, and how long it is kept.',
  path: '/delivery-app-privacy',
});

/**
 * The privacy policy linked from the Delivery app's Play Store listing. It describes what the app actually does
 * (apps/mobile-delivery): sign-in by mobile number, proof of delivery (photo, signature or code, location at handover),
 * offline queue on the phone, notifications. The shop's general policy stays under /privacy.
 */
export default async function DeliveryAppPrivacy() {
  const site = await get<Site>('/site', { revalidate: 300 });
  const s = site?.store;
  return (
    <Container className="max-w-2xl">
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Delivery app privacy policy' }]} />
      <PageTitle eyebrow="Sahyadri Pearls Delivery" title="Delivery app privacy policy" />
      <div className="flex flex-col gap-4 leading-relaxed">
        <p className="text-sm text-muted">Last updated 10 November 2026</p>
        <p>
          The Sahyadri Pearls Delivery app is for delivery partners who deliver orders for {s?.legalName ?? 'Sahyadri Pearls'}. Only partners
          registered by our team can sign in. This page explains what the app collects, why, and how long we keep it.
        </p>

        <h2 className="mt-2 font-serif text-2xl">What the app collects</h2>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong>Your name and mobile number</strong>, as registered by our team, and a one-time code sent to that number to sign you in.
          </li>
          <li>
            <strong>Proof of delivery</strong>, when you mark an order delivered: a photo of the handover taken with the phone camera, the
            customer&rsquo;s delivery code or signature, any cash collected, and the time.
          </li>
          <li>
            <strong>Your location at the moment of handover</strong>, saved with the delivery as part of the proof. The app asks for location
            only while it is open and does not track you in the background.
          </li>
          <li>
            <strong>A notification token</strong>, so we can tell you about new deliveries assigned to you.
          </li>
        </ul>
        <p>
          While you deliver, the app shows you the customer&rsquo;s name, address, phone number and order details. Use them only to complete that
          delivery.
        </p>

        <h2 className="mt-2 font-serif text-2xl">How it is used</h2>
        <p>
          Only to assign and complete deliveries, to prove an order was handed over, to settle cash collected, and to resolve a customer&rsquo;s
          question about a delivery. We do not sell this information or use it for advertising. The app has no ads and no third-party
          analytics.
        </p>

        <h2 className="mt-2 font-serif text-2xl">Where it is stored</h2>
        <p>
          On our servers, sent over an encrypted connection. Your sign-in is kept in the phone&rsquo;s secure storage. When there is no signal, the
          delivery steps wait on the phone and are sent as soon as you are back online; they are removed from the phone once sent.
        </p>

        <h2 className="mt-2 font-serif text-2xl">How long we keep it</h2>
        <p>
          Proof of delivery is kept with the order for as long as order and tax records must be kept. Your partner account is kept while you
          deliver for us. Ask us to close it and we will remove your details, except what must stay with past orders.
        </p>

        <h2 className="mt-2 font-serif text-2xl">Your choices</h2>
        <p>
          The handover photo is required to mark an order delivered, so the app needs the camera for that step. Location is optional: if you
          refuse it, the delivery is saved without it. To see, correct or delete your details, contact us.
        </p>

        <h2 className="mt-2 font-serif text-2xl">Contact</h2>
        <p>
          {s?.legalName ?? 'Sahyadri Pearls'}
          {s?.address ? `, ${s.address}` : ''}
          <br />
          {s?.email && (
            <>
              Email: <a className="text-accent underline" href={`mailto:${s.email}`}>{s.email}</a>
              <br />
            </>
          )}
          {s?.phone && <>Phone: {s.phone}</>}
        </p>
      </div>
    </Container>
  );
}
