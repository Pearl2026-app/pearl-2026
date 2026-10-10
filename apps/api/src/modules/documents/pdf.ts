import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { formatINR } from '@sahyadri/shared';

// PDF builders for invoices, purchase orders and certificates. Built-in fonts only; ₹ is written as "Rs."
// because the standard PDF fonts have no rupee glyph.
const INK = '#1F2326';
const MUTED = '#5C6166';
const ACCENT = '#1F4E52';
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

function footer(doc: PDFKit.PDFDocument) {
  doc
    .fillColor(MUTED)
    .font('Helvetica')
    .fontSize(7.5)
    .text(`Developed by Sahyadri Pearls · © ${new Date().getFullYear()} Sahyadri Pearls. All Rights Reserved.`, 50, 790, {
      width: 495,
      align: 'center',
    });
}

export interface InvoicePdfInput {
  store: { legalName: string; address: string; gstin: string | null; phone: string; email: string; state: string; stateCode: string };
  invoiceNumber: string;
  issuedAt: Date;
  orderNumber: string;
  placeOfSupply: string;
  isInterState: boolean;
  billTo: { name: string; phone: string; address: string; gstin?: string | null };
  lines: Array<{ name: string; sku: string; hsn: string | null; qty: number; unitPaise: number; discountPaise: number; taxablePaise: number; gstRateBp: number; gstPaise: number; totalPaise: number }>;
  delivery: { taxablePaise: number; gstPaise: number; totalPaise: number; rateBp: number };
  totals: { taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number };
  paymentMethod: string;
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
  doc.font('Helvetica').text(i.billTo.name).text(i.billTo.phone).text(i.billTo.address, { width: 260 });
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
    row([`${l.name}\n${l.sku}${l.discountPaise ? `  (discount ${rs(l.discountPaise)})` : ''}`, l.hsn ?? '', String(l.qty), rs(l.unitPaise), rs(l.taxablePaise), `${l.gstRateBp / 100}%\n${rs(l.gstPaise)}`, rs(l.totalPaise)]);
  }
  if (i.delivery.totalPaise > 0) row(['Delivery', '9965', '1', rs(i.delivery.totalPaise), rs(i.delivery.taxablePaise), `${i.delivery.rateBp / 100}%\n${rs(i.delivery.gstPaise)}`, rs(i.delivery.totalPaise)]);
  doc.moveTo(50, y).lineTo(545, y).strokeColor('#E4DDD2').stroke();
  y += 10;
  const sum = (label: string, v: number, bold = false) => {
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 10 : 9).text(label, 330, y, { width: 120, align: 'right' }).text(rs(v), 455, y, { width: 90, align: 'right' });
    y += bold ? 18 : 14;
  };
  sum('Taxable value', i.totals.taxablePaise);
  if (i.isInterState) sum('IGST', i.totals.igstPaise);
  else {
    sum('CGST', i.totals.cgstPaise);
    sum('SGST', i.totals.sgstPaise);
  }
  sum('Total (incl. GST)', i.totals.totalPaise, true);
  doc.font('Helvetica').fontSize(8.5).fillColor(MUTED).text(`Payment: ${i.paymentMethod}`, 50, y + 10);
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
  doc.rect(18, 18, w - 36, h - 36).lineWidth(1.5).strokeColor('#A8875A').stroke();
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
