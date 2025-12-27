/**
 * Bulk metadata refresh API
 * Refresh metadata from Seerr for multiple media files
 * Supports streaming progress updates via NDJSON
 */

import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/src/lib/auth";
import { db } from "@/src/lib/db";
import { mediaFiles, seerrSettings } from "@/src/lib/db/schema";
import { eq, inArray } from "drizzle-orm";
import { SeerrClient } from "@/src/lib/seerr-client";
import {
  saveMetadataFile,
  downloadMediaImages,
  createMovieMetadata,
  createTVMetadata,
  deleteMetadataFiles,
} from "@/src/lib/metadata-file";
import { seerrCache } from "@/src/lib/cache";

export async function POST(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { mediaIds, libraryId, stream, hard } = body as {
      mediaIds?: string[];
      libraryId?: string;
      stream?: boolean;
      hard?: boolean;
    };

    // If hard refresh requested, clear relevant Seerr cache
    if (hard) {
      try {
        await seerrCache.clear("search*");
        await seerrCache.del("user_requests:all");
        console.log(
          "[Seerr] Hard refresh requested - cleared search and user requests cache"
        );
      } catch (e) {
        console.warn("[Seerr] Failed to clear cache for hard refresh:", e);
      }
    }

    // Get Seerr settings
    const [settings] = await db
      .select()
      .from(seerrSettings)
      .orderBy(seerrSettings.id)
      .limit(1);

    if (!settings || !settings.apiUrl || !settings.apiKey) {
      return NextResponse.json(
        { error: "Seerr is not configured" },
        { status: 400 }
      );
    }

    if (settings.connectionStatus !== "connected") {
      return NextResponse.json(
        {
          error: "Seerr is not connected. Please test connection in settings.",
        },
        { status: 400 }
      );
    }

    // Get media files to refresh
    let mediaFilesToRefresh;

    if (mediaIds && mediaIds.length > 0) {
      // Refresh specific media files
      mediaFilesToRefresh = await db
        .select()
        .from(mediaFiles)
        .where(inArray(mediaFiles.id, mediaIds));
    } else if (libraryId) {
      // Refresh all files in a library
      mediaFilesToRefresh = await db
        .select()
        .from(mediaFiles)
        .where(eq(mediaFiles.libraryId, libraryId));
    } else {
      return NextResponse.json(
        { error: "Either mediaIds or libraryId must be provided" },
        { status: 400 }
      );
    }

    if (mediaFilesToRefresh.length === 0) {
      return NextResponse.json({
        success: true,
        processed: 0,
        updated: 0,
        failed: 0,
      });
    }

    // Create Seerr client
    const client = new SeerrClient(settings.apiKey, settings.apiUrl);

    // If streaming is requested, use streaming response
    if (stream) {
      return createStreamingResponse(
        mediaFilesToRefresh,
        client,
        Boolean(hard)
      );
    }

    // Otherwise, use standard batch processing
    return await processBatch(mediaFilesToRefresh, client, Boolean(hard));
  } catch (error) {
    console.error("Error refreshing metadata:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to refresh metadata",
      },
      { status: 500 }
    );
  }
}

/**
 * Create a streaming response with progress updates
 */
