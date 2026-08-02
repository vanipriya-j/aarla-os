/** User-facing message when a commerce sync request fails or hangs. */
export function formatCommerceSyncFailure(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (
    !msg ||
    msg === "undefined" ||
    /failed to fetch|networkerror|load failed|timeout|timed out|504|503|502|408|function_invocation|aborted|unexpected end|invalid response|unexpected response/i.test(
      msg,
    )
  ) {
    return (
      "Sync chunk timed out or returned an unexpected response (Vercel cut the request). " +
      "Already-saved rows are kept. Click “Clear stuck sync lock”, then Sync again — " +
      "it continues filling gaps."
    );
  }
  return msg;
}
