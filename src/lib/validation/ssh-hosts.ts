/**
 * Validation schemas for SSH host management
 */

import { z } from "zod";

/**
 * SSH private key validation regex
 * Matches common SSH key formats (RSA, ED25519, ECDSA, DSA)
 */
const SSH_KEY_REGEX = /^-----BEGIN [A-Z0-9 ]+-----[\s\S]+-----END [A-Z0-9 ]+-----\s*$/;

/**
 * Hostname validation - allows domains and IP addresses
 * Examples: example.com, 192.168.1.1, server-01.local
 */
const HOSTNAME_REGEX = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$|^(\d{1,3}\.){3}\d{1,3}$/;

/**
 * Username validation - alphanumeric, underscore, hyphen
 * Examples: user, john_doe, server-admin, user123
 */
const USERNAME_REGEX = /^[a-zA-Z0-9_-]+$/;

/**
 * Schema for creating a new SSH host
 */
export const createSshHostSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or less")
      .trim(),

    hostname: z
      .string()
      .min(1, "Hostname is required")
      .max(255, "Hostname must be 255 characters or less")
      .regex(HOSTNAME_REGEX, "Invalid hostname format")
      .trim(),

    port: z
      .number()
      .int("Port must be an integer")
      .min(1, "Port must be between 1 and 65535")
      .max(65535, "Port must be between 1 and 65535")
      .default(22),

    username: z
      .string()
      .min(1, "Username is required")
      .max(32, "Username must be 32 characters or less")
      .regex(USERNAME_REGEX, "Username can only contain letters, numbers, underscores, and hyphens")
      .trim(),

    authMethod: z.enum(["password", "key"]),

    password: z
      .string()
      .max(256, "Password must be 256 characters or less")
      .optional()
      .nullable(),

    privateKey: z
      .string()
      .max(10000, "Private key is too large (max 10000 characters)")
      .regex(SSH_KEY_REGEX, "Invalid SSH private key format")
      .optional()
      .nullable(),

    passphrase: z
      .string()
      .max(256, "Passphrase must be 256 characters or less")
      .optional()
      .nullable(),

    workingDirectory: z
      .string()
      .max(500, "Working directory path is too long")
      .optional()
      .nullable(),

    enabled: z.boolean().default(true),
  })
  .superRefine((data, ctx) => {
    // Validate auth method requirements
    if (data.authMethod === "password") {
      if (!data.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Password is required when using password authentication",
          path: ["password"],
        });
      }
      if (data.privateKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Private key should not be provided when using password authentication",
          path: ["privateKey"],
        });
      }
    } else if (data.authMethod === "key") {
      if (!data.privateKey) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Private key is required when using key authentication",
          path: ["privateKey"],
        });
      }
      if (data.password) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Password should not be provided when using key authentication",
          path: ["password"],
        });
      }
    }
  });

/**
 * Schema for updating an existing SSH host
 * All fields are optional except those being updated
 */
export const updateSshHostSchema = z
  .object({
    name: z
      .string()
      .min(1, "Name is required")
      .max(100, "Name must be 100 characters or less")
      .trim()
      .optional(),

    hostname: z
      .string()
      .min(1, "Hostname is required")
      .max(255, "Hostname must be 255 characters or less")
      .regex(HOSTNAME_REGEX, "Invalid hostname format")
      .trim()
      .optional(),

    port: z
      .number()
      .int("Port must be an integer")
      .min(1, "Port must be between 1 and 65535")
      .max(65535, "Port must be between 1 and 65535")
      .optional(),

    username: z
      .string()
      .min(1, "Username is required")
      .max(32, "Username must be 32 characters or less")
      .regex(USERNAME_REGEX, "Username can only contain letters, numbers, underscores, and hyphens")
      .trim()
      .optional(),

    authMethod: z.enum(["password", "key"]).optional(),

    password: z
      .string()
      .max(256, "Password must be 256 characters or less")
      .optional()
      .nullable(),

    privateKey: z
      .string()
      .max(10000, "Private key is too large (max 10000 characters)")
      .regex(SSH_KEY_REGEX, "Invalid SSH private key format")
      .optional()
      .nullable(),

    passphrase: z
      .string()
      .max(256, "Passphrase must be 256 characters or less")
      .optional()
      .nullable(),

    workingDirectory: z
      .string()
      .max(500, "Working directory path is too long")
      .optional()
      .nullable(),

    enabled: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    // Only validate if authMethod is being updated
    if (data.authMethod === "password" && data.password === undefined) {
      // Allow update without password if not changing it
      return;
    }
    if (data.authMethod === "key" && data.privateKey === undefined) {
      // Allow update without key if not changing it
      return;
    }
  });

/**
 * Schema for testing SSH connection
 */
export const testSshConnectionSchema = z
  .object({
    hostname: z
      .string()
      .min(1, "Hostname is required")
      .max(255, "Hostname must be 255 characters or less")
      .regex(HOSTNAME_REGEX, "Invalid hostname format")
      .trim(),

    port: z
      .number()
      .int("Port must be an integer")
      .min(1, "Port must be between 1 and 65535")
      .max(65535, "Port must be between 1 and 65535")
      .default(22),

    username: z
      .string()
      .min(1, "Username is required")
      .max(32, "Username must be 32 characters or less")
      .regex(USERNAME_REGEX, "Username can only contain letters, numbers, underscores, and hyphens")
      .trim(),

    authMethod: z.enum(["password", "key"]),

    password: z.string().optional().nullable(),

    privateKey: z
      .string()
      .regex(SSH_KEY_REGEX, "Invalid SSH private key format")
      .optional()
      .nullable(),

    passphrase: z.string().optional().nullable(),

    timeout: z.number().int().min(1000).max(30000).default(10000).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.authMethod === "password" && !data.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password is required for password authentication",
        path: ["password"],
      });
    }
    if (data.authMethod === "key" && !data.privateKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Private key is required for key authentication",
        path: ["privateKey"],
      });
    }
  });

/**
 * Type exports for TypeScript
 */
export type CreateSshHostInput = z.infer<typeof createSshHostSchema>;
export type UpdateSshHostInput = z.infer<typeof updateSshHostSchema>;
export type TestSshConnectionInput = z.infer<typeof testSshConnectionSchema>;
