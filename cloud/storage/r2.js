// cloud/storage/r2.js
const crypto = require("crypto");
const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const R2_ACCESS_KEY  = process.env.R2_ACCESS_KEY;
const R2_SECRET_KEY  = process.env.R2_SECRET_KEY;
const R2_BUCKET      = process.env.R2_BUCKET;
const R2_ACCOUNT_ID  = process.env.R2_ACCOUNT_ID;
const R2_PUBLIC_URL  = process.env.R2_PUBLIC_URL; // optional

if (!R2_ACCESS_KEY || !R2_SECRET_KEY || !R2_BUCKET || !R2_ACCOUNT_ID) {
  console.warn("[r2] Warning: Missing R2 environment variables.");
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY,
    secretAccessKey: R2_SECRET_KEY,
  },
});

/**
 * uploadToR2
 * @param {Buffer} buffer
 * @param {string} contentType
 * @param {string} keyHint
 */
async function uploadToR2({ buffer, contentType, keyHint = "media" }) {
  if (!buffer) {
    return { success: false, error: "R2: missing buffer." };
  }

  const key = `${keyHint}/${crypto.randomUUID()}`;

  try {
    await r2.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      })
    );

    const publicUrl = R2_PUBLIC_URL ? `${R2_PUBLIC_URL}/${key}` : null;

    return { success: true, key, publicUrl };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * getR2SignedUrl
 * Generates a temporary signed URL for private buckets.
 * @param {string} key
 * @param {number} expiresIn - seconds (default 1hr)
 */
async function getR2SignedUrl(key, expiresIn = 3600) {
  if (!key) {
    return { success: false, error: "R2: missing key." };
  }

  try {
    const command = new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
    });

    const url = await getSignedUrl(r2, command, { expiresIn });

    return { success: true, url };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

module.exports = { uploadToR2, getR2SignedUrl };
