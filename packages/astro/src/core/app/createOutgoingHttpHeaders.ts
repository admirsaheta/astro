import { type OutgoingHttpHeaders } from 'node:http';

interface WebAPIHeaders {
	entries(): IterableIterator<[string, string]>;
	has(name: string): boolean;
	get(name: string): string | null;
	getSetCookie(): string[];
}

/**
 * Takes in a nullable WebAPI Headers object and produces a NodeJS OutgoingHttpHeaders object suitable for usage
 * with ServerResponse.writeHead(..) or ServerResponse.setHeader(..)
 *
 * @param headers WebAPI Headers object
 * @returns {OutgoingHttpHeaders} NodeJS OutgoingHttpHeaders object with multiple set-cookie handled as an array of values
 */
export const createOutgoingHttpHeaders = (
	headers: WebAPIHeaders | undefined | null
): OutgoingHttpHeaders | undefined => {
	if (!headers) {
		return undefined;
	}

	// Convert WebAPI Headers to NodeJS OutgoingHttpHeaders
	const nodeHeaders: OutgoingHttpHeaders = Object.fromEntries(headers.entries());

	if (Object.keys(nodeHeaders).length === 0) {
		return undefined;
	}

	// if there is > 1 set-cookie header, we have to fix it to be an array of values
	if (headers.has('set-cookie')) {
		const cookieHeaders = headers.getSetCookie();
		if (cookieHeaders.length > 1) {
			// the Headers.entries() API already normalized all header names to lower case so we can safely index this as 'set-cookie'
			nodeHeaders['set-cookie'] = cookieHeaders;
		}
	}

	return nodeHeaders;
};
