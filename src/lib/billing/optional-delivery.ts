/**
 * Stable identity for one author-requested optional delivery.
 *
 * `credit_ledger.external_ref` is globally unique, so this reference is the
 * database-enforced receipt key even though the richer replay payload lives in
 * `content_tool_runs`.
 */
export function optionalDeliveryReceiptRef(input: {
  projectId: string;
  resource: string;
  operationKey: string;
}): string {
  return `optional-delivery:${input.projectId}:${input.resource}:${input.operationKey}`;
}

/**
 * Prefix shared by every provider attempt made for one optional action.
 *
 * A content tool may make more than one model call. Keeping the operation name
 * outside this prefix lets a delivered receipt release or recognize every
 * lease for the same caller-stable action without matching another action.
 */
export function optionalDeliveryLeasePrefix(input: {
  userId: string;
  meteringIdempotencyKey: string;
}): string {
  return `optional-operation-lease:metering-intent:interactive:${input.userId}:${input.meteringIdempotencyKey}:`;
}
