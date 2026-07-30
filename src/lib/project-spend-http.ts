import "server-only";

import {
  assertProjectSpendAccess,
  ProjectSpendAccessError,
  type ProjectSpendOperationKind,
} from "@/lib/project-spend-access";

export function projectSpendAccessErrorResponse(error: unknown): Response | null {
  if (!(error instanceof ProjectSpendAccessError)) return null;

  switch (error.code) {
    case "project_not_found":
      return Response.json({ error: "Project not found", code: error.code }, { status: 404 });
    case "purchase_required":
      return Response.json({ error: error.message, code: error.code }, { status: 402 });
    case "trial_busy":
      return Response.json({ error: error.message, code: error.code }, { status: 409 });
    case "suspended":
      return Response.json({ error: error.message, code: error.code }, { status: 403 });
  }
}

/** Returns an HTTP denial or null when the provider-backed operation may run. */
export async function authorizeProjectSpend(input: {
  userId: string;
  projectId: string;
  operationKind: ProjectSpendOperationKind;
}): Promise<Response | null> {
  try {
    await assertProjectSpendAccess(input);
    return null;
  } catch (error) {
    const response = projectSpendAccessErrorResponse(error);
    if (response) return response;
    throw error;
  }
}
