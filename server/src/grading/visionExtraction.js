import crypto from "node:crypto";
import vision from "@google-cloud/vision";
import { Storage } from "@google-cloud/storage";
import { env } from "../config/env.js";

const { ImageAnnotatorClient } = vision.v1;
let visionClient;
let storageClient;

export class VisionExtractionError extends Error {
  constructor(code, message, status = 502) {
    super(message);
    this.name = "VisionExtractionError";
    this.code = code;
    this.status = status;
  }
}

function clients() {
  if (!env.GOOGLE_CLOUD_PROJECT || !env.GOOGLE_CLOUD_STORAGE_BUCKET) {
    throw new VisionExtractionError(
      "VISION_NOT_CONFIGURED",
      "Set GOOGLE_CLOUD_PROJECT and GOOGLE_CLOUD_STORAGE_BUCKET in the server environment before processing scanned PDFs.",
      503,
    );
  }
  if (!visionClient) visionClient = new ImageAnnotatorClient();
  if (!storageClient)
    storageClient = new Storage({ projectId: env.GOOGLE_CLOUD_PROJECT });
  return {
    vision: visionClient,
    bucket: storageClient.bucket(env.GOOGLE_CLOUD_STORAGE_BUCKET),
  };
}

function withTimeout(promise, timeoutMs) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new VisionExtractionError(
              "VISION_TIMEOUT",
              "Google Cloud Vision timed out while processing the PDF. Try again later or use a smaller file.",
              504,
            ),
          ),
        timeoutMs,
      );
      timer.unref?.();
    }),
  ]).finally(() => clearTimeout(timer));
}

async function removeTemporaryObjects(bucket, prefixes) {
  try {
    const fileGroups = await Promise.all(
      prefixes.map((prefix) => bucket.getFiles({ prefix })),
    );
    const files = fileGroups.flatMap(([items]) => items);
    await Promise.allSettled(
      files.map((file) => file.delete({ ignoreNotFound: true })),
    );
  } catch (error) {
    console.warn("Vision temporary-file cleanup failed:", error?.message);
  }
}

function readPageResult(pageResult, state) {
  if (pageResult?.error?.message) {
    state.errors.push(pageResult.error.message);
    return;
  }

  const annotation = pageResult?.fullTextAnnotation;
  if (annotation?.text) state.text.push(annotation.text.trim());
  for (const page of annotation?.pages || []) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          if (Number.isFinite(word.confidence))
            state.confidences.push(word.confidence);
        }
      }
    }
  }
}

function recognitionFlags(confidences, pageErrors = []) {
  const flags = [];
  if (!confidences.length) {
    flags.push({
      code: "vision_confidence_unavailable",
      severity: "review",
      message:
        "Google Vision returned text without word-level confidence values. Verify the transcription against the original PDF.",
    });
  } else {
    const average =
      confidences.reduce((sum, value) => sum + value, 0) / confidences.length;
    const lowConfidenceCount = confidences.filter((value) => value < 0.7).length;
    if (lowConfidenceCount) {
      flags.push({
        code: "vision_low_confidence",
        severity: "review",
        message: `${lowConfidenceCount} recognized word${lowConfidenceCount === 1 ? " has" : "s have"} less than 70% Vision confidence. Verify those parts against the original PDF before grading.`,
      });
    } else if (average < 0.9) {
      flags.push({
        code: "vision_medium_confidence",
        severity: "notice",
        message: `Google Vision's average word confidence is ${Math.round(average * 100)}%. Check uncertain handwriting against the original PDF.`,
      });
    }
  }

  if (pageErrors.length) {
    flags.push({
      code: "vision_page_error",
      severity: "review",
      message: `Vision could not fully process ${pageErrors.length} page result${pageErrors.length === 1 ? "" : "s"}. Verify the complete original PDF before grading.`,
    });
  }
  return flags;
}

export async function extractPdfTextWithVision({ filePath, submissionId }) {
  const { vision: client, bucket } = clients();
  const bucketName = env.GOOGLE_CLOUD_STORAGE_BUCKET;
  const jobId = `${submissionId}/${crypto.randomUUID()}`;
  const inputName = `input/smartgrade-vision-tmp/${jobId}/submission.pdf`;
  const outputPrefix = `output/smartgrade-vision-tmp/${jobId}/`;
  const temporaryPrefixes = [inputName, outputPrefix];
  let operationPromise;
  let operationFinished = false;
  let deferCleanup = false;

  try {
    await bucket.upload(filePath, {
      destination: inputName,
      resumable: false,
      metadata: { contentType: "application/pdf" },
    });

    const [operation] = await client.asyncBatchAnnotateFiles({
      requests: [
        {
          inputConfig: {
            gcsSource: { uri: `gs://${bucketName}/${inputName}` },
            mimeType: "application/pdf",
          },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
          outputConfig: {
            gcsDestination: { uri: `gs://${bucketName}/${outputPrefix}` },
            batchSize: 5,
          },
        },
      ],
    });

    operationPromise = operation.promise().then(
      (result) => {
        operationFinished = true;
        return result;
      },
      (error) => {
        operationFinished = true;
        throw error;
      },
    );

    await withTimeout(operationPromise, env.GOOGLE_CLOUD_VISION_TIMEOUT_MS);
    const [outputFiles] = await bucket.getFiles({ prefix: outputPrefix });
    const jsonFiles = outputFiles
      .filter((file) => file.name.toLowerCase().endsWith(".json"))
      .sort((left, right) =>
        left.name.localeCompare(right.name, undefined, { numeric: true }),
      );

    if (!jsonFiles.length) {
      throw new VisionExtractionError(
        "VISION_OUTPUT_MISSING",
        "Google Vision finished without producing readable output files.",
      );
    }

    const state = { text: [], confidences: [], errors: [] };
    for (const file of jsonFiles) {
      const [contents] = await file.download();
      const output = JSON.parse(contents.toString("utf8"));
      for (const response of output.responses || [])
        readPageResult(response, state);
    }

    const text = state.text.join("\n\n").replace(/\u0000/g, "").trim();
    if (!text) {
      throw new VisionExtractionError(
        "VISION_NO_TEXT",
        state.errors.length
          ? `Google Vision could not read one or more PDF pages: ${state.errors.join("; ").slice(0, 800)}`
          : "Google Vision did not recognize readable text in this PDF. Review the original file and grade manually.",
        422,
      );
    }

    return {
      text: text.slice(0, 50000),
      flags: recognitionFlags(state.confidences, state.errors),
      provider: "google-cloud-vision",
    };
  } catch (error) {
    if (error instanceof VisionExtractionError) throw error;
    const message = String(error?.message || "");
    console.error("Google Cloud Vision extraction failed:", message);
    throw new VisionExtractionError(
      "VISION_REQUEST_FAILED",
      "Google Cloud Vision could not process this PDF. Check ADC login, Vision API access, and read/write access to the configured bucket, then retry.",
      502,
    );
  } finally {
    if (operationPromise && !operationFinished) {
      deferCleanup = true;
      operationPromise
        .finally(() => removeTemporaryObjects(bucket, temporaryPrefixes))
        .catch(() => {});
    }
    if (!deferCleanup)
      await removeTemporaryObjects(bucket, temporaryPrefixes);
  }
}
