-- Franchise areas (client meeting, 4 Nov): head office allots each franchise a fixed set of PIN codes, and a
-- product can belong to a franchise, shown only to shoppers in that franchise's area.
-- Written to re-run safely (IF NOT EXISTS everywhere) like every migration here.

-- Franchise: the PIN codes it is allotted
ALTER TABLE "Franchise" ADD COLUMN IF NOT EXISTS "pincodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Product: the franchise it belongs to (empty = head office stock, shown everywhere as before)
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "franchiseId" TEXT;

DO $$ BEGIN
  ALTER TABLE "Product" ADD CONSTRAINT "Product_franchiseId_fkey"
    FOREIGN KEY ("franchiseId") REFERENCES "Franchise"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Product_franchiseId_idx" ON "Product"("franchiseId");
