import Link from 'next/link';
import { Breadcrumbs, Container, PageTitle } from '@/components/ui';
import { meta } from '@/lib/seo';

export const metadata = meta({ title: 'Delete your account', description: 'How to delete your Sahyadri Pearls account and what happens to your data.', path: '/delete-account' });

/** Public page for the app stores' "account deletion" link. */
export default async function DeleteAccountInfo({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const { done } = await searchParams;
  return (
    <Container className="max-w-2xl">
      <Breadcrumbs items={[{ name: 'Home', href: '/' }, { name: 'Delete your account' }]} />
      <PageTitle eyebrow="Your data" title={done ? 'Your account has been deleted' : 'Delete your account'} />
      {done ? (
        <p className="leading-relaxed">Thank you for shopping with us. Your personal details have been erased and you have been signed out everywhere.</p>
      ) : (
        <div className="flex flex-col gap-4 leading-relaxed">
          <p>You can delete your Sahyadri Pearls account yourself at any time:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong>In the app:</strong> Account → Delete my account.</li>
            <li><strong>On the website:</strong> <Link href="/login?next=/account" className="text-accent underline">sign in</Link>, open My Account, then “Delete my account”.</li>
            <li>Or message us on WhatsApp or email us from the number or address on your account, and we will do it for you.</li>
          </ul>
          <h2 className="mt-4 font-serif text-2xl">What is deleted</h2>
          <p>Your name, mobile number, email address, saved addresses, wishlist, app notification tokens and newsletter subscription. You are signed out on every device.</p>
          <h2 className="mt-4 font-serif text-2xl">What is kept, and why</h2>
          <p>Records of past orders and their GST invoices (including the billing name and address printed on them) are kept for the period tax law requires. They are not used for marketing.</p>
          <p>If an order is still on its way, please wait until it is delivered or cancelled before deleting your account.</p>
        </div>
      )}
    </Container>
  );
}
