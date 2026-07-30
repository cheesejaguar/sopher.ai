export async function scheduleReplacedAssetCleanup(input: {
  projectId: string;
  assetId?: string | null;
  pathname?: string | null;
}): Promise<void> {
  if (!input.assetId || !input.pathname) return;
  try {
    const [{ start }, { cleanupReplacedAsset }] = await Promise.all([
      import("workflow/api"),
      import("@/workflows/cleanup-replaced-asset"),
    ]);
    await start(cleanupReplacedAsset, [input.projectId, input.assetId, input.pathname]);
  } catch (error) {
    // The old row/blob remains valid and project deletion still owns a durable
    // all-assets cleanup. Surface scheduling failure without risking the new
    // replacement that already committed.
    console.error("Could not schedule replaced asset cleanup", { ...input, error });
  }
}
