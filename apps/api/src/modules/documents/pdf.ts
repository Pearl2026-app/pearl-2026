import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { formatINR } from '@sahyadri/shared';

// PDF builders for invoices, purchase orders and certificates. Built-in fonts only; ₹ is written as "Rs."
// because the standard PDF fonts have no rupee glyph.
const INK = '#14212B';
const MUTED = '#586570';
const ACCENT = '#14212B';
const rs = (paise: number) => formatINR(paise).replace('₹', 'Rs. ');

function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    doc.end();
  });
}

function header(doc: PDFKit.PDFDocument, title: string, store: { legalName: string; address: string; gstin: string | null; phone: string; email: string }) {
  doc.fillColor(ACCENT).font('Times-Bold').fontSize(22).text('Sahyadri Pearls', 50, 50);
  doc.fillColor(MUTED).font('Helvetica').fontSize(8.5).text(store.address, 50, 78, { width: 300 });
  doc.text(`${store.phone}  ·  ${store.email}`, { width: 300 });
  if (store.gstin) doc.text(`GSTIN: ${store.gstin}`);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text(title, 350, 52, { width: 195, align: 'right' });
  doc.moveTo(50, 130).lineTo(545, 130).strokeColor('#E4DDD2').stroke();
}

/** Written inside the bottom margin; without lifting the margin pdfkit would start a blank page for it. */
function footer(doc: PDFKit.PDFDocument) {
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(7.5)
    .text(`Developed by Sahyadri Pearls · © ${new Date().getFullYear()} Sahyadri Pearls. All Rights Reserved.`, 50, 790, {
      width: 495,
      align: 'center',
      lineBreak: false,
    });
  doc.page.margins.bottom = bottom;
}

export interface InvoicePdfInput {
  store: { legalName: string; address: string; gstin: string | null; phone: string; email: string; state: string; stateCode: string };
  invoiceNumber: string;
  issuedAt: Date;
  orderNumber: string;
  placeOfSupply: string;
  isInterState: boolean;
  billTo: { name: string; phone: string; address: string; gstin?: string | null; businessName?: string | null };
  lines: Array<{ name: string; sku: string; farm?: string | null; carat?: string | null; hsn: string | null; qty: number; unitPaise: number; discountPaise: number; taxablePaise: number; gstRateBp: number; gstPaise: number; totalPaise: number }>;
  delivery: { taxablePaise: number; gstPaise: number; totalPaise: number; rateBp: number };
  totals: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number };
  /** Before tax split: price of the pieces, order discount (coupon), delivery */
  summary?: { subtotalPaise: number; discountPaise: number; couponCode?: string | null; pointsPaise?: number; deliveryPaise: number };
  paymentMethod: string;
  paymentStatus?: string;
  paymentReference?: string | null;
  isSample: boolean;
}

