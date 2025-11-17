import { S3Client, PutObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3';
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
 * Upload a video file to Cloudflare R2
 * @param fileBuffer - The file buffer to upload
 * @param originalFileName - Original filename for extension detection
 * @param contentType - MIME type of the file (e.g., 'video/mp4')
 * @returns The public URL of the uploaded file
 */
export async function uploadVideoToR2(
  fileBuffer: Buffer,
  originalFileName: string,
  contentType: string
): Promise<string> {
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
    // Upload to R2
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      ACL: 'private',
      Key: uniqueFileName,
      Body: fileBuffer,
      ContentType: contentType,
      // Note: For public access, you need to configure the bucket's public access settings
      // in Cloudflare dashboard, not via ACL headers
    });

    console.log(`Uploading video to R2: ${uniqueFileName} (${(fileBuffer.length / 1024 / 1024).toFixed(2)} MB)`);
    await s3Client.send(command);
    console.log(`✅ Video uploaded successfully: ${uniqueFileName}`);

    // Return the public URL
    const publicUrl = `${R2_PUBLIC_URL}/${uniqueFileName}`;
    return publicUrl;
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
 * Convert a stream to a buffer
 */
export async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

