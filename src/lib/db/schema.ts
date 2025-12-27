import {
  pgTable,
  text,
  timestamp,
  boolean,
  integer,
  serial,
  uuid,
  bigint,
  decimal,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ============================================================================
// User Management (Better-auth compatible)
// ============================================================================

export const users = pgTable("user", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false),
  name: text("name").notNull(),
  image: text("image"),
  role: text("role").notNull().default("user"), // "user" or "admin"
  mustChangePassword: boolean("must_change_password").default(false),
  isDefaultAdmin: boolean("is_default_admin").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  expiresAt: timestamp("expires_at"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const userInvites = pgTable("user_invites", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  role: text("role").notNull().default("user"),
  token: text("token").notNull().unique(),
  invitedBy: text("invited_by")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at").notNull(),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ============================================================================
// Seerr Configuration
// ============================================================================

export const seerrSettings = pgTable("seerr_settings", {
  id: serial("id").primaryKey(),
  apiUrl: text("api_url"),
  apiKey: text("api_key"), // Should be encrypted in production
  seerrType: text("seerr_type").default("overseerr"), // "overseerr" or "jellyseerr"
  connectionStatus: text("connection_status").default("disconnected"), // "connected", "disconnected", "error"
  lastTestedAt: timestamp("last_tested_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================
// Media Libraries
// ============================================================================

export const mediaLibraries = pgTable(
  "media_libraries",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    path: text("path").notNull(), // Docker volume mount path
    label: text("label").notNull(), // "Movies", "TV Shows", etc.
    type: text("type").notNull(), // "movie" or "tv"
    enabled: boolean("enabled").notNull().default(true),
    scanStatus: text("scan_status").default("idle"), // "idle", "scanning", "error"
    lastScanAt: timestamp("last_scan_at"),

    // Watch folder settings
    watchEnabled: boolean("watch_enabled").default(false),
    watchDebounceMs: integer("watch_debounce_ms").default(30000), // 30 seconds

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("media_libraries_user_id_idx").on(table.userId),
    index("media_libraries_enabled_idx").on(table.enabled),
  ]
);

// ============================================================================
// Library Settings
// ============================================================================

export const librarySettings = pgTable(
  "library_settings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => mediaLibraries.id, { onDelete: "cascade" }),
    autoMetadataOnScan: boolean("auto_metadata_on_scan").default(true),
    matchConfidenceThreshold: decimal("match_confidence_threshold", {
      precision: 3,
      scale: 2,
    }).default("0.80"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [index("library_settings_library_id_idx").on(table.libraryId)]
);

// ============================================================================
// Media Files
// ============================================================================

export const mediaFiles = pgTable(
  "media_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => mediaLibraries.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(), // Relative to library root
    fileName: text("file_name").notNull(),
    fileSize: bigint("file_size", { mode: "number" }),
    fileExtension: text("file_extension"),

    // Parsed metadata (from filename)
    parsedTitle: text("parsed_title"),
    parsedYear: text("parsed_year"),
    parsedSeason: integer("parsed_season"),
    parsedEpisode: integer("parsed_episode"),

    // Seerr metadata
    seerrVerified: boolean("seerr_verified").default(false),
    seerrTitle: text("seerr_title"),
    seerrYear: text("seerr_year"),
    seerrTmdbId: integer("seerr_tmdb_id"),
    seerrOverview: text("seerr_overview"),
    seerrPosterPath: text("seerr_poster_path"),
    seerrBackdropPath: text("seerr_backdrop_path"),
    seerrVoteAverage: decimal("seerr_vote_average", { precision: 3, scale: 1 }),
    seerrCast: jsonb("seerr_cast"), // Array of {name, character, profile_path}
    seerrMatchScore: decimal("seerr_match_score", { precision: 3, scale: 2 }),

    // TV show specific metadata
    seerrSeasonName: text("seerr_season_name"), // Season name from TMDB
    seerrEpisodeName: text("seerr_episode_name"), // Episode title from TMDB

    // Manual override
    manualTitle: text("manual_title"),
    manualYear: text("manual_year"),
    manualSeason: integer("manual_season"),
    manualEpisode: integer("manual_episode"),
    manualShowGroup: text("manual_show_group"), // Override for show grouping (canonical show name)

    // Renaming status
    renameStatus: text("rename_status").default("pending"), // "pending", "ready", "renamed", "error", "skipped"
    lastRenamedAt: timestamp("last_renamed_at"),
    renameError: text("rename_error"),

    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("media_files_library_id_idx").on(table.libraryId),
    index("media_files_rename_status_idx").on(table.renameStatus),
    index("media_files_file_path_idx").on(table.filePath),
    index("media_files_tmdb_id_idx").on(table.seerrTmdbId),
    index("media_files_library_tmdb_idx").on(table.libraryId, table.seerrTmdbId),
  ]
);

// ============================================================================
// Duplicate Exclusions (Pairs marked as "not duplicates")
// ============================================================================

export const duplicateExclusions = pgTable(
  "duplicate_exclusions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    fileId1: uuid("file_id_1")
      .notNull()
      .references(() => mediaFiles.id, { onDelete: "cascade" }),
    fileId2: uuid("file_id_2")
      .notNull()
      .references(() => mediaFiles.id, { onDelete: "cascade" }),
    excludedAt: timestamp("excluded_at").notNull().defaultNow(),
    excludedBy: text("excluded_by").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (table) => [
    index("duplicate_exclusions_file1_idx").on(table.fileId1),
    index("duplicate_exclusions_file2_idx").on(table.fileId2),
  ]
);

// ============================================================================
// Subtitle Files
// ============================================================================

export const subtitleFiles = pgTable(
  "subtitle_files",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mediaFileId: uuid("media_file_id")
      .notNull()
      .references(() => mediaFiles.id, { onDelete: "cascade" }),
    filePath: text("file_path").notNull(),
    language: text("language"),
    extension: text("extension"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("subtitle_files_media_file_id_idx").on(table.mediaFileId)]
);

// ============================================================================
// Worker Jobs
// ============================================================================

export const workerJobs = pgTable(
  "worker_jobs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    type: text("type").notNull(), // "scan", "rename", "metadata_fetch"
    libraryId: uuid("library_id").references(() => mediaLibraries.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull().default("queued"), // "queued", "running", "completed", "failed"
    progress: integer("progress").default(0), // 0-100
    totalItems: integer("total_items").default(0),
    processedItems: integer("processed_items").default(0),
    errorCount: integer("error_count").default(0),
    dryRun: boolean("dry_run").default(false),
    startedAt: timestamp("started_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("worker_jobs_status_idx").on(table.status),
    index("worker_jobs_library_id_idx").on(table.libraryId),
  ]
);

// ============================================================================
// Worker Job Logs
// ============================================================================

export const workerJobLogs = pgTable(
  "worker_job_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => workerJobs.id, { onDelete: "cascade" }),
    mediaFileId: uuid("media_file_id").references(() => mediaFiles.id, {
      onDelete: "set null",
    }),
    operation: text("operation").notNull(), // "scan", "rename", "metadata"
    status: text("status").notNull(), // "success", "error", "skipped"
    oldPath: text("old_path"),
    newPath: text("new_path"),
    errorMessage: text("error_message"),
    executionTimeMs: integer("execution_time_ms"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("worker_job_logs_job_id_idx").on(table.jobId),
    index("worker_job_logs_status_idx").on(table.status),
  ]
);

// ============================================================================
// System Configuration (key-value store)
// ============================================================================

export const systemConfig = pgTable("system_config", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: jsonb("value"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================
// Cache Settings (Redis toggle)
// ============================================================================

export const cacheSettings = pgTable("cache_settings", {
  id: serial("id").primaryKey(),
  enabled: boolean("enabled").default(false),
  redisUrl: text("redis_url"),
  ttlSeconds: integer("ttl_seconds").default(3600),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================
// Worker Instances (Track all worker processes)
// ============================================================================

export const workerInstances = pgTable(
  "worker_instances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(), // Friendly name
    hostname: text("hostname").notNull(), // Machine hostname
    type: text("type").notNull(), // "local" or "remote"
    sshHostId: uuid("ssh_host_id").references(() => sshHosts.id, {
      onDelete: "cascade",
    }),
    status: text("status").notNull().default("starting"), // "starting", "running", "stopping", "stopped", "error"
    pid: integer("pid"), // Process ID
    version: text("version"), // Worker version
    lastHeartbeat: timestamp("last_heartbeat"),
    startedAt: timestamp("started_at").defaultNow(),
    stoppedAt: timestamp("stopped_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("worker_instances_status_idx").on(table.status),
    index("worker_instances_last_heartbeat_idx").on(table.lastHeartbeat),
  ]
);

// ============================================================================
// SSH Hosts (For remote worker management)
// ============================================================================

export const sshHosts = pgTable("ssh_hosts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  hostname: text("hostname").notNull(),
  port: integer("port").default(22),
  username: text("username").notNull(),
  authMethod: text("auth_method").notNull(), // "password" or "key"
  password: jsonb("password"), // Encrypted data {encrypted, iv, authTag}
  privateKey: jsonb("private_key"), // Encrypted data {encrypted, iv, authTag}
  passphrase: jsonb("passphrase"), // Encrypted data {encrypted, iv, authTag}
  workingDirectory: text("working_directory"), // Remote path to worker code
  enabled: boolean("enabled").default(true),
  lastConnectionAt: timestamp("last_connection_at"),
  connectionStatus: text("connection_status").default("disconnected"), // "connected", "disconnected", "error"
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ============================================================================
// Worker Statistics (Real-time metrics)
// ============================================================================

export const workerStatistics = pgTable(
  "worker_statistics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workerInstances.id, { onDelete: "cascade" }),
    cpuUsage: decimal("cpu_usage", { precision: 5, scale: 2 }), // Percentage
    memoryUsage: bigint("memory_usage", { mode: "number" }), // Bytes
    memoryUsagePercent: decimal("memory_usage_percent", {
      precision: 5,
      scale: 2,
    }),
    filesProcessed: integer("files_processed").default(0),
    filesSucceeded: integer("files_succeeded").default(0),
    filesFailed: integer("files_failed").default(0),
    filesSkipped: integer("files_skipped").default(0),
    currentJobId: uuid("current_job_id").references(() => workerJobs.id, {
      onDelete: "set null",
    }),
    currentJobProgress: integer("current_job_progress").default(0), // 0-100
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (table) => [
    index("worker_statistics_worker_id_idx").on(table.workerId),
    index("worker_statistics_timestamp_idx").on(table.timestamp),
  ]
);

// ============================================================================
// Worker Real-time Logs (Streamed logs for dashboard)
// ============================================================================

export const workerRealtimeLogs = pgTable(
  "worker_realtime_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workerInstances.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => workerJobs.id, {
      onDelete: "set null",
    }),
    level: text("level").notNull(), // "info", "warn", "error", "debug"
    message: text("message").notNull(),
    metadata: jsonb("metadata"), // Additional context
    timestamp: timestamp("timestamp").notNull().defaultNow(),
  },
  (table) => [
    index("worker_realtime_logs_worker_id_idx").on(table.workerId),
    index("worker_realtime_logs_job_id_idx").on(table.jobId),
    index("worker_realtime_logs_timestamp_idx").on(table.timestamp),
  ]
);

// ============================================================================
// Rename History (For undo functionality)
// ============================================================================

export const renameHistory = pgTable(
  "rename_history",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mediaFileId: uuid("media_file_id").references(() => mediaFiles.id, {
      onDelete: "cascade",
    }),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => mediaLibraries.id, { onDelete: "cascade" }),
    jobId: uuid("job_id").references(() => workerJobs.id, {
      onDelete: "set null",
    }),

    // Path tracking
    oldPath: text("old_path").notNull(),
    newPath: text("new_path").notNull(),
    oldFileName: text("old_file_name").notNull(),
    newFileName: text("new_file_name").notNull(),

    // Associated files that were moved (subtitles, metadata)
    associatedFiles: jsonb("associated_files"), // [{oldPath, newPath}]

    // Operation details
    operationType: text("operation_type").notNull(), // "rename", "move", "organize"
    status: text("status").notNull().default("active"), // "active", "undone"
    undoneAt: timestamp("undone_at"),
    undoneBy: text("undone_by").references(() => users.id, {
      onDelete: "set null",
    }),

    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("rename_history_media_file_id_idx").on(table.mediaFileId),
    index("rename_history_library_id_idx").on(table.libraryId),
    index("rename_history_status_idx").on(table.status),
    index("rename_history_created_at_idx").on(table.createdAt),
  ]
);

// ============================================================================
// Watch Events (For watch folder functionality)
// ============================================================================

export const watchEvents = pgTable(
  "watch_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => mediaLibraries.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(), // "add", "change", "unlink"
    filePath: text("file_path").notNull(),
    status: text("status").notNull().default("pending"), // "pending", "processed", "ignored"
    processedAt: timestamp("processed_at"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("watch_events_library_id_idx").on(table.libraryId),
    index("watch_events_status_idx").on(table.status),
    index("watch_events_created_at_idx").on(table.createdAt),
  ]
);

// ============================================================================
// Library Statistics (Cached aggregates for dashboard)
// ============================================================================

export const libraryStatistics = pgTable(
  "library_statistics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    libraryId: uuid("library_id")
      .notNull()
      .references(() => mediaLibraries.id, { onDelete: "cascade" }),

    // File counts by status
    totalFiles: integer("total_files").default(0),
    pendingFiles: integer("pending_files").default(0),
    readyFiles: integer("ready_files").default(0),
    renamedFiles: integer("renamed_files").default(0),
    errorFiles: integer("error_files").default(0),
    skippedFiles: integer("skipped_files").default(0),

    // Verification stats
    verifiedFiles: integer("verified_files").default(0),
    unverifiedFiles: integer("unverified_files").default(0),

    // Storage
    totalSizeBytes: bigint("total_size_bytes", { mode: "number" }).default(0),

    // Match quality
    avgMatchScore: decimal("avg_match_score", { precision: 5, scale: 4 }),
    highConfidenceMatches: integer("high_confidence_matches").default(0),
    lowConfidenceMatches: integer("low_confidence_matches").default(0),

    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("library_statistics_library_id_idx").on(table.libraryId),
  ]
);

// ============================================================================
// Activity Log (For activity feed)
// ============================================================================

export const activityLog = pgTable(
  "activity_log",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    libraryId: uuid("library_id").references(() => mediaLibraries.id, {
      onDelete: "cascade",
    }),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    activityType: text("activity_type").notNull(), // "scan", "rename", "metadata", "undo", "organize"
    description: text("description").notNull(),
    metadata: jsonb("metadata"), // Additional context
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("activity_log_library_id_idx").on(table.libraryId),
    index("activity_log_activity_type_idx").on(table.activityType),
    index("activity_log_created_at_idx").on(table.createdAt),
  ]
);

// ============================================================================
// Relations
// ============================================================================

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  libraries: many(mediaLibraries),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(users, {
    fields: [session.userId],
    references: [users.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(users, {
    fields: [account.userId],
    references: [users.id],
  }),
}));

export const mediaLibrariesRelations = relations(
  mediaLibraries,
  ({ one, many }) => ({
    user: one(users, {
      fields: [mediaLibraries.userId],
      references: [users.id],
    }),
    mediaFiles: many(mediaFiles),
    jobs: many(workerJobs),
    settings: one(librarySettings, {
      fields: [mediaLibraries.id],
      references: [librarySettings.libraryId],
    }),
  })
);

export const librarySettingsRelations = relations(
  librarySettings,
  ({ one }) => ({
    library: one(mediaLibraries, {
      fields: [librarySettings.libraryId],
      references: [mediaLibraries.id],
    }),
  })
);

export const mediaFilesRelations = relations(mediaFiles, ({ one, many }) => ({
  library: one(mediaLibraries, {
    fields: [mediaFiles.libraryId],
    references: [mediaLibraries.id],
  }),
  subtitles: many(subtitleFiles),
  jobLogs: many(workerJobLogs),
}));

export const subtitleFilesRelations = relations(subtitleFiles, ({ one }) => ({
  mediaFile: one(mediaFiles, {
    fields: [subtitleFiles.mediaFileId],
    references: [mediaFiles.id],
  }),
}));

export const workerJobsRelations = relations(workerJobs, ({ one, many }) => ({
  library: one(mediaLibraries, {
    fields: [workerJobs.libraryId],
    references: [mediaLibraries.id],
  }),
  logs: many(workerJobLogs),
}));

export const workerJobLogsRelations = relations(workerJobLogs, ({ one }) => ({
  job: one(workerJobs, {
    fields: [workerJobLogs.jobId],
    references: [workerJobs.id],
  }),
  mediaFile: one(mediaFiles, {
    fields: [workerJobLogs.mediaFileId],
    references: [mediaFiles.id],
  }),
}));

export const sshHostsRelations = relations(sshHosts, ({ many }) => ({
  workers: many(workerInstances),
}));

export const workerInstancesRelations = relations(
  workerInstances,
  ({ one, many }) => ({
    sshHost: one(sshHosts, {
      fields: [workerInstances.sshHostId],
      references: [sshHosts.id],
    }),
    statistics: many(workerStatistics),
    logs: many(workerRealtimeLogs),
  })
);

export const workerStatisticsRelations = relations(
  workerStatistics,
  ({ one }) => ({
    worker: one(workerInstances, {
      fields: [workerStatistics.workerId],
      references: [workerInstances.id],
    }),
    currentJob: one(workerJobs, {
      fields: [workerStatistics.currentJobId],
      references: [workerJobs.id],
    }),
  })
);

export const workerRealtimeLogsRelations = relations(
  workerRealtimeLogs,
  ({ one }) => ({
    worker: one(workerInstances, {
      fields: [workerRealtimeLogs.workerId],
      references: [workerInstances.id],
    }),
    job: one(workerJobs, {
      fields: [workerRealtimeLogs.jobId],
      references: [workerJobs.id],
    }),
  })
);

export const duplicateExclusionsRelations = relations(
  duplicateExclusions,
  ({ one }) => ({
    file1: one(mediaFiles, {
      fields: [duplicateExclusions.fileId1],
      references: [mediaFiles.id],
      relationName: "duplicateExclusionFile1",
    }),
    file2: one(mediaFiles, {
      fields: [duplicateExclusions.fileId2],
      references: [mediaFiles.id],
      relationName: "duplicateExclusionFile2",
    }),
    excluder: one(users, {
      fields: [duplicateExclusions.excludedBy],
      references: [users.id],
    }),
  })
);

export const renameHistoryRelations = relations(renameHistory, ({ one }) => ({
  mediaFile: one(mediaFiles, {
    fields: [renameHistory.mediaFileId],
    references: [mediaFiles.id],
  }),
  library: one(mediaLibraries, {
    fields: [renameHistory.libraryId],
    references: [mediaLibraries.id],
  }),
  job: one(workerJobs, {
    fields: [renameHistory.jobId],
    references: [workerJobs.id],
  }),
  undoer: one(users, {
    fields: [renameHistory.undoneBy],
    references: [users.id],
  }),
}));

export const watchEventsRelations = relations(watchEvents, ({ one }) => ({
  library: one(mediaLibraries, {
    fields: [watchEvents.libraryId],
    references: [mediaLibraries.id],
  }),
}));

export const libraryStatisticsRelations = relations(
  libraryStatistics,
  ({ one }) => ({
    library: one(mediaLibraries, {
      fields: [libraryStatistics.libraryId],
      references: [mediaLibraries.id],
    }),
  })
);

export const activityLogRelations = relations(activityLog, ({ one }) => ({
  library: one(mediaLibraries, {
    fields: [activityLog.libraryId],
    references: [mediaLibraries.id],
  }),
  user: one(users, {
    fields: [activityLog.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// Type Exports
// ============================================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof session.$inferSelect;
export type Account = typeof account.$inferSelect;

export type SeerrSettings = typeof seerrSettings.$inferSelect;
export type NewSeerrSettings = typeof seerrSettings.$inferInsert;

export type MediaLibrary = typeof mediaLibraries.$inferSelect;
export type NewMediaLibrary = typeof mediaLibraries.$inferInsert;

export type LibrarySettings = typeof librarySettings.$inferSelect;
export type NewLibrarySettings = typeof librarySettings.$inferInsert;

export type MediaFile = typeof mediaFiles.$inferSelect;
export type NewMediaFile = typeof mediaFiles.$inferInsert;

export type SubtitleFile = typeof subtitleFiles.$inferSelect;
export type NewSubtitleFile = typeof subtitleFiles.$inferInsert;

export type WorkerJob = typeof workerJobs.$inferSelect;
export type NewWorkerJob = typeof workerJobs.$inferInsert;

export type WorkerJobLog = typeof workerJobLogs.$inferSelect;
export type NewWorkerJobLog = typeof workerJobLogs.$inferInsert;

export type SystemConfig = typeof systemConfig.$inferSelect;
export type CacheSettings = typeof cacheSettings.$inferSelect;

export type WorkerInstance = typeof workerInstances.$inferSelect;
export type NewWorkerInstance = typeof workerInstances.$inferInsert;

export type SshHost = typeof sshHosts.$inferSelect;
export type NewSshHost = typeof sshHosts.$inferInsert;

export type WorkerStatistic = typeof workerStatistics.$inferSelect;
export type NewWorkerStatistic = typeof workerStatistics.$inferInsert;

export type WorkerRealtimeLog = typeof workerRealtimeLogs.$inferSelect;
export type NewWorkerRealtimeLog = typeof workerRealtimeLogs.$inferInsert;

export type DuplicateExclusion = typeof duplicateExclusions.$inferSelect;
export type NewDuplicateExclusion = typeof duplicateExclusions.$inferInsert;

export type RenameHistory = typeof renameHistory.$inferSelect;
export type NewRenameHistory = typeof renameHistory.$inferInsert;

export type WatchEvent = typeof watchEvents.$inferSelect;
export type NewWatchEvent = typeof watchEvents.$inferInsert;

export type LibraryStatistic = typeof libraryStatistics.$inferSelect;
export type NewLibraryStatistic = typeof libraryStatistics.$inferInsert;

export type ActivityLogEntry = typeof activityLog.$inferSelect;
export type NewActivityLogEntry = typeof activityLog.$inferInsert;

// Export users table with alias for compatibility
export { users as user };
