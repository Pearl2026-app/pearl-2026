-- Purchase orders done properly (client meeting, 31 Oct): exact specifications, CAD and photos,
-- pearls sent/received before acceptance, the new work stages, making-charge accounting and the manufacturer's bill.
-- Written to re-run safely (IF NOT EXISTS everywhere) like every migration here.

-- Exact specification of the piece
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "pearlSizeMm" DECIMAL(8,3);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "pearlWeightCt" DECIMAL(8,3);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "metal" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "metalWeightG" DECIMAL(10,3);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "ringSize" TEXT;

-- CAD file and design photos
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "cadUrl" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "imageUrls" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Pearls go first
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "pearlsSentAt" TIMESTAMP(3);
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "pearlsReceivedAt" TIMESTAMP(3);

-- Making charge and the manufacturer's bill
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "makingRatePerGramPaise" INTEGER;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "gstPercent" DECIMAL(5,2) NOT NULL DEFAULT 5;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "billUrl" TEXT;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "billAmountPaise" INTEGER;
ALTER TABLE "PurchaseOrder" ADD COLUMN IF NOT EXISTS "billUploadedAt" TIMESTAMP(3);

DO $$ BEGIN
  ALTER TABLE "PurchaseOrder" ADD CONSTRAINT "PurchaseOrder_making_check"
    CHECK (("makingRatePerGramPaise" IS NULL OR "makingRatePerGramPaise" >= 0) AND ("billAmountPaise" IS NULL OR "billAmountPaise" >= 0) AND "gstPercent" >= 0 AND "gstPercent" <= 28);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The work stages were renamed; carry the current stage over (the history keeps the old names, which still display).
UPDATE "PurchaseOrder" SET "stage" = 'Received PO' WHERE "stage" = 'Receiving PO';
UPDATE "PurchaseOrder" SET "stage" = 'Filing & finishing' WHERE "stage" = 'Filling and Finishing';
UPDATE "PurchaseOrder" SET "stage" = 'Pearl setting' WHERE "stage" = 'Pearl Setting';
UPDATE "PurchaseOrder" SET "stage" = 'Hallmark' WHERE "stage" = 'Metal Hallmark';
UPDATE "PurchaseOrder" SET "stage" = 'Ready for pickup' WHERE "stage" = 'Ready for Pickup';
