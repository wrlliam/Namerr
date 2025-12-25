/**
 * Worker Process Manager
 * Handles spawning and terminating worker processes
 */

import { spawn, ChildProcess } from "child_process";
import { Client, ClientChannel } from "ssh2";
import { db } from "./db";
import { workerInstances, sshHosts } from "./db/schema";
import { eq } from "drizzle-orm";
import { decrypt, type EncryptedData } from "./crypto";
import path from "path";

export interface WorkerSpawnOptions {
  workerId: string;
  name: string;
  type: "local" | "remote";
  sshHostId?: string;
}

export interface WorkerSpawnResult {
  success: boolean;
  pid?: number;
  error?: string;
}

/**
 * Spawn a local worker process
 */
export async function spawnLocalWorker(
  workerId: string,
  name: string
): Promise<WorkerSpawnResult> {
  try {
    // Path to worker executable
    const workerPath = path.join(process.cwd(), "worker", "dist", "index.js");

    // Check if worker file exists
    const fs = await import("fs/promises");
    try {
      await fs.access(workerPath);
    } catch {
      // Try alternative path (dev mode)
      const devPath = path.join(process.cwd(), "worker", "src", "index.ts");
      try {
        await fs.access(devPath);
        // Use bun to run TypeScript directly in dev
        return spawnWorkerProcess(workerId, name, "bun", [devPath]);
      } catch {
        return {
          success: false,
          error: "Worker executable not found. Run 'bun run worker:build' or use 'bun run worker:dev' manually.",
        };
      }
    }

    // Spawn worker process
    return spawnWorkerProcess(workerId, name, "node", [workerPath]);
  } catch (error) {
    console.error("Error spawning local worker:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to spawn worker",
    };
  }
}

/**
 * Spawn worker process and track it
 */
function spawnWorkerProcess(
  workerId: string,
  name: string,
  command: string,
  args: string[]
): WorkerSpawnResult {
  try {
    // Set environment variables for worker
    const env = {
      ...process.env,
      WORKER_ID: workerId,
      WORKER_NAME: name,
    };

    // Spawn process
    const workerProcess = spawn(command, args, {
      env,
      detached: false, // Keep as child process
      stdio: "pipe", // Capture stdout/stderr
    });

    // Store process reference (in production, use Redis or similar)
    workerProcesses.set(workerId, workerProcess);

    // Handle process output
    workerProcess.stdout?.on("data", (data) => {
      console.log(`[Worker ${workerId}]`, data.toString().trim());
    });

    workerProcess.stderr?.on("data", (data) => {
      console.error(`[Worker ${workerId} ERROR]`, data.toString().trim());
    });

    // Handle process exit
    workerProcess.on("exit", async (code, signal) => {
      console.log(`Worker ${workerId} exited with code ${code}, signal ${signal}`);

      // Update database status
      try {
        await db
          .update(workerInstances)
          .set({
            status: code === 0 ? "stopped" : "error",
          })
          .where(eq(workerInstances.id, workerId));
      } catch (error) {
        console.error(`Failed to update worker ${workerId} status:`, error);
      }

      // Remove from tracking
      workerProcesses.delete(workerId);
    });

    // Handle process errors
    workerProcess.on("error", async (error) => {
      console.error(`Worker ${workerId} error:`, error);

      // Update database
      try {
        await db
          .update(workerInstances)
          .set({
            status: "error",
          })
          .where(eq(workerInstances.id, workerId));
      } catch (dbError) {
        console.error(`Failed to update worker ${workerId} status:`, dbError);
      }
    });

    return {
      success: true,
      pid: workerProcess.pid,
    };
  } catch (error) {
    console.error("Error in spawnWorkerProcess:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to spawn process",
    };
  }
}

/**
 * Terminate a worker process
 */
