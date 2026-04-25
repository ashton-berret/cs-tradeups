export type ApiErrorBody = {
	error?: string;
	message?: string;
	issues?: unknown[];
	rowErrors?: unknown[];
};

export class ApiError extends Error {
	status: number;
	code: string;
	issues?: unknown[];
	rowErrors?: unknown[];

	constructor(status: number, body: ApiErrorBody = {}) {
		super(body.message ?? body.error ?? `Request failed with status ${status}`);
		this.name = 'ApiError';
		this.status = status;
		this.code = body.error ?? 'ApiError';
		this.issues = body.issues;
		this.rowErrors = body.rowErrors;
	}
}

export async function apiFetch<T>(
	fetchFn: typeof fetch,
	path: string,
	init: RequestInit = {}
): Promise<T> {
	const headers = new Headers(init.headers);
	if (init.body && !headers.has('content-type')) {
		headers.set('content-type', 'application/json');
	}

	const response = await fetchFn(path, { ...init, headers });
	const contentType = response.headers.get('content-type') ?? '';
	const body = contentType.includes('application/json') ? await response.json() : undefined;

	if (!response.ok) {
		throw new ApiError(response.status, body);
	}

	return body as T;
}
