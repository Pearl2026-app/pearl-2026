'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@sahyadri/ui';
import { emptyOrder, OrderForm, orderBody, toLine, type OrderFormValues } from '@/components/order-form';
import { useToast } from '@/components/toast';
import { api, errorText } from '@/lib/api';

interface EnquiryLike {
  id: string;
  reference: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  cityId?: string | null;
  city?: { id: string; name: string } | null;
  product?: { id: string } | null;
  productId?: string | null;
  source?: string | null;
}

/** One click turns an enquiry into an order; the form opens pre-filled from the enquiry. */
export function ConvertEnquiry({ enquiry: e }: { enquiry: EnquiryLike }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const productId = e.productId ?? e.product?.id ?? null;
  const { data: product, isLoading } = useQuery({ queryKey: ['/admin/products', productId], queryFn: () => api<any>(`/admin/products/${productId}`), enabled: open && !!productId });
  const convert = useMutation({
    mutationFn: (v: OrderFormValues) => api<{ id: string; number: string }>(`/admin/enquiries/${e.id}/convert`, { method: 'POST', json: orderBody(v) }),
    onSuccess: async (o) => {
      await qc.invalidateQueries({ queryKey: ['/admin/enquiries'] });
      await qc.invalidateQueries({ queryKey: ['/admin/orders'] });
      toast(`Order ${o.number} created from ${e.reference}`);
      router.push(`/orders/${o.id}`);
    },
  });
  if (!open) return <Button size="sm" onClick={() => setOpen(true)}>Convert to order</Button>;
  if (productId && isLoading) return <p className="text-sm text-muted">Loading the piece…</p>;
  const base = emptyOrder();
  const initial: OrderFormValues = {
    ...base,
    contact: { name: e.contactName ?? '', phone: e.contactPhone ?? '', email: e.contactEmail ?? '' },
    cityId: e.cityId ?? e.city?.id ?? '',
    address: { ...base.address, cityName: e.city?.name ?? '' },
    lines: product ? [toLine(product)] : [],
    channel: e.source ?? 'whatsapp',
  };
  return (
    <div className="fixed inset-0 z-40 overflow-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label={`Convert ${e.reference} to an order`}>
      <div className="mx-auto max-w-4xl rounded-md bg-bg p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Convert {e.reference} to an order</h2>
          <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button>
        </div>
        <OrderForm initial={initial} submitLabel="Create order" onSubmit={(v) => convert.mutate(v)} busy={convert.isPending} error={convert.error ? errorText(convert.error) : null} />
      </div>
    </div>
  );
}
