/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Dan Shue. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * @module seedData
 * @description Seed script to populate Azurite tables with sample data for local development.
 * 
 * Run with: npx ts-node src/scripts/seedData.ts
 * 
 * @since 1.0.0
 */

import { TableClient } from "@azure/data-tables";
import * as crypto from "crypto";

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING ||
    "DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;";

interface InstallEntity {
    partitionKey: string;
    rowKey: string;
    UserHash: string;
    Version: string;
    Platform: string;
    VaultCopilotVersion: string;
    InstallDate: string;
    IsActive: boolean;
    UninstallDate?: string;
}

interface RatingEntity {
    partitionKey: string;
    rowKey: string;
    Rating: number;
    Comment?: string;
    Version: string;
    SubmittedDate: string;
    UpdatedDate: string;
}

interface MetricsCacheEntity {
    partitionKey: string;
    rowKey: string;
    TotalInstalls: number;
    ActiveInstalls: number;
    AverageRating: number;
    TotalRatings: number;
    LastUpdated: string;
}

/**
 * Generate a fake user hash for testing.
 */
function generateUserHash(): string {
    return crypto.randomBytes(16).toString("hex");
}

/**
 * Main seed function.
 */
async function seed(): Promise<void> {
    const options = { allowInsecureConnection: true };
    
    const installsClient = TableClient.fromConnectionString(connectionString, "Installs", options);
    const ratingsClient = TableClient.fromConnectionString(connectionString, "Ratings", options);
    const metricsClient = TableClient.fromConnectionString(connectionString, "MetricsCache", options);

    console.log("Creating tables...");
    try {
        await installsClient.createTable();
        console.log("✓ Installs table created");
    } catch (e) {
        console.log("✓ Installs table already exists");
    }

    try {
        await ratingsClient.createTable();
        console.log("✓ Ratings table created");
    } catch (e) {
        console.log("✓ Ratings table already exists");
    }

    try {
        await metricsClient.createTable();
        console.log("✓ MetricsCache table created");
    } catch (e) {
        console.log("✓ MetricsCache table already exists");
    }

    // Sample extensions
    const extensions = [
        { id: "torqena", name: "Vault Copilot" },
        { id: "obsidian-dataview", name: "Dataview" },
        { id: "obsidian-templater", name: "Templater" },
    ];

    const now = new Date();
    const threeMonthsAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

    for (const ext of extensions) {
        console.log(`\nSeeding ${ext.name}...`);

        // Add 10 sample installs
        const userHashes = Array.from({ length: 10 }, () => generateUserHash());
        let activeCount = 0;

        for (let i = 0; i < userHashes.length; i++) {
            const userHash = userHashes[i];
            const isActive = Math.random() > 0.3; // 70% active, 30% uninstalled
            if (isActive) activeCount++;

            const installDate = new Date(threeMonthsAgo.getTime() + Math.random() * 90 * 24 * 60 * 60 * 1000);
            const sanitizedTimestamp = installDate.toISOString().replace(/:/g, "-");

            const install: InstallEntity = {
                partitionKey: ext.id,
                rowKey: `${userHash}_${sanitizedTimestamp}`,
                UserHash: userHash,
                Version: `${Math.floor(Math.random() * 2)}.${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 20)}`,
                Platform: Math.random() > 0.5 ? "desktop" : "mobile",
                VaultCopilotVersion: `0.${Math.floor(Math.random() * 3)}.${Math.floor(Math.random() * 20)}`,
                InstallDate: installDate.toISOString(),
                IsActive: isActive,
            };

            if (!isActive) {
                install.UninstallDate = new Date(installDate.getTime() + Math.random() * 60 * 24 * 60 * 60 * 1000).toISOString();
            }

            await installsClient.createEntity(install);
        }

        console.log(`  ✓ Added ${userHashes.length} installs (${activeCount} active)`);

        // Add 5-8 sample ratings
        const ratingCount = 5 + Math.floor(Math.random() * 4);
        const ratedUsers = userHashes.slice(0, ratingCount);
        let totalRating = 0;

        for (const userHash of ratedUsers) {
            const rating = 3 + Math.floor(Math.random() * 3); // 3-5 stars
            totalRating += rating;

            const ratingDate = new Date(threeMonthsAgo.getTime() + Math.random() * 90 * 24 * 60 * 60 * 1000);

            const ratingEntity: RatingEntity = {
                partitionKey: ext.id,
                rowKey: userHash,
                Rating: rating,
                Comment: ["Great!", "Works well", "Excellent tool", "Very useful"][Math.floor(Math.random() * 4)],
                Version: `0.${Math.floor(Math.random() * 2)}.x`,
                SubmittedDate: ratingDate.toISOString(),
                UpdatedDate: ratingDate.toISOString(),
            };

            await ratingsClient.createEntity(ratingEntity);
        }

        console.log(`  ✓ Added ${ratingCount} ratings`);

        // Add metrics cache entry
        const avgRating = ratingCount > 0 ? totalRating / ratingCount : 0;
        const metricsEntity: MetricsCacheEntity = {
            partitionKey: ext.id,
            rowKey: "summary",
            TotalInstalls: userHashes.length,
            ActiveInstalls: activeCount,
            AverageRating: Math.round(avgRating * 100) / 100,
            TotalRatings: ratingCount,
            LastUpdated: now.toISOString(),
        };

        await metricsClient.createEntity(metricsEntity);
        console.log(`  ✓ Updated metrics cache`);
    }

    console.log("\n✅ Seed data populated successfully!");
}

seed().catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
});
