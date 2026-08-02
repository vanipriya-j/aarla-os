/** User-facing message when a commerce sync server action fails or hangs. */
export function formatCommerceSyncFailure(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    !msg ||
    msg === "undefined" ||
    /failed to fetch|networkerror|load failed|timeout|timed out|504|503|502|function_invocation|aborted|unexpected end|invalid response/i.test(
      msg,
    )
  ) {
    return (
      "Sync request timed out or was interrupted before that chunk finished. " +
      "Already-saved rows are kept. Clear the sync lock if needed, then click Sync again."
    );
  }
  return msg;
}
