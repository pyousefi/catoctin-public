import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  ListPartsCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

export const PART_BYTES = 8 * 1024 * 1024;

export function r2Config() {
  const {
    R2_ENDPOINT,
    R2_BUCKET,
    R2_PREFIX,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
  } = process.env;
  if (
    !R2_ENDPOINT ||
    !R2_BUCKET ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !["production", "preview"].includes(R2_PREFIX ?? "")
  )
    throw new Error("R2 is not configured");
  const endpoint = new URL(R2_ENDPOINT);
  if (
    endpoint.protocol !== "https:" ||
    !/^[a-f0-9]{32}\.r2\.cloudflarestorage\.com$/.test(endpoint.hostname) ||
    endpoint.pathname !== "/" ||
    endpoint.search ||
    endpoint.hash ||
    endpoint.username ||
    endpoint.password ||
    endpoint.port
  )
    throw new Error("Invalid R2 endpoint");
  return {
    endpoint: endpoint.origin,
    bucket: R2_BUCKET,
    prefix: R2_PREFIX!,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  };
}

export function r2Client() {
  const config = r2Config();
  return new S3Client({
    region: "auto",
    endpoint: config.endpoint,
    credentials: config.credentials,
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

export function r2Object(pathname: string) {
  const config = r2Config();
  if (
    !pathname.startsWith(`r2/${config.prefix}/photos/`) ||
    pathname.includes("..")
  )
    throw new Error("Invalid R2 photo path");
  return { Bucket: config.bucket, Key: pathname };
}

export function isMissingObject(error: unknown) {
  return (
    error instanceof Error && ["NotFound", "NoSuchKey"].includes(error.name)
  );
}

export async function headR2(pathname: string) {
  const result = await r2Client().send(
    new HeadObjectCommand(r2Object(pathname)),
  );
  return { size: result.ContentLength, contentType: result.ContentType };
}

export async function getR2(pathname: string) {
  try {
    const result = await r2Client().send(
      new GetObjectCommand(r2Object(pathname)),
    );
    if (!result.Body) throw new Error("R2 returned no original");
    return {
      statusCode: 200,
      stream: result.Body.transformToWebStream(),
      blob: { size: result.ContentLength },
    };
  } catch (error) {
    if (isMissingObject(error)) return null;
    throw error;
  }
}

export async function deleteR2(pathname: string) {
  await r2Client().send(new DeleteObjectCommand(r2Object(pathname)));
}

export async function abortR2(pathname: string, uploadId: string) {
  try {
    await r2Client().send(
      new AbortMultipartUploadCommand({
        ...r2Object(pathname),
        UploadId: uploadId,
      }),
    );
  } catch (error) {
    if (!(error instanceof Error && error.name === "NoSuchUpload")) throw error;
  }
}

export async function createR2Upload(
  pathname: string,
  size: number,
  contentType: string,
) {
  const client = r2Client();
  const object = r2Object(pathname);
  const result = await client.send(
    new CreateMultipartUploadCommand({ ...object, ContentType: contentType }),
  );
  if (!result.UploadId) throw new Error("R2 did not start the upload");
  try {
    const urls = await Promise.all(
      Array.from({ length: Math.ceil(size / PART_BYTES) }, (_, i) =>
        getSignedUrl(
          client,
          new UploadPartCommand({
            ...object,
            UploadId: result.UploadId,
            PartNumber: i + 1,
            ContentLength: Math.min(PART_BYTES, size - i * PART_BYTES),
          }),
          { expiresIn: 3600, signableHeaders: new Set(["content-length"]) },
        ),
      ),
    );
    return { uploadId: result.UploadId, urls, partBytes: PART_BYTES };
  } catch (error) {
    await abortR2(pathname, result.UploadId);
    throw error;
  }
}

export async function finishR2Upload(
  pathname: string,
  uploadId: string,
  size: number,
  contentType: string,
) {
  try {
    const existing = await headR2(pathname);
    if (existing.size !== size || existing.contentType !== contentType)
      throw new Error("R2 original does not match reservation");
    return;
  } catch (error) {
    if (!isMissingObject(error)) throw error;
  }
  const client = r2Client();
  const object = { ...r2Object(pathname), UploadId: uploadId };
  const result = await client.send(new ListPartsCommand(object));
  const parts = result.Parts ?? [];
  if (
    result.IsTruncated ||
    parts.length !== Math.ceil(size / PART_BYTES) ||
    parts.some(
      (part, i) =>
        part.PartNumber !== i + 1 ||
        !part.ETag ||
        part.Size !== Math.min(PART_BYTES, size - i * PART_BYTES),
    )
  )
    throw new Error("R2 upload parts do not match reservation");
  await client.send(
    new CompleteMultipartUploadCommand({
      ...object,
      MultipartUpload: {
        Parts: parts.map(({ PartNumber, ETag }) => ({ PartNumber, ETag })),
      },
    }),
  );
}
