ALTER TABLE "credit_ledger" ADD COLUMN "usd_paid" numeric(12, 2);--> statement-breakpoint
-- Backfill from the pack catalog. Credit amounts are unique per pack, so the
-- mapping is exact for every purchase made to date. Refunds already carry the
-- dollar figure in their description, but their credit amount is the face-value
-- dollars clawed back, so it maps directly.
UPDATE "credit_ledger" SET "usd_paid" = CASE
  WHEN "amount" = 25   THEN 25.00
  WHEN "amount" = 66   THEN 60.00
  WHEN "amount" = 138  THEN 120.00
  WHEN "amount" = 360  THEN 300.00
  ELSE NULL
END
WHERE "kind" = 'purchase' AND "usd_paid" IS NULL;--> statement-breakpoint
UPDATE "credit_ledger" SET "usd_paid" = "amount"
  WHERE "kind" = 'refund' AND "usd_paid" IS NULL;
