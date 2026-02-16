/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module GlobalTypes
 * @description Ambient type declarations for the Web Shell renderer.
 * @since 0.0.28
 */

/** Allow CSS side-effect imports (bundled by Vite). */
declare module "*.css" {}

/** File System Access API extensions not yet in standard lib types. */
interface FileSystemDirectoryHandle {
	queryPermission(descriptor: { mode: "read" | "readwrite" }): Promise<PermissionState>;
	requestPermission(descriptor: { mode: "read" | "readwrite" }): Promise<PermissionState>;
}
