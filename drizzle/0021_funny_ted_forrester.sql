UPDATE "suggestions"
SET "status" = 'rejected'
WHERE "status" = 'pending'
  AND normalize(
    replace(
      replace("suggested_text", chr(13) || chr(10), chr(10)),
      chr(13),
      chr(10)
    ),
    NFC
  ) = normalize(
    replace(
      replace(("anchor"->>'originalText'), chr(13) || chr(10), chr(10)),
      chr(13),
      chr(10)
    ),
    NFC
  );
--> statement-breakpoint
ALTER TABLE "suggestions"
ADD CONSTRAINT "ck_suggestions_pending_changes_text"
CHECK (
  "suggestions"."status" <> 'pending'
  OR normalize(
    replace(
      replace("suggestions"."suggested_text", chr(13) || chr(10), chr(10)),
      chr(13),
      chr(10)
    ),
    NFC
  ) <> normalize(
    replace(
      replace(("suggestions"."anchor"->>'originalText'), chr(13) || chr(10), chr(10)),
      chr(13),
      chr(10)
    ),
    NFC
  )
);
