import type { ValidationReport } from "@permitgraph/evaluator";

export type ErrorCode =
  | "BAD_REQUEST"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "SLUG_TAKEN"
  | "LAST_OWNER"
  | "INVALID_SNAPSHOT"
  | "INTERNAL";

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ErrorCode,
    message: string,
    /** Extra machine-readable fields for the error envelope. */
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

/** Thrown by stores when a workspace slug is already in use. */
export class SlugTakenError extends Error {
  constructor(readonly slug: string) {
    super(`Workspace slug "${slug}" is already taken`);
    this.name = "SlugTakenError";
  }
}

/** Thrown by stores when a change would leave a workspace without an owner. */
export class LastOwnerError extends Error {
  constructor() {
    super("A workspace must keep at least one owner");
    this.name = "LastOwnerError";
  }
}

/** Thrown when a snapshot is well-formed JSON but not a consistent graph. */
export class InvalidSnapshotError extends Error {
  constructor(readonly report: ValidationReport) {
    const first = report.issues[0];
    super(
      first
        ? `${report.errorCount} error(s); first: ${first.code} at ${first.path}: ${first.message}`
        : `${report.errorCount} error(s)`,
    );
    this.name = "InvalidSnapshotError";
  }
}
