/**
 * Stub for Node.js fs module.
 * File operations in the browser go through the Vault shim (File System Access API), not fs.
 */

function notAvailable(name: string): never {
	throw new Error(`fs.${name} is not available in the browser`);
}

export function readFileSync(): never { return notAvailable("readFileSync"); }
export function writeFileSync(): never { return notAvailable("writeFileSync"); }
export function existsSync(): boolean { return false; }
export function mkdirSync(): void {}
export function readdirSync(): string[] { return []; }
export function statSync(): never { return notAvailable("statSync"); }
export function unlinkSync(): never { return notAvailable("unlinkSync"); }
export function rmdirSync(): never { return notAvailable("rmdirSync"); }
export function readFile(): void {}
export function writeFile(): void {}
export function access(): void {}
export function mkdir(): void {}
export function rmdir(): void {}
export function unlink(): void {}
export function copyFileSync(): never { return notAvailable("copyFileSync"); }
export function createWriteStream(): never { return notAvailable("createWriteStream"); }
export function createReadStream(): never { return notAvailable("createReadStream"); }

export const promises = {
	readFile: async () => { notAvailable("promises.readFile"); },
	writeFile: async () => { notAvailable("promises.writeFile"); },
	mkdir: async () => { notAvailable("promises.mkdir"); },
	access: async () => { notAvailable("promises.access"); },
	stat: async () => { notAvailable("promises.stat"); },
	readdir: async () => { notAvailable("promises.readdir"); },
	unlink: async () => { notAvailable("promises.unlink"); },
};

export default {
	readFileSync,
	writeFileSync,
	existsSync,
	mkdirSync,
	readdirSync,
	statSync,
	unlinkSync,
	rmdirSync,
	readFile,
	writeFile,
	access,
	mkdir,
	rmdir,
	unlink,
	copyFileSync,
	createWriteStream,
	createReadStream,
	promises,
};
