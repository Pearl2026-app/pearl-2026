-- Client meeting of 4 Nov: commission report, delivery-partner welcome, careers documents, product certificates
-- and daily metal rates. Written to re-run safely (IF NOT EXISTS everywhere) like every migration here.

-- Delivery partners: an email for the welcome message sent on approval
ALTER TABLE "DeliveryPartner" ADD COLUMN IF NOT EXISTS "email" TEXT;

-- Products: certificate entered when the piece is added, and pricing that follows the daily metal rate
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "certificateNumber" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "certificateUrl" TEXT;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "priceFollowsMetalRate" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "metalRateKey" TEXT;

-- Job applications: ID proof beside the resume
ALTER TABLE "JobApplication" ADD COLUMN IF NOT EXISTS "idProofUrl" TEXT;

-- Daily gold / silver / platinum rates, one row per metal per day
CREATE TABLE IF NOT EXISTS "MetalRate" (
    "id" TEXT NOT NULL,
    "metal" TEXT NOT NULL,
    "ratePerGramPaise" INTEGER NOT NULL,
    "effectiveDate" DATE NOT NULL,
    "source" "PearlRateSource" NOT NULL DEFAULT 'MANUAL',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetalRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MetalRate_metal_effectiveDate_key" ON "MetalRate"("metal", "effectiveDate");
CREATE INDEX IF NOT EXISTS "MetalRate_effectiveDate_idx" ON "MetalRate"("effectiveDate");

DO $$ BEGIN
  ALTER TABLE "MetalRate" ADD CONSTRAINT "MetalRate_rate_positive" CHECK ("ratePerGramPaise" > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
