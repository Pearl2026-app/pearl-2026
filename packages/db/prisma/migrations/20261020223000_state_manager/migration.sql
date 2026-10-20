-- State managers between head office and city managers. Safe to run again.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'STATE_MANAGER';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "state" TEXT;
