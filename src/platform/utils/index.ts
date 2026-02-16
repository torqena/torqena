/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module native/utils
 * @description Native utility exports.
 *
 * This module provides native implementations of commonly used utilities,
 * replacing the obsidian-shim equivalents.
 *
 * @example
 * ```typescript
 * import { Platform, setIcon } from '../platform/utils';
 *
 * if (Platform.isDesktop) {
 *   setIcon(buttonEl, 'settings');
 * }
 * ```
 *
 * @since 0.1.0
 */

export { Platform, type PlatformInfo } from "./platform.js";
export { setIcon } from "./icons.js";