export async function terminateWorker(
  workerId: string,
  pid: number | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if we're tracking this process
    const workerProcess = workerProcesses.get(workerId);

    if (workerProcess) {
      // Graceful shutdown - send SIGTERM
      console.log(`Sending SIGTERM to worker ${workerId} (PID: ${workerProcess.pid})`);
      workerProcess.kill("SIGTERM");

      // Wait for graceful shutdown (10 seconds)
      const shutdownTimeout = setTimeout(() => {
        if (workerProcesses.has(workerId)) {
          console.log(`Worker ${workerId} did not shut down gracefully, sending SIGKILL`);
          workerProcess.kill("SIGKILL");
        }
      }, 10000);

      // Clean up timeout when process exits
      workerProcess.once("exit", () => {
        clearTimeout(shutdownTimeout);
      });

      return { success: true };
    } else if (pid) {
      // Process not tracked, try to kill by PID
      try {
        process.kill(pid, "SIGTERM");
        console.log(`Sent SIGTERM to PID ${pid}`);

        // Force kill after timeout
        setTimeout(() => {
          try {
            process.kill(pid, 0); // Check if still running
            console.log(`PID ${pid} still running, sending SIGKILL`);
            process.kill(pid, "SIGKILL");
          } catch {
            // Process already dead
          }
        }, 10000);

        return { success: true };
      } catch (error) {
        return {
          success: false,
          error: `Process not found (PID: ${pid})`,
        };
      }
    } else {
      return {
        success: false,
        error: "Worker process not found and no PID available",
      };
    }
  } catch (error) {
    console.error("Error terminating worker:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to terminate worker",
    };
  }
}

/**
 * In-memory tracking of worker processes
 * In production, this should be stored in Redis or similar
 */
const workerProcesses = new Map<string, ChildProcess>();

/**
 * Get all tracked worker processes
 */
export function getTrackedWorkers(): Map<string, ChildProcess> {
  return workerProcesses;
}

/**
 * Check if a worker is being tracked
 */
export function isWorkerTracked(workerId: string): boolean {
  return workerProcesses.has(workerId);
}

/**
 * Spawn a remote worker via SSH
 */
export async function spawnRemoteWorker(
  workerId: string,
  name: string,
  sshHostId: string
): Promise<WorkerSpawnResult> {
  try {
    // Get SSH host configuration
    const [sshHost] = await db
      .select()
      .from(sshHosts)
      .where(eq(sshHosts.id, sshHostId))
      .limit(1);

    if (!sshHost) {
      return {
        success: false,
        error: "SSH host not found",
      };
    }

    if (!sshHost.enabled) {
      return {
        success: false,
        error: "SSH host is disabled",
      };
    }

    // Decrypt credentials
    const password = sshHost.password ? decrypt(sshHost.password as any) : null;
    const privateKey = sshHost.privateKey ? decrypt(sshHost.privateKey as any) : null;
    const passphrase = sshHost.passphrase ? decrypt(sshHost.passphrase as any) : null;

    if (!password && !privateKey) {
      return {
        success: false,
        error: "No valid credentials found for SSH host",
      };
    }

    // Create SSH connection
    const conn = new Client();

    return new Promise((resolve) => {
      let resolved = false;

      conn.on("ready", () => {
        console.log(`SSH connection established to ${sshHost.hostname}`);

        // Determine worker command
        const workingDir = sshHost.workingDirectory || "~/namerr/worker";
        const command = `cd ${workingDir} && WORKER_ID=${workerId} WORKER_NAME="${name}" bun run src/index.ts`;

        // Execute worker command
        conn.exec(command, (err, stream: ClientChannel) => {
          if (err) {
            conn.end();
            if (!resolved) {
              resolved = true;
              resolve({
                success: false,
                error: `Failed to execute remote command: ${err.message}`,
              });
            }
            return;
          }

          // Track SSH connection
          sshConnections.set(workerId, conn);

          // Handle stream output
          stream.on("data", (data: Buffer) => {
            console.log(`[Remote Worker ${workerId}]`, data.toString().trim());
          });

          stream.stderr.on("data", (data: Buffer) => {
            console.error(`[Remote Worker ${workerId} ERROR]`, data.toString().trim());
          });

          stream.on("close", async (code: number) => {
            console.log(`Remote worker ${workerId} exited with code ${code}`);

            // Update database
            try {
              await db
                .update(workerInstances)
                .set({
                  status: code === 0 ? "stopped" : "error",
                })
                .where(eq(workerInstances.id, workerId));
            } catch (error) {
              console.error(`Failed to update worker ${workerId} status:`, error);
            }

            // Clean up
            conn.end();
            sshConnections.delete(workerId);
          });

          if (!resolved) {
            resolved = true;
            resolve({
              success: true,
              pid: undefined, // Remote PID not easily accessible
            });
          }
        });
      });

      conn.on("error", (err) => {
        console.error("SSH connection error:", err);
        if (!resolved) {
          resolved = true;
          resolve({
            success: false,
            error: `SSH connection failed: ${err.message}`,
          });
        }
      });

      // Connect
      const sshConfig: any = {
        host: sshHost.hostname,
        port: sshHost.port || 22,
        username: sshHost.username,
      };

      if (privateKey) {
        sshConfig.privateKey = privateKey;
        if (passphrase) {
          sshConfig.passphrase = passphrase;
        }
      } else if (password) {
        sshConfig.password = password;
      }

      conn.connect(sshConfig);

      // Timeout after 30 seconds
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          conn.end();
          resolve({
            success: false,
            error: "SSH connection timeout (30 seconds)",
          });
        }
      }, 30000);
    });
  } catch (error) {
    console.error("Error spawning remote worker:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to spawn remote worker",
    };
  }
}

