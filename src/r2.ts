import { S3Client, HeadBucketCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Upload } from '@aws-sdk/lib-storage';
import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';

// Cloudflare R2 configuration
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL; // e.g., https://pub-xxxxx.r2.dev

// Validate configuration
const missingVars: string[] = [];
if (!R2_ACCOUNT_ID) missingVars.push('R2_ACCOUNT_ID');
if (!R2_ACCESS_KEY_ID) missingVars.push('R2_ACCESS_KEY_ID');
if (!R2_SECRET_ACCESS_KEY) missingVars.push('R2_SECRET_ACCESS_KEY');
if (!R2_BUCKET_NAME) missingVars.push('R2_BUCKET_NAME');
if (!R2_PUBLIC_URL) missingVars.push('R2_PUBLIC_URL');

if (missingVars.length > 0) {
  console.warn(`⚠️  R2 configuration incomplete. Missing: ${missingVars.join(', ')}`);
  console.warn('⚠️  Video uploads will not work until R2 environment variables are set.');
} else {
  console.log('✅ R2 configuration loaded');
  console.log(`   Account ID: ${R2_ACCOUNT_ID?.substring(0, 8)}...`);
  console.log(`   Bucket: ${R2_BUCKET_NAME}`);
  console.log(`   Public URL: ${R2_PUBLIC_URL}`);
}