function createStreamingResponse(
  mediaFilesToRefresh: any[],
  client: SeerrClient,
  hard = false
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const BATCH_SIZE = 10;
      const totalFiles = mediaFilesToRefresh.length;
      let updated = 0;
      let failed = 0;
      let processed = 0;

      try {
        for (let i = 0; i < mediaFilesToRefresh.length; i += BATCH_SIZE) {
          const batch = mediaFilesToRefresh.slice(i, i + BATCH_SIZE);

          const batchResults = await Promise.allSettled(
            batch.map(async (mediaFile) => {
              // Determine if movie or TV
              const isTV = Boolean(
                mediaFile.parsedSeason && mediaFile.parsedEpisode
              );

              // Derive a search title from the file/folder name (do NOT use stored metadata)
              const pathModule = await import("path");
              const { PatternCleaner } = await import(
                "@/src/lib/pattern-cleaner"
              );
              const fileBase =
                mediaFile.fileName || pathModule.basename(mediaFile.filePath);
              const folderName = pathModule.basename(
                pathModule.dirname(mediaFile.filePath)
              );
              const rawSearchTitle =
                isTV && folderName
                  ? folderName
                  : fileBase.replace(pathModule.extname(fileBase), "");
              const cleaner = new PatternCleaner();
              const searchTitle = cleaner.clean(rawSearchTitle);

              console.log(
                `[Metadata] Using search title="${searchTitle}" (from file/folder) for ${mediaFile.filePath}`
              );

              if (isTV) {
                // TV show
                const result = await client.verifyTV(
                  searchTitle || mediaFile.parsedTitle || "",
                  0.8,
                  hard,
                  mediaFile.fileName
                );

                if (result.verified && result.data) {
                  // Log what we found for debugging
                  console.log(
                    `[Metadata] Found metadata for ${
                      mediaFile.filePath
                    } -> source=${(result.data as any).source} title=${
                      (result.data as any).name ||
                      (result.data as any).title ||
                      "?"
                    } tmdbId=${(result.data as any).id || "?"} score=${
                      (result.data as any).match_score ?? "?"
                    }`
                  );

                  // Fetch full details for rich metadata
                  const fullDetails = await client.getTVDetails(
                    result.data.id,
                    hard
                  );
                  const detailsData = fullDetails || result.data;

                  // If hard refresh, delete any existing metadata files so we overwrite cleanly
                  if (hard) {
                    try {
                      await deleteMetadataFiles(mediaFile.filePath);
                    } catch (e) {
                      console.warn(
                        `[Metadata] Failed to delete existing metadata for ${mediaFile.filePath}:`,
                        e
                      );
                    }
                  }

                  await db
                    .update(mediaFiles)
                    .set({
                      seerrVerified: true,
                      seerrTitle: result.data.name,
                      seerrYear: result.data.first_air_date?.substring(0, 4),
                      seerrTmdbId: result.data.id,
                      seerrOverview: result.data.overview,
                      seerrPosterPath:
                        detailsData.posterPath ||
                        detailsData.poster_path ||
                        result.data.poster_path,
                      seerrBackdropPath:
                        detailsData.backdropPath ||
                        detailsData.backdrop_path ||
                        result.data.backdrop_path,
                      seerrVoteAverage: result.data.vote_average?.toString(),
                      seerrMatchScore: result.data.match_score?.toString(),
                      updatedAt: new Date(),
                    })
                    .where(eq(mediaFiles.id, mediaFile.id));

                  // Save metadata file alongside the media file
                  try {
                    const metadata = createTVMetadata(
                      detailsData,
                      mediaFile.parsedSeason,
                      mediaFile.parsedEpisode,
                      result.data.match_score
                    );
                    await saveMetadataFile(mediaFile.filePath, metadata);

                    // Download images
                    const posterPath =
                      detailsData.posterPath ||
                      detailsData.poster_path ||
                      result.data.poster_path;
                    const backdropPath =
                      detailsData.backdropPath ||
                      detailsData.backdrop_path ||
                      result.data.backdrop_path;
                    const images = await downloadMediaImages(
                      mediaFile.filePath,
                      posterPath,
                      backdropPath
                    );
                    if (images.poster) {
                      metadata.posterPath = images.poster;
                    }
                    if (images.backdrop) {
                      metadata.backdropPath = images.backdrop;
                    }
                    // Update metadata with local image paths
                    if (images.poster || images.backdrop) {
                      await saveMetadataFile(mediaFile.filePath, metadata);
                    }
                  } catch (metadataError) {
                    console.error(
                      `[Metadata] Failed to save metadata for ${mediaFile.filePath}:`,
                      metadataError
                    );
                  }

                  return { success: true, id: mediaFile.id };
                } else {
                  return {
                    success: false,
                    id: mediaFile.id,
                    error: "Not verified",
                  };
                }
              } else {
                // Movie
                const result = await client.verifyMovie(
                  searchTitle || mediaFile.parsedTitle || "",
                  mediaFile.parsedYear || undefined,
                  0.8,
                  hard,
                  mediaFile.fileName
                );

                if (result.verified && result.data) {
                  // Log what we found for debugging
                  console.log(
                    `[Metadata] Found metadata for ${
                      mediaFile.filePath
                    } -> source=${(result.data as any).source} title=${
                      (result.data as any).title ||
                      (result.data as any).name ||
                      "?"
                    } tmdbId=${(result.data as any).id || "?"} score=${
                      (result.data as any).match_score ?? "?"
                    }`
                  );

                  // Fetch full details for rich metadata
                  const fullDetails = await client.getMovieDetails(
                    result.data.id,
                    hard
                  );
                  const detailsData = fullDetails || result.data;

                  if (hard) {
                    try {
                      await deleteMetadataFiles(mediaFile.filePath);
                    } catch (e) {
                      console.warn(
                        `[Metadata] Failed to delete existing metadata for ${mediaFile.filePath}:`,
                        e
                      );
                    }
                  }

                  await db
                    .update(mediaFiles)
                    .set({
                      seerrVerified: true,
                      seerrTitle: result.data.title,
                      seerrYear: result.data.release_date?.substring(0, 4),
                      seerrTmdbId: result.data.id,
                      seerrOverview: result.data.overview,
                      seerrPosterPath:
                        detailsData.posterPath ||
                        detailsData.poster_path ||
                        result.data.poster_path,
                      seerrBackdropPath:
                        detailsData.backdropPath ||
                        detailsData.backdrop_path ||
                        result.data.backdrop_path,
                      seerrVoteAverage: result.data.vote_average?.toString(),
                      seerrMatchScore: result.data.match_score?.toString(),
                      updatedAt: new Date(),
                    })
                    .where(eq(mediaFiles.id, mediaFile.id));

                  // Save metadata file alongside the media file
                  try {
                    const metadata = createMovieMetadata(
                      detailsData,
                      result.data.match_score
                    );
                    await saveMetadataFile(mediaFile.filePath, metadata);

                    // Download images
                    const posterPath =
                      detailsData.posterPath ||
                      detailsData.poster_path ||
                      result.data.poster_path;
                    const backdropPath =
                      detailsData.backdropPath ||
                      detailsData.backdrop_path ||
                      result.data.backdrop_path;
                    const images = await downloadMediaImages(
                      mediaFile.filePath,
                      posterPath,
                      backdropPath
                    );
                    if (images.poster) {
                      metadata.posterPath = images.poster;
                    }
                    if (images.backdrop) {
                      metadata.backdropPath = images.backdrop;
                    }
                    // Update metadata with local image paths
                    if (images.poster || images.backdrop) {
                      await saveMetadataFile(mediaFile.filePath, metadata);
                    }
                  } catch (metadataError) {
                    console.error(
                      `[Metadata] Failed to save metadata for ${mediaFile.filePath}:`,
                      metadataError
                    );
                  }

                  return { success: true, id: mediaFile.id };
                } else {
                  return {
                    success: false,
                    id: mediaFile.id,
                    error: "Not verified",
                  };
                }
              }
            })
          );

          // Count successes and failures for this batch
          for (const result of batchResults) {
            if (result.status === "fulfilled" && result.value.success) {
              updated++;
            } else {
              failed++;
            }
            processed++;
          }

          // Send progress update
          const progressUpdate =
            JSON.stringify({
              type: "progress",
              processed,
              total: totalFiles,
              updated,
              failed,
            }) + "\n";

          controller.enqueue(encoder.encode(progressUpdate));
        }

        // Send completion message
        const completeMessage =
          JSON.stringify({
            type: "complete",
            processed: totalFiles,
            updated,
            failed,
          }) + "\n";

        controller.enqueue(encoder.encode(completeMessage));
        controller.close();
      } catch (error) {
        console.error("Error in streaming refresh:", error);
        const errorMessage =
          JSON.stringify({
            type: "error",
            error: error instanceof Error ? error.message : "Unknown error",
          }) + "\n";
        controller.enqueue(encoder.encode(errorMessage));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

/**
 * Standard batch processing (non-streaming)
 */
async function processBatch(
  mediaFilesToRefresh: any[],
  client: SeerrClient,
  hard = false
) {
  const BATCH_SIZE = 10;
  const results = [];

  for (let i = 0; i < mediaFilesToRefresh.length; i += BATCH_SIZE) {
    const batch = mediaFilesToRefresh.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.allSettled(
      batch.map(async (mediaFile) => {
        // Determine if movie or TV
        const isTV = Boolean(mediaFile.parsedSeason && mediaFile.parsedEpisode);

        if (isTV) {
          // TV show
          const result = await client.verifyTV(
            mediaFile.parsedTitle || "",
            0.8,
            hard
          );

          if (result.verified && result.data) {
            // Log what we found
            console.log(
              `[Metadata] Found metadata for ${mediaFile.filePath} -> source=${
                result.data.source
              } title=${result.data.name || "?"} tmdbId=${
                result.data.id || "?"
              } score=${result.data.match_score ?? "?"}`
            );

            // Fetch full details for rich metadata
            const fullDetails = await client.getTVDetails(result.data.id, hard);
            const detailsData = fullDetails || result.data;

            // If hard refresh, delete any existing metadata files so we overwrite cleanly
            if (hard) {
              try {
                await deleteMetadataFiles(mediaFile.filePath);
              } catch (e) {
                console.warn(
                  `[Metadata] Failed to delete existing metadata for ${mediaFile.filePath}:`,
                  e
                );
              }
            }

            await db
              .update(mediaFiles)
              .set({
                seerrVerified: true,
                seerrTitle: result.data.name,
                seerrYear: result.data.first_air_date?.substring(0, 4),
                seerrTmdbId: result.data.id,
                seerrOverview: result.data.overview,
                seerrPosterPath:
                  detailsData.posterPath ||
                  detailsData.poster_path ||
                  result.data.poster_path,
                seerrBackdropPath:
                  detailsData.backdropPath ||
                  detailsData.backdrop_path ||
                  result.data.backdrop_path,
                seerrVoteAverage: result.data.vote_average?.toString(),
                seerrMatchScore: result.data.match_score?.toString(),
                updatedAt: new Date(),
              })
              .where(eq(mediaFiles.id, mediaFile.id));

            // Save metadata file alongside the media file
            try {
              const metadata = createTVMetadata(
                detailsData,
                mediaFile.parsedSeason,
                mediaFile.parsedEpisode,
                result.data.match_score
              );
              await saveMetadataFile(mediaFile.filePath, metadata);

              // Download images
              const posterPath =
                detailsData.posterPath ||
                detailsData.poster_path ||
                result.data.poster_path;
              const backdropPath =
                detailsData.backdropPath ||
                detailsData.backdrop_path ||
                result.data.backdrop_path;
              const images = await downloadMediaImages(
                mediaFile.filePath,
                posterPath,
                backdropPath
              );
              if (images.poster) {
                metadata.posterPath = images.poster;
              }
              if (images.backdrop) {
                metadata.backdropPath = images.backdrop;
              }
              // Update metadata with local image paths
              if (images.poster || images.backdrop) {
                await saveMetadataFile(mediaFile.filePath, metadata);
              }
            } catch (metadataError) {
              console.error(
                `[Metadata] Failed to save metadata for ${mediaFile.filePath}:`,
                metadataError
              );
            }

            return { success: true, id: mediaFile.id };
          } else {
            return { success: false, id: mediaFile.id, error: "Not verified" };
          }
        } else {
          // Movie
          const result = await client.verifyMovie(
            mediaFile.parsedTitle || "",
            mediaFile.parsedYear || undefined,
            0.8,
            hard
          );

          if (result.verified && result.data) {
            // Log what we found
            console.log(
              `[Metadata] Found metadata for ${mediaFile.filePath} -> source=${
                (result.data as any).source
              } title=${
                (result.data as any).title || (result.data as any).name || "?"
              } tmdbId=${(result.data as any).id || "?"} score=${
                (result.data as any).match_score ?? "?"
              }`
            );

            // Fetch full details for rich metadata
            const fullDetails = await client.getMovieDetails(
              result.data.id,
              hard
            );
            const detailsData = fullDetails || result.data;

            if (hard) {
              try {
                await deleteMetadataFiles(mediaFile.filePath);
              } catch (e) {
                console.warn(
                  `[Metadata] Failed to delete existing metadata for ${mediaFile.filePath}:`,
                  e
                );
              }
            }

            await db
              .update(mediaFiles)
              .set({
                seerrVerified: true,
                seerrTitle: result.data.title,
                seerrYear: result.data.release_date?.substring(0, 4),
                seerrTmdbId: result.data.id,
                seerrOverview: result.data.overview,
                seerrPosterPath:
                  detailsData.posterPath ||
                  detailsData.poster_path ||
                  result.data.poster_path,
                seerrBackdropPath:
                  detailsData.backdropPath ||
                  detailsData.backdrop_path ||
                  result.data.backdrop_path,
                seerrVoteAverage: result.data.vote_average?.toString(),
                seerrMatchScore: result.data.match_score?.toString(),
                updatedAt: new Date(),
              })
              .where(eq(mediaFiles.id, mediaFile.id));

            // Save metadata file alongside the media file
            try {
              const metadata = createMovieMetadata(
                detailsData,
                result.data.match_score
              );
              await saveMetadataFile(mediaFile.filePath, metadata);

              // Download images
              const posterPath =
                detailsData.posterPath ||
                detailsData.poster_path ||
                result.data.poster_path;
              const backdropPath =
                detailsData.backdropPath ||
                detailsData.backdrop_path ||
                result.data.backdrop_path;
              const images = await downloadMediaImages(
                mediaFile.filePath,
                posterPath,
                backdropPath
              );
              if (images.poster) {
                metadata.posterPath = images.poster;
              }
              if (images.backdrop) {
                metadata.backdropPath = images.backdrop;
              }
              // Update metadata with local image paths
              if (images.poster || images.backdrop) {
                await saveMetadataFile(mediaFile.filePath, metadata);
              }
            } catch (metadataError) {
              console.error(
                `[Metadata] Failed to save metadata for ${mediaFile.filePath}:`,
                metadataError
              );
            }

            return { success: true, id: mediaFile.id };
          } else {
            return { success: false, id: mediaFile.id, error: "Not verified" };
          }
        }
      })
    );

    results.push(...batchResults);
  }

  // Count successes and failures
  let updated = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === "fulfilled" && result.value.success) {
      updated++;
    } else {
      failed++;
      if (result.status === "rejected") {
        console.error(`Error refreshing metadata:`, result.reason);
      } else if (result.status === "fulfilled") {
        console.error(`Failed to verify:`, result.value.error);
      }
    }
  }

  return NextResponse.json({
    success: true,
    processed: mediaFilesToRefresh.length,
    updated,
    failed,
  });
}
