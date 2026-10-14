import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  storageClient,
  isStorageConfigured,
  STORAGE_BUCKET,
  STORAGE_PUBLIC_URL,
} from '@/lib/storage';
import { auth } from '@/lib/auth/config';
import crypto from 'crypto';

const ALLOWED_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(request) {
  try {
    const session = await auth();
    if (!session) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!isStorageConfigured) {
      return Response.json({ error: 'File uploads are not configured' }, { status: 503 });
    }

    const { fileName, contentType, fileSize, folder } = await request.json();

    if (!fileName || !contentType) {
      return Response.json(
        { error: 'fileName and contentType are required' },
        { status: 400 }
      );
    }

    if (!ALLOWED_TYPES.includes(contentType)) {
      return Response.json(
        { error: 'File type not allowed' },
        { status: 400 }
      );
    }

    if (fileSize && fileSize > MAX_FILE_SIZE) {
      return Response.json(
        { error: 'File too large (max 10MB)' },
        { status: 400 }
      );
    }

    // Generate unique key
    const ext = fileName.split('.').pop();
    const uniqueName = `${crypto.randomUUID()}.${ext}`;
    const key = folder
      ? `${folder}/${session.user.id}/${uniqueName}`
      : `uploads/${session.user.id}/${uniqueName}`;

    const command = new PutObjectCommand({
      Bucket: STORAGE_BUCKET,
      Key: key,
      ContentType: contentType,
    });

    const presignedUrl = await getSignedUrl(storageClient, command, {
      expiresIn: 3600,
    });

    const publicUrl = STORAGE_PUBLIC_URL
      ? `${STORAGE_PUBLIC_URL}/${key}`
      : presignedUrl.split('?')[0];

    return Response.json({
      presignedUrl,
      publicUrl,
      key,
    });
  } catch (error) {
    console.error('Presigned URL error:', error);
    return Response.json(
      { error: 'Failed to generate upload URL' },
      { status: 500 }
    );
  }
}
