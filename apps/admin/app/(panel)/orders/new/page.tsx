'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { emptyOrder, OrderForm, orderBody, type OrderFormValues } from '@/components/order-form';
import { PageHeader } from '@/components/shell';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';

export default function NewOrderPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const create = useMutation({
    mutationFn: (v: OrderFormValues) => api<{ id: string; number: string }>('/admin/orders', { method: 'POST', json: orderBody(v) }),
    onSuccess: async (o) => {
      await qc.invalidateQueries({ queryKey: ['/admin/orders'] });
      toast(`Order ${o.number} created`);
      router.replace(`/orders/${o.id}`);
    },
  });
  return (
    <div>
      <PageHeader title="New manual order" description={<Link href="/orders" className="text-accent hover:underline">← Orders</Link>} />
      <p className="mb-4 max-w-3xl text-sm text-muted">For orders taken by phone, WhatsApp or in the shop. Unique pieces are reserved at once, so the same piece cannot also be sold online.</p>
      <OrderForm initial={emptyOrder()} submitLabel="Create order" onSubmit={(v) => create.mutate(v)} busy={create.isPending} error={create.error ? errorText(create.error) : null} />
    </div>
  );
}
