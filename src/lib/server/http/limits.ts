// Shared numeric limits for HTTP boundaries.
//
// Bulk endpoints are intentionally bounded. Callers must pass explicit IDs;
// no endpoint interprets "all" as an implicit set, and no endpoint accepts
// more IDs than MAX_BULK_IDS in a single request.

export const MAX_BULK_IDS = 200;
