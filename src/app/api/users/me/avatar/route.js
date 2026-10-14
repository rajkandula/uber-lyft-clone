import sharp from 'sharp';
import connectDB from '@/lib/db/mongodb';
import User from '@/lib/db/models/User';
import { requireAuth } from '@/lib/auth/helpers';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

// POST /api/users/me/avatar — upload a profile picture.
// The image is normalized to a 256px JPEG (~15-25KB) and stored inline,
// so it works with zero storage configuration.
export async function POST(request) {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    const form = await request.formData();
    const file = form.get('file');

    if (!file || typeof file.arrayBuffer !== 'function') {
      return Response.json({ error: 'No image provided' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return Response.json({ error: 'Image must be under 5 MB' }, { status: 400 });
    }
    if (file.type && !ALLOWED_TYPES.includes(file.type)) {
      return Response.json({ error: 'Use a JPEG, PNG or WebP image' }, { status: 400 });
    }

    const input = Buffer.from(await file.arrayBuffer());

    let output;
    try {
      output = await sharp(input)
        .rotate() // respect EXIF orientation
        .resize(256, 256, { fit: 'cover' })
        .jpeg({ quality: 82 })
        .toBuffer();
    } catch {
      return Response.json({ error: 'That file doesn’t look like an image' }, { status: 400 });
    }

    const avatar = `data:image/jpeg;base64,${output.toString('base64')}`;

    await connectDB();
    await User.findByIdAndUpdate(session.user.id, { avatar });

    return Response.json({ avatar });
  } catch (err) {
    console.error('Avatar upload error:', err);
    return Response.json({ error: 'Failed to upload picture' }, { status: 500 });
  }
}

// DELETE /api/users/me/avatar — remove the profile picture
export async function DELETE() {
  const { session, error } = await requireAuth();
  if (error) return error;

  try {
    await connectDB();
    await User.findByIdAndUpdate(session.user.id, { avatar: '' });
    return Response.json({ ok: true });
  } catch (err) {
    console.error('Avatar delete error:', err);
    return Response.json({ error: 'Failed to remove picture' }, { status: 500 });
  }
}
