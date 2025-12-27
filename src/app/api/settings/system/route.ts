import { NextRequest, NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { systemConfig } from "@/src/lib/db/schema";
import { getSessionWithRole } from "@/src/lib/auth-helpers";
import { eq } from "drizzle-orm";

// Default system settings
const DEFAULT_SETTINGS = {
  matchConfidenceThreshold: 0.8,
  autoDuplicateDetection: true,
  preferredPosterLanguage: "en",
  preferredBackdropLanguage: "en",
  scanScheduleEnabled: false,
  scanScheduleCron: "0 2 * * *", // 2 AM daily
  themePreference: "dark",
  accessibilityFontSize: "medium",
  accessibilityHighContrast: false,
};

type SystemSettingsKey = keyof typeof DEFAULT_SETTINGS;

// GET /api/settings/system - Fetch all system settings with defaults
export async function GET(request: NextRequest) {
  try {
    const session = await getSessionWithRole();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all settings from database
    const storedSettings = await db
      .select()
      .from(systemConfig);

    // Build settings object with defaults
    const settings: Record<string, any> = { ...DEFAULT_SETTINGS };

    // Override with stored values
    for (const setting of storedSettings) {
      if (setting.key in DEFAULT_SETTINGS) {
        settings[setting.key] = setting.value;
      }
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error fetching system settings:", error);
    return NextResponse.json(
      { error: "Failed to fetch system settings" },
      { status: 500 }
    );
  }
}

// PATCH /api/settings/system - Update system settings (admin only)
export async function PATCH(request: NextRequest) {
  try {
    const session = await getSessionWithRole();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only admins can update system settings
    if (session.user.role !== "admin") {
      return NextResponse.json(
        { error: "Admin access required" },
        { status: 403 }
      );
    }

    const body = await request.json();

    // Validate each setting
    const validationErrors: string[] = [];

    if (body.matchConfidenceThreshold !== undefined) {
      const threshold = Number(body.matchConfidenceThreshold);
      if (isNaN(threshold) || threshold < 0 || threshold > 1) {
        validationErrors.push("Match threshold must be between 0 and 1");
      }
    }

    if (body.autoDuplicateDetection !== undefined) {
      if (typeof body.autoDuplicateDetection !== "boolean") {
        validationErrors.push("Auto duplicate detection must be a boolean");
      }
    }

    if (body.preferredPosterLanguage !== undefined) {
      if (
        typeof body.preferredPosterLanguage !== "string" ||
        !/^[a-z]{2}(-[A-Z]{2})?$/.test(body.preferredPosterLanguage)
      ) {
        validationErrors.push(
          "Preferred poster language must be a valid ISO language code (e.g., 'en', 'en-US')"
        );
      }
    }

    if (body.preferredBackdropLanguage !== undefined) {
      if (
        typeof body.preferredBackdropLanguage !== "string" ||
        !/^[a-z]{2}(-[A-Z]{2})?$/.test(body.preferredBackdropLanguage)
      ) {
        validationErrors.push(
          "Preferred backdrop language must be a valid ISO language code (e.g., 'en', 'en-US')"
        );
      }
    }

    if (body.scanScheduleEnabled !== undefined) {
      if (typeof body.scanScheduleEnabled !== "boolean") {
        validationErrors.push("Scan schedule enabled must be a boolean");
      }
    }

    if (body.scanScheduleCron !== undefined) {
      if (typeof body.scanScheduleCron !== "string") {
        validationErrors.push("Scan schedule cron must be a string");
      }
      // Basic cron validation (5 fields)
      const cronParts = body.scanScheduleCron.trim().split(/\s+/);
      if (cronParts.length !== 5) {
        validationErrors.push(
          "Scan schedule cron must have 5 fields (minute hour day month weekday)"
        );
      }
    }

    if (body.themePreference !== undefined) {
      if (!["dark", "light", "auto"].includes(body.themePreference)) {
        validationErrors.push("Theme preference must be 'dark', 'light', or 'auto'");
      }
    }

    if (body.accessibilityFontSize !== undefined) {
      if (
        !["small", "medium", "large", "xlarge"].includes(
          body.accessibilityFontSize
        )
      ) {
        validationErrors.push(
          "Accessibility font size must be 'small', 'medium', 'large', or 'xlarge'"
        );
      }
    }

    if (body.accessibilityHighContrast !== undefined) {
      if (typeof body.accessibilityHighContrast !== "boolean") {
        validationErrors.push("Accessibility high contrast must be a boolean");
      }
    }

    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: "Validation errors", details: validationErrors },
        { status: 400 }
      );
    }

    // Update each setting in the database
    for (const [key, value] of Object.entries(body)) {
      if (key in DEFAULT_SETTINGS) {
        // Check if setting already exists
        const [existingSetting] = await db
          .select()
          .from(systemConfig)
          .where(eq(systemConfig.key, key))
          .limit(1);

        if (existingSetting) {
          // Update existing setting
          await db
            .update(systemConfig)
            .set({ value: value as any, updatedAt: new Date() })
            .where(eq(systemConfig.key, key));
        } else {
          // Insert new setting
          await db.insert(systemConfig).values({
            key,
            value: value as any,
            updatedAt: new Date(),
          });
        }
      }
    }

    // Fetch updated settings
    const updatedSettings = await db
      .select()
      .from(systemConfig);

    const settings: Record<string, any> = { ...DEFAULT_SETTINGS };
    for (const setting of updatedSettings) {
      if (setting.key in DEFAULT_SETTINGS) {
        settings[setting.key] = setting.value;
      }
    }

    return NextResponse.json(settings);
  } catch (error) {
    console.error("Error updating system settings:", error);
    return NextResponse.json(
      { error: "Failed to update system settings" },
      { status: 500 }
    );
  }
}
