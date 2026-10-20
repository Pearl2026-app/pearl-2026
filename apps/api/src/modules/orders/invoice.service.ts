import { Injectable } from '@nestjs/common';
import { splitInclusive } from '@sahyadri/shared';
import { notFound } from '../../common/errors';
import { SettingsService } from '../../common/settings.service';
import { PrismaService } from '../../prisma/prisma.service';
import { invoicePdf } from '../documents/pdf';
import { formatAddress } from './orders.service';

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  async pdf(orderId: string): Promise<{ buffer: Buffer; filename: string }> {
    const o = await this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true, invoice: true, payments: { where: { status: 'CAPTURED' }, orderBy: { createdAt: 'desc' } } } });
    if (!o?.invoice) throw notFound('Invoice');
    const store = await this.settings.get('store');
    const addr = o.addressSnapshot as Record<string, string>;
    const maxRate = o.items.reduce((m, i) => Math.max(m, i.gstRateBp), 0);
    const delivery = splitInclusive(o.deliveryPaise, maxRate);
    const buffer = await invoicePdf({
      store,
      invoiceNumber: o.invoice.number,
      issuedAt: o.invoice.issuedAt,
      orderNumber: o.number,
      placeOfSupply: o.invoice.placeOfSupply,
      isInterState: o.invoice.isInterState,
      billTo: { name: addr.name ?? o.contactName, phone: addr.phone ?? o.contactPhone, address: formatAddress(addr), gstin: o.invoice.buyerGstin ?? o.buyerGstin, businessName: o.buyerBusinessName },
      lines: o.items.map((i) => ({
        name: i.name,
        sku: i.sku,
        farm: i.farmName,
        carat: i.caratWeight?.toString() ?? null,
        hsn: i.hsnCode,
        qty: i.quantity,
        unitPaise: i.unitPricePaise,
        discountPaise: i.discountPaise,
        taxablePaise: i.lineTotalPaise - i.gstPaise,
        gstRateBp: i.gstRateBp,
        gstPaise: i.gstPaise,
        totalPaise: i.lineTotalPaise,
      })),
      delivery: { taxablePaise: delivery.taxablePaise, gstPaise: delivery.gstPaise, totalPaise: o.deliveryPaise, rateBp: maxRate },
      totals: { taxablePaise: o.taxablePaise, cgstPaise: o.invoice.cgstPaise, sgstPaise: o.invoice.sgstPaise, igstPaise: o.invoice.igstPaise, totalPaise: o.totalPaise },
      summary: { subtotalPaise: o.subtotalPaise, discountPaise: o.discountPaise, couponCode: o.couponCode, deliveryPaise: o.deliveryPaise },
      paymentStatus: o.paymentStatus === 'PAID' ? 'paid' : o.paymentStatus === 'COD_PENDING' ? 'to be collected' : o.paymentStatus.replace(/_/g, ' ').toLowerCase(),
      paymentReference: ((p) => (p?.raw as { reference?: string } | null)?.reference ?? p?.providerPaymentId ?? null)(o.payments[0]),
      paymentMethod: o.paymentMethod === 'COD' ? 'Cash on delivery' : o.paymentMethod === 'ONLINE' ? 'Paid online' : o.paymentMethod.replace('_', ' ').toLowerCase(),
      // Until a GSTIN is set, invoices are clearly marked as samples (OPEN-QUESTIONS Q5).
      isSample: !store.gstin,
    });
    return { buffer, filename: `${o.invoice.number.replace(/\//g, '-')}.pdf` };
  }
}