// Initialize S3 client for R2 (R2 is S3-compatible)
const s3Client = R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY
  ? new S3Client({
    region: 'auto',
    endpoint: `https://${R2_ACCOUNT_ID}.eu.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
      accountId: R2_ACCOUNT_ID,
    },
  })
  : null;

/**
 * Upload a video file to Cloudflare R2 using streaming (memory-efficient)
 * @param fileStream - The file stream to upload (Readable stream)
 * @param originalFileName - Original filename for extension detection
 * @param contentType - MIME type of the file (e.g., 'video/mp4')
 * @param fileSize - Optional file size in bytes (for logging)
 * @returns An object containing the public URL and asset key of the uploaded file
 */
export async function uploadVideoToR2(
  fileStream: Readable,
  originalFileName: string,
  contentType: string,
  fileSize?: number
): Promise<{ url: string; key: string }> {
  if (!s3Client) {
    throw new Error('R2 storage is not configured. Please set R2 environment variables.');
  }

  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error('R2 bucket name or public URL is not configured.');
  }

  // Generate a unique filename
  const fileExtension = originalFileName.split('.').pop() || 'mp4';
  const uniqueFileName = `videos/${uuidv4()}.${fileExtension}`;

  try {
    // Upload to R2 using Upload class (handles streaming and large files efficiently)
    // The Upload class automatically handles multipart uploads for large files
    const upload = new Upload({
      client: s3Client,
      params: {
        Bucket: R2_BUCKET_NAME,
        Key: uniqueFileName,
        Body: fileStream,
        ContentType: contentType,
        // Note: ACL is not supported in R2, public access is configured via bucket settings
      },
      // Configure multipart upload thresholds
      partSize: 10 * 1024 * 1024, // 10MB per part (good for large files)
      leavePartsOnError: false, // Clean up on error
    });

    const sizeInfo = fileSize ? ` (${(fileSize / 1024 / 1024).toFixed(2)} MB)` : '';
    console.log(`Uploading video to R2: ${uniqueFileName}${sizeInfo}`);

    // The Upload class handles streaming and automatically uses multipart uploads for large files
    await upload.done();
    console.log(`✅ Video uploaded successfully: ${uniqueFileName}`);

    // Return both the public URL and the asset key
    const publicUrl = `${R2_PUBLIC_URL}/${uniqueFileName}`;
    return { url: publicUrl, key: uniqueFileName };
  } catch (error: any) {
    console.error('❌ Error uploading video to R2:', error);

    // Provide more helpful error messages
    if (error.name === 'AccessDenied' || error.Code === 'AccessDenied') {
      console.error('Access Denied - Possible causes:');
      console.error('  1. Check R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are correct');
      console.error('  2. Verify the API token has "Object Read & Write" permissions');
      console.error('  3. Ensure the bucket name is correct');
      console.error('  4. Check the R2_ACCOUNT_ID matches your Cloudflare account');
      throw new Error('Access Denied: Check R2 credentials and bucket permissions. See server logs for details.');
    }

    if (error.name === 'NoSuchBucket' || error.Code === 'NoSuchBucket') {
      throw new Error(`Bucket "${R2_BUCKET_NAME}" not found. Check R2_BUCKET_NAME environment variable.`);
    }

    throw new Error(`Failed to upload video: ${error.message || error.Code || 'Unknown error'}`);
  }
}

/**
 * Test R2 connection and permissions
 * This can be called to verify R2 configuration
 */
export async function testR2Connection(): Promise<{ success: boolean; message: string }> {
  if (!s3Client) {
    return { success: false, message: 'R2 client not initialized. Check environment variables.' };
  }

  if (!R2_BUCKET_NAME) {
    return { success: false, message: 'R2_BUCKET_NAME not set' };
  }

  try {
    // Try to access the bucket (this checks permissions)
    const command = new HeadBucketCommand({ Bucket: R2_BUCKET_NAME });
    await s3Client.send(command);
    return { success: true, message: 'R2 connection successful' };
  } catch (error: any) {
    if (error.name === 'AccessDenied' || error.Code === 'AccessDenied') {
      return {
        success: false,
        message: 'Access Denied: Check API token has "Object Read & Write" permissions for this bucket',
      };
    }
    if (error.name === 'NoSuchBucket' || error.Code === 'NoSuchBucket') {
      return {
        success: false,
        message: `Bucket "${R2_BUCKET_NAME}" not found. Verify the bucket name is correct.`,
      };
    }
    return {
      success: false,
      message: `Connection test failed: ${error.message || error.Code || 'Unknown error'}`,
    };
  }
}

/**
 * Generate a signed URL for a video stored in R2
 * @param videoUrlOrKey - The public URL of the video or the asset key (e.g., https://pub-xxxxx.r2.dev/videos/xxx.mp4 or videos/xxx.mp4)
 * @param expiresIn - Expiration time in seconds (default: 1 hour)
 * @returns A signed URL that provides temporary access to the video
 */
export async function getSignedVideoUrl(
  videoUrlOrKey: string,
  expiresIn: number = 60 * 60 * 24 // 1 day by default
): Promise<string> {
  if (!s3Client) {
    throw new Error('R2 storage is not configured. Please set R2 environment variables.');
  }

  if (!R2_BUCKET_NAME || !R2_PUBLIC_URL) {
    throw new Error('R2 bucket name or public URL is not configured.');
  }

  // Extract the key from the video URL or use it directly if it's already a key
  let key: string;

  // If it starts with "videos/", it's already a key
  if (videoUrlOrKey.startsWith('videos/')) {
    key = videoUrlOrKey;
  } else if (videoUrlOrKey.startsWith(R2_PUBLIC_URL)) {
    // Extract the key from the public URL
    key = videoUrlOrKey.replace(R2_PUBLIC_URL + '/', '');
  } else if (videoUrlOrKey.includes('/videos/')) {
    // Extract the key from a full URL (fallback)
    const urlParts = videoUrlOrKey.split('/videos/');
    if (urlParts.length > 1) {
      key = `videos/${urlParts[1]}`;
    } else {
      throw new Error('Invalid video URL format. Could not extract key.');
    }
  } else {
    // Assume it's already a key
    key = videoUrlOrKey;
  }

  try {
    // Create a GetObject command
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: key,
    });

    // Generate a signed URL that expires in the specified time
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });

    return signedUrl;
  } catch (error: any) {
    console.error('❌ Error generating signed URL:', error);
    throw new Error(`Failed to generate signed URL: ${error.message || 'Unknown error'}`);
  }
}

/**
 * Convert a stream to a buffer (use sparingly - loads entire file into memory)
 * Only use this for small files or when buffer is absolutely required
 */
export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

