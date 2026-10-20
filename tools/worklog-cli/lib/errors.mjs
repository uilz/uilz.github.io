// Stable error codes for the Worklog tool contract (v0.1).
export const CODES = Object.freeze({
  INVALID_INPUT: 'INVALID_INPUT',
  SNAPSHOT_NOT_FOUND: 'SNAPSHOT_NOT_FOUND',
  WORKBLOCK_NOT_FOUND: 'WORKBLOCK_NOT_FOUND',
  STORAGE_ERROR: 'STORAGE_ERROR',
  UNSUPPORTED: 'UNSUPPORTED',
});

export class ToolError extends Error {
  constructor(code, message, retryable = false) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.retryable = !!retryable;
  }
}