/**
 * Terminate a remote worker via SSH
 */
export async function terminateRemoteWorker(
  workerId: string,
  sshHostId: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    // Check if we have an active SSH connection
    const conn = sshConnections.get(workerId);

    if (conn) {
      // Close the SSH connection (will terminate the remote process)
      conn.end();
      sshConnections.delete(workerId);
      console.log(`Terminated remote worker ${workerId} by closing SSH connection`);
      return { success: true };
    }

    // If no active connection and we have SSH host ID, try to connect and kill
    if (sshHostId) {
      const [sshHost] = await db
        .select()
        .from(sshHosts)
        .where(eq(sshHosts.id, sshHostId))
        .limit(1);

      if (!sshHost) {
        return {
          success: false,
          error: "SSH host not found",
        };
      }

      // Decrypt credentials
      const password = sshHost.password ? decrypt(sshHost.password as any) : null;
      const privateKey = sshHost.privateKey ? decrypt(sshHost.privateKey as any) : null;
      const passphrase = sshHost.passphrase ? decrypt(sshHost.passphrase as any) : null;

      // Connect and try to kill the process
      const client = new Client();

      return new Promise((resolve) => {
        client.on("ready", () => {
          // Try to kill processes by WORKER_ID environment variable
          const killCommand = `pkill -f "WORKER_ID=${workerId}"`;

          client.exec(killCommand, (err) => {
            client.end();

            if (err) {
              resolve({
                success: false,
                error: `Failed to kill remote process: ${err.message}`,
              });
            } else {
              console.log(`Killed remote worker ${workerId}`);
              resolve({ success: true });
            }
          });
        });

        client.on("error", (err) => {
          resolve({
            success: false,
            error: `SSH connection failed: ${err.message}`,
          });
        });

        const sshConfig: any = {
          host: sshHost.hostname,
          port: sshHost.port || 22,
          username: sshHost.username,
        };

        if (privateKey) {
          sshConfig.privateKey = privateKey;
          if (passphrase) {
            sshConfig.passphrase = passphrase;
          }
        } else if (password) {
          sshConfig.password = password;
        }

        client.connect(sshConfig);

        setTimeout(() => {
          client.end();
          resolve({
            success: false,
            error: "SSH connection timeout",
          });
        }, 10000);
      });
    }

    return {
      success: false,
      error: "No active SSH connection and no SSH host ID provided",
    };
  } catch (error) {
    console.error("Error terminating remote worker:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to terminate remote worker",
    };
  }
}

/**
 * In-memory tracking of SSH connections
 */
const sshConnections = new Map<string, Client>();
