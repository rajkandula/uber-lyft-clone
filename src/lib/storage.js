import { S3Client } from '@aws-sdk/client-s3';

/**
 * Optional object storage: any S3-compatible bucket.
 *
 * Only the presigned-upload endpoint uses it. Profile pictures are stored
 * inline in MongoDB, so the app runs fine with none of these set.
 */
const bucket = process.env.STORAGE_BUCKET;
const accessKeyId = process.env.STORAGE_ACCESS_KEY_ID;
const secretAccessKey = process.env.STORAGE_SECRET_ACCESS_KEY;
const endpoint = process.env.STORAGE_ENDPOINT;

export const isStorageConfigured = Boolean(bucket && accessKeyId && secretAccessKey && endpoint);

export const storageClient = isStorageConfigured
  ? new S3Client({
      region: process.env.STORAGE_REGION || 'auto',
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
    })
  : null;

export const STORAGE_BUCKET = bucket || '';
/** Public base URL for stored objects (e.g. a CDN or bucket domain), no trailing slash. */
export const STORAGE_PUBLIC_URL = (process.env.STORAGE_PUBLIC_URL || '').replace(/\/+$/, '');