export async function invoicePdf(i: InvoicePdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Invoice ${i.invoiceNumber}`, Author: 'Sahyadri Pearls' } });
  header(doc, 'TAX INVOICE', i.store);
  if (i.isSample) {
    doc.save().rotate(-30, { origin: [300, 420] }).fillColor('#B3261E').opacity(0.12).font('Helvetica-Bold').fontSize(80).text('SAMPLE', 120, 380).restore();
    doc.opacity(1);
  }
  doc.fillColor(INK).font('Helvetica').fontSize(9);
  doc.text(`Invoice no: ${i.invoiceNumber}`, 350, 75, { width: 195, align: 'right' });
  doc.text(`Date: ${i.issuedAt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { width: 195, align: 'right' });
  doc.text(`Order: ${i.orderNumber}`, { width: 195, align: 'right' });

  doc.font('Helvetica-Bold').text('Bill to / Ship to', 50, 145);
  doc.font('Helvetica');
  if (i.billTo.businessName) doc.font('Helvetica-Bold').text(i.billTo.businessName).font('Helvetica');
  doc.text(i.billTo.name).text(i.billTo.phone).text(i.billTo.address, { width: 260 });
  if (i.billTo.gstin) doc.text(`GSTIN: ${i.billTo.gstin}`);
  doc.font('Helvetica-Bold').text('Place of supply', 350, 145, { width: 195, align: 'right' });
  doc.font('Helvetica').text(i.placeOfSupply, { width: 195, align: 'right' });
  doc.text(i.isInterState ? 'Inter-state supply (IGST)' : 'Intra-state supply (CGST + SGST)', { width: 195, align: 'right' });

  let y = 235;
  const cols = [50, 220, 270, 300, 365, 425, 480];
  doc.rect(50, y - 4, 495, 18).fill('#F3EEE6').fillColor(INK).font('Helvetica-Bold').fontSize(8);
  ['Item', 'HSN', 'Qty', 'Rate', 'Taxable', 'GST', 'Amount'].forEach((h, k) => doc.text(h, cols[k]!, y, { width: k === 0 ? 165 : 55, align: k === 0 ? 'left' : 'right' }));
  y += 20;
  doc.font('Helvetica').fontSize(8);
  const row = (cells: string[]) => {
    cells.forEach((c, k) => doc.text(c, cols[k]!, y, { width: k === 0 ? 165 : 55, align: k === 0 ? 'left' : 'right' }));
    y += Math.max(14, doc.heightOfString(cells[0]!, { width: 165 }) + 4);
  };
  for (const l of i.lines) {
    const origin = [l.farm ? `Farm: ${l.farm}` : null, l.carat ? `${Number(l.carat)} ct` : null].filter(Boolean).join(' · ');
    row([`${l.name}\n${l.sku}${origin ? `\n${origin}` : ''}${l.discountPaise ? `  (discount ${rs(l.discountPaise)})` : ''}`, l.hsn ?? '', String(l.qty), rs(l.unitPaise), rs(l.taxablePaise), `${l.gstRateBp / 100}%\n${rs(l.gstPaise)}`, rs(l.totalPaise)]);
  }
  if (i.delivery.totalPaise > 0) row(['Delivery', '9965', '1', rs(i.delivery.totalPaise), rs(i.delivery.taxablePaise), `${i.delivery.rateBp / 100}%\n${rs(i.delivery.gstPaise)}`, rs(i.delivery.totalPaise)]);
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#E4DDD2').stroke();
  y += 10;
  const sum = (label: string, v: number, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9).text(label, 330, y, { width: 120, align: 'right' }).text(rs(v), 455, y, { width: 90, align: 'right' });
    y += bold ? 18 : 14;
  };
  if (i.summary) {
    sum('Subtotal', i.summary.subtotalPaise);
    if (i.summary.discountPaise > 0)
      sum(`Discount${i.summary.couponCode ? ` (${i.summary.couponCode})` : ''}`, -i.summary.discountPaise);
    if (i.summary.pointsPaise) sum('Credit points', -i.summary.pointsPaise);
    sum('Shipping', i.summary.deliveryPaise);
    doc.moveTo(330, y - 2).lineTo(545, y - 2).strokeColor('#E4DDD2').stroke();
    y += 4;
  }
  sum('Taxable value', i.totals.taxablePaise);
  if (i.isInterState) sum('IGST', i.totals.igstPaise);
  else {
    sum('CGST', i.totals.cgstPaise);
    sum('SGST', i.totals.sgstPaise);
  }
  sum('Total (incl. GST)', i.totals.totalPaise, true);
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(
      `Payment: ${i.paymentMethod}${i.paymentStatus ? ` (${i.paymentStatus})` : ''}${i.paymentReference ? ` · Ref ${i.paymentReference}` : ''}`,
      50,
      y + 10,
    );
  doc.text('This is a computer-generated invoice.', 50, y + 24);
  footer(doc);
  return collect(doc);
}

export interface PoPdfInput {
  store: InvoicePdfInput['store'];
  number: string;
  createdAt: Date;
  dueDate: Date;
  manufacturer: { name: string; contactName?: string | null; phone?: string | null; email?: string | null; city?: string | null };
  orderNumber?: string | null;
  specification: string;
  quantity: number;
  agreedCostPaise: number;
  notes?: string | null;
}

