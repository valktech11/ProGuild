import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

const ACCOUNT_ID  = process.env.R2_ACCOUNT_ID!
const ACCESS_KEY  = process.env.R2_ACCESS_KEY_ID!
const SECRET_KEY  = process.env.R2_SECRET_ACCESS_KEY!
const BUCKET_NAME = process.env.R2_BUCKET_NAME!
const PUBLIC_URL  = process.env.R2_PUBLIC_URL  // optional custom domain

export function getR2Client() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     ACCESS_KEY,
      secretAccessKey: SECRET_KEY,
    },
  })
}

// Direct upload (server-side) — for small files like avatars (<4.5MB)
export async function uploadToR2(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<string> {
  const client = getR2Client()
  await client.send(new PutObjectCommand({
    Bucket:      BUCKET_NAME,
    Key:         key,
    Body:        body,
    ContentType: contentType,
  }))
  return getR2PublicUrl(key)
}

// Signed URL for direct browser → R2 upload (bypasses Vercel — for large files)
export async function getPresignedUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 300  // 5 minutes
): Promise<string> {
  const client = getR2Client()
  const cmd = new PutObjectCommand({
    Bucket:      BUCKET_NAME,
    Key:         key,
    ContentType: contentType,
  })
  return getSignedUrl(client, cmd, { expiresIn })
}

// Delete object from R2
export async function deleteFromR2(key: string): Promise<void> {
  const client = getR2Client()
  await client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: key }))
}

// Get public URL for a key
export function getR2PublicUrl(key: string): string {
  if (PUBLIC_URL) return `${PUBLIC_URL}/${key}`
  // Fallback to R2 public bucket URL pattern
  return `https://${ACCOUNT_ID}.r2.cloudflarestorage.com/${BUCKET_NAME}/${key}`
}

// Key generators — consistent naming across the app
export const r2Keys = {
  avatar:        (proId: string)                    => `pros/${proId}/profile/avatar.jpg`,
  cover:         (proId: string)                    => `pros/${proId}/cover/cover.jpg`,
  jobPhoto:      (proId: string, jobId: string, phase: string, name: string) =>
                                                       `pros/${proId}/jobs/${jobId}/${phase}/${name}`,
  portfolioPhoto:(proId: string, name: string)      => `pros/${proId}/portfolio/${name}`,
  vaultDoc:      (proId: string, docType: string)   => `pros/${proId}/vault/${docType}`,
  estimatePdf:   (estId: string)                    => `estimates/${estId}/estimate.pdf`,
  communityPost: (postId: string, name: string)     => `community/posts/${postId}/${name}`,
}
