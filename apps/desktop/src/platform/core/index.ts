/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module native/core
 * @description Core native implementations.
 *
 * This module provides native implementations of core patterns
 * like event emitting, replacing the obsidian-shim equivalents.
 *
 * @example
 * ```typescript
 * import { Events, EventRef } from '../platform/core';
 *
 * class MyComponent extends Events {
 *   // ...
 * }
 * ```
 *
 * @since 0.1.0
 */

export { Events, type EventRef } from "./Events.js";


