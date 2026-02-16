/**
 * Stub for Node.js util module.
 */

export function promisify(fn: (...args: any[]) => any): (...args: any[]) => Promise<any> {
	return (...args: any[]) => {
		return new Promise((resolve, reject) => {
			fn(...args, (err: any, result: any) => {
				if (err) reject(err);
				else resolve(result);
			});
		});
	};
}

export function inspect(obj: any): string {
	return JSON.stringify(obj, null, 2);
}

// Re-export browser globals that Node's util also provides
const _TextDecoder = TextDecoder;
const _TextEncoder = TextEncoder;
export { _TextDecoder as TextDecoder, _TextEncoder as TextEncoder };

export default { promisify, inspect, TextDecoder: _TextDecoder, TextEncoder: _TextEncoder };
