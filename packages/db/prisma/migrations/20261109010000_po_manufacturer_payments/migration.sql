-- Payments made to the manufacturer against a purchase order (a JSON list on the PO; no new table).
ALTER TABLE "PurchaseOrder" ADD COLUMN "manufacturerPayments" JSONB;
