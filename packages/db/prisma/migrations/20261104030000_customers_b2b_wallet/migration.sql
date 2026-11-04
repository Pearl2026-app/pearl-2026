-- Client meeting (4 Nov): fuller business-buyer applications, and the referral wallet with cash-out.
-- Written to re-run safely like every migration here.

-- Business buyers: shop name and address, and who to contact
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "shopName" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "shopAddress" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "b2bContactPhone" TEXT;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "b2bContactEmail" TEXT;

-- Orders: the part paid from the wallet
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "walletPaise" INTEGER NOT NULL DEFAULT 0;

-- Wallet enums
DO $$ BEGIN
  CREATE TYPE "WalletEntryKind" AS ENUM ('REFERRAL_REWARD', 'SPENT', 'CASHOUT', 'ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "WalletPayoutMethod" AS ENUM ('UPI', 'BANK');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE "WalletPayoutStatus" AS ENUM ('REQUESTED', 'PAID', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Cash-out requests
CREATE TABLE IF NOT EXISTS "WalletPayout" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "method" "WalletPayoutMethod" NOT NULL,
    "upiId" TEXT,
    "bankAccountName" TEXT,
    "bankAccountNumber" TEXT,
    "bankIfsc" TEXT,
    "bankName" TEXT,
    "status" "WalletPayoutStatus" NOT NULL DEFAULT 'REQUESTED',
    "paidAt" TIMESTAMP(3),
    "reference" TEXT,
    "note" TEXT,
    "decidedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WalletPayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "WalletPayout_status_createdAt_idx" ON "WalletPayout"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "WalletPayout_customerId_idx" ON "WalletPayout"("customerId");
DO $$ BEGIN
  ALTER TABLE "WalletPayout" ADD CONSTRAINT "WalletPayout_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The wallet ledger: the balance is the sum of amountPaise
CREATE TABLE IF NOT EXISTS "WalletEntry" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "kind" "WalletEntryKind" NOT NULL,
    "orderId" TEXT,
    "payoutId" TEXT,
    "note" TEXT,
    "idemKey" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WalletEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "WalletEntry_idemKey_key" ON "WalletEntry"("idemKey");
CREATE INDEX IF NOT EXISTS "WalletEntry_customerId_createdAt_idx" ON "WalletEntry"("customerId", "createdAt");
CREATE INDEX IF NOT EXISTS "WalletEntry_orderId_idx" ON "WalletEntry"("orderId");
DO $$ BEGIN
  ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "WalletEntry" ADD CONSTRAINT "WalletEntry_payoutId_fkey"
    FOREIGN KEY ("payoutId") REFERENCES "WalletPayout"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
