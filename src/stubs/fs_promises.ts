/**
 * Stub for Node.js fs/promises module.
 */

function notAvailable(name: string): never {
	throw new Error(`fs/promises.${name} is not available in the browser`);
}

export async function readFile(): Promise<never> { return notAvailable("readFile"); }
export async function writeFile(): Promise<never> { return notAvailable("writeFile"); }
export async function mkdir(): Promise<never> { return notAvailable("mkdir"); }
export async function access(): Promise<never> { return notAvailable("access"); }
export async function stat(): Promise<never> { return notAvailable("stat"); }
export async function readdir(): Promise<never> { return notAvailable("readdir"); }
export async function unlink(): Promise<never> { return notAvailable("unlink"); }
export async function rm(): Promise<never> { return notAvailable("rm"); }
export async function rename(): Promise<never> { return notAvailable("rename"); }
export async function copyFile(): Promise<never> { return notAvailable("copyFile"); }
