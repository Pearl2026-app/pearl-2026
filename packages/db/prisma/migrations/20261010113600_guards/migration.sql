-- Database-level guarantees that do not fit in schema.prisma.
-- NOTE for future `prisma migrate dev`: Prisma cannot express partial indexes or triggers,
-- so check new migrations for DROP statements touching the objects below and remove them.

-- Rule 2: a unique piece can be held or sold by only one checkout at a time.
-- Even if application code had a bug, a second ACTIVE or CONVERTED hold on the same unique product is refused.
CREATE UNIQUE INDEX "StockHold_one_live_hold_per_unique_product"
  ON "StockHold" ("productId")
  WHERE "isUnique" = true AND "status" IN ('ACTIVE', 'CONVERTED');

-- Rule 6: the audit log and order timeline are append-only.
CREATE OR REPLACE FUNCTION sahyadri_forbid_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "AuditLog_append_only"
  BEFORE UPDATE OR DELETE ON "AuditLog"
  FOR EACH ROW EXECUTE FUNCTION sahyadri_forbid_change();

CREATE TRIGGER "AuditLog_no_truncate"
  BEFORE TRUNCATE ON "AuditLog"
  FOR EACH STATEMENT EXECUTE FUNCTION sahyadri_forbid_change();

CREATE TRIGGER "OrderEvent_append_only"
  BEFORE UPDATE OR DELETE ON "OrderEvent"
  FOR EACH ROW EXECUTE FUNCTION sahyadri_forbid_change();

-- Money fields are never negative.
ALTER TABLE "Order" ADD CONSTRAINT "Order_money_non_negative"
  CHECK ("subtotalPaise" >= 0 AND "discountPaise" >= 0 AND "taxablePaise" >= 0 AND "gstPaise" >= 0
         AND "deliveryPaise" >= 0 AND "totalPaise" >= 0);
ALTER TABLE "Product" ADD CONSTRAINT "Product_price_non_negative" CHECK ("pricePaise" >= 0 AND "quantity" >= 0);
ALTER TABLE "Review" ADD CONSTRAINT "Review_rating_range" CHECK ("rating" BETWEEN 1 AND 5);
