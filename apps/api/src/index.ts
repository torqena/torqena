/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module index
 * @description Entry point for Azure Functions that registers all HTTP triggers.
 * 
 * This file imports all function modules to ensure they register with the @azure/functions app instance.
 * 
 * @since 1.0.0
 */

import { app } from "@azure/functions";

// Import all functions to register them with the app
import "./functions/health";
import "./functions/setup";
import "./functions/getExtensionRatings";
import "./functions/submitRating";
import "./functions/deleteRating";
import "./functions/getUserRatings";
import "./functions/getMetrics";
import "./functions/getBatchMetrics";
import "./functions/trackInstall";
import "./functions/trackUninstall";
import "./functions/getUserData";
import "./functions/deleteUserData";

// Export the app instance for Azure Functions runtime
export { app };