export async function purchaseOrderPdf(p: PoPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Purchase Order ${p.number}`, Author: 'Sahyadri Pearls' } });
  header(doc, 'PURCHASE ORDER', p.store);
  doc.fillColor(INK).font('Helvetica').fontSize(9);
  doc.text(`PO no: ${p.number}`, 350, 75, { width: 195, align: 'right' });
  doc.text(`Date: ${p.createdAt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`, { width: 195, align: 'right' });
  if (p.orderNumber) doc.text(`For order: ${p.orderNumber}`, { width: 195, align: 'right' });
  doc.font('Helvetica-Bold').text('Manufacturer', 50, 145);
  doc.font('Helvetica').text(p.manufacturer.name);
  if (p.manufacturer.contactName) doc.text(p.manufacturer.contactName);
  if (p.manufacturer.phone) doc.text(p.manufacturer.phone);
  if (p.manufacturer.email) doc.text(p.manufacturer.email);
  if (p.manufacturer.city) doc.text(p.manufacturer.city);
  doc.font('Helvetica-Bold').fontSize(10).text('Specification', 50, 235);
  doc.font('Helvetica').fontSize(9).text(p.specification, 50, 252, { width: 495 });
  let y = doc.y + 20;
  const kv = (k: string, v: string) => {
    doc.font('Helvetica-Bold').text(k, 50, y, { width: 150 }).font('Helvetica').text(v, 200, y, { width: 345 });
    y += 16;
  };
  kv('Quantity', String(p.quantity));
  kv('Agreed cost', rs(p.agreedCostPaise));
  kv('Due date', p.dueDate.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }));
  if (p.notes) kv('Notes', p.notes);
  y += 40;
  doc.text('Authorised signatory', 50, y).text('Accepted by manufacturer', 350, y);
  doc.moveTo(50, y - 6).lineTo(220, y - 6).moveTo(350, y - 6).lineTo(545, y - 6).strokeColor('#999').stroke();
  footer(doc);
  return collect(doc);
}

export interface CertificatePdfInput {
  code: string;
  verifyUrl: string;
  productName: string;
  sku: string;
  details: Record<string, string | number | null | undefined>;
  farmName: string | null;
  issuedAt: Date;
}

export async function certificatePdf(c: CertificatePdfInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A5', layout: 'landscape', margin: 36, info: { Title: `Certificate ${c.code}`, Author: 'Sahyadri Pearls' } });
  const w = doc.page.width;
  const h = doc.page.height;
  doc.rect(18, 18, w - 36, h - 36).lineWidth(1.5).strokeColor('#9A7546').stroke();
  doc.fillColor(ACCENT).font('Times-Bold').fontSize(22).text('Sahyadri Pearls', 0, 44, { align: 'center', width: w });
  doc.fillColor(INK).font('Times-Roman').fontSize(13).text('Certificate of Authenticity', 0, 72, { align: 'center', width: w });
  doc.font('Helvetica-Bold').fontSize(12).text(c.productName, 50, 115, { width: w - 230 });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`SKU ${c.sku}`, { width: w - 230 });
  let y = doc.y + 10;
  doc.fillColor(INK).fontSize(9);
  const entries = Object.entries({ ...c.details, Farm: c.farmName });
  for (const [k, v] of entries) {
    if (v == null || v === '') continue;
    doc.font('Helvetica-Bold').text(k.charAt(0).toUpperCase() + k.slice(1).replace(/([A-Z])/g, ' $1'), 50, y, { width: 110 });
    doc.font('Helvetica').text(String(v), 165, y, { width: w - 345 });
    y += 14;
  }
  const qr = await QRCode.toBuffer(c.verifyUrl, { margin: 1, width: 300, color: { dark: INK, light: '#FFFFFF' } });
  doc.image(qr, w - 170, 110, { width: 120 });
  doc.fontSize(7.5).fillColor(MUTED).text('Scan to verify this piece and its farm of origin', w - 180, 235, { width: 140, align: 'center' });
  doc.fontSize(8).text(`Certificate ${c.code} · issued ${c.issuedAt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 50, h - 60);
  return collect(doc);
}

export const qrPng = (url: string) => QRCode.toBuffer(url, { margin: 1, width: 600 });

export interface PackingSlipInput {
  orderNumber: string;
  placedAt: Date;
  shipTo: { name: string; phone: string; address: string };
  lines: Array<{ name: string; sku: string; qty: number; totalPaise: number }>;
  totalPaise: number;
  codDuePaise: number;
  /** Gift orders print no prices; the message goes on a separate card page. */
  gift: { message: string | null } | null;
}

/** Goes in the parcel. Gift slips carry no prices (and no COD amount: gifts that are COD show only "collect payment"). */
export async function packingSlipPdf(s: PackingSlipInput): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 50, info: { Title: `Packing slip ${s.orderNumber}`, Author: 'Sahyadri Pearls' } });
  doc.fillColor(ACCENT).font('Times-Bold').fontSize(22).text('Sahyadri Pearls', 50, 50);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(14).text(s.gift ? 'GIFT PACKING SLIP' : 'PACKING SLIP', 350, 52, { width: 195, align: 'right' });
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text(`Order ${s.orderNumber} · ${s.placedAt.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}`, 350, 72, { width: 195, align: 'right' });
  doc.moveTo(50, 110).lineTo(545, 110).strokeColor('#E4DDD2').stroke();
  doc.fillColor(MUTED).fontSize(8.5).text('SHIP TO', 50, 125);
  doc.fillColor(INK).font('Helvetica-Bold').fontSize(11).text(s.shipTo.name, 50, 138);
  doc.font('Helvetica').fontSize(10).text(s.shipTo.address, { width: 300 }).text(s.shipTo.phone);
  let y = Math.max(doc.y + 20, 210);
  doc.fillColor(MUTED).fontSize(8.5).text('ITEM', 50, y).text('SKU', 330, y).text('QTY', 430, y);
  if (!s.gift) doc.text('AMOUNT', 470, y, { width: 75, align: 'right' });
  y += 16;
  for (const l of s.lines) {
    doc.moveTo(50, y - 4).lineTo(545, y - 4).strokeColor('#EFE9DF').stroke();
    doc.fillColor(INK).fontSize(10).text(l.name, 50, y, { width: 270 }).text(l.sku, 330, y, { width: 95 }).text(String(l.qty), 430, y);
    if (!s.gift) doc.text(rs(l.totalPaise), 470, y, { width: 75, align: 'right' });
    y = Math.max(doc.y, y + 14) + 8;
  }
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#E4DDD2').stroke();
  y += 12;
  if (!s.gift) {
    doc.font('Helvetica-Bold').text('Total', 330, y).text(rs(s.totalPaise), 470, y, { width: 75, align: 'right' });
    y += 18;
  }
  if (s.codDuePaise > 0) {
    doc.font('Helvetica-Bold').fillColor('#8C5A00').text(s.gift ? 'Cash on delivery: the rider collects payment.' : `Cash on delivery: collect ${rs(s.codDuePaise)}`, 50, y);
    y += 18;
  }
  doc.font('Helvetica').fillColor(MUTED).fontSize(9).text('Packed with care. Your certificate of authenticity is in the box; scan its QR code to verify it.', 50, y + 10, { width: 495 });
  footer(doc);
  if (s.gift) {
    doc.addPage({ size: [420, 298], margin: 40 });
    doc.fillColor(ACCENT).font('Times-Bold').fontSize(18).text('Sahyadri Pearls', 40, 40, { width: 340, align: 'center' });
    doc.fillColor(INK).font('Times-Italic').fontSize(15).text(s.gift.message || 'A gift for you.', 50, 110, { width: 320, align: 'center' });
  }
  return collect(doc);
}
