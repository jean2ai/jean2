import type { HttpClient } from '../transport/http';
import type { ListAttachmentsResponse, UploadAttachmentResponse } from '../types/rest-responses';

/**
 * Options for listing attachments.
 */
interface ListAttachmentsOptions {
  /** Abort signal for request cancellation. */
  signal?: AbortSignal;
}

/**
 * Options for uploading an attachment.
 */
interface UploadAttachmentOptions {
  /** Abort signal for request cancellation. */
  signal?: AbortSignal;
}

export class AttachmentsRestNamespace {
  constructor(private http: HttpClient) {}

  /**
   * GET /api/sessions/:id/attachments — List all attachments for a session.
   */
  async list(sessionId: string, options?: ListAttachmentsOptions): Promise<ListAttachmentsResponse> {
    return this.http.get(`/sessions/${encodeURIComponent(sessionId)}/attachments`, {
      signal: options?.signal,
    });
  }

  /**
   * POST /api/sessions/:id/attachments — Upload a file attachment to a session.
   *
   * The server expects `multipart/form-data` with a field named `"file"`.
   * The signal is not forwarded into the FormData body — it only controls the HTTP request.
   */
  async upload(
    sessionId: string,
    file: File | Blob,
    options?: UploadAttachmentOptions,
  ): Promise<UploadAttachmentResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const { signal } = options ?? {};

    return this.http.post(`/sessions/${encodeURIComponent(sessionId)}/attachments`, formData, {
      signal,
    });
  }

  /**
   * Build the URL for accessing an attachment's content.
   *
   * This is a pure URL builder — no HTTP call is made. The returned URL includes the
   * signed access key as a query parameter, matching the server's `/api/sessions/:id/attachments/:attachmentId/content?key=...` pattern.
   */
  getUrl(sessionId: string, attachmentId: string, key: string): string {
    const encodedSession = encodeURIComponent(sessionId);
    const encodedId = encodeURIComponent(attachmentId);
    return `/api/sessions/${encodedSession}/attachments/${encodedId}/content?key=${encodeURIComponent(key)}`;
  }
}
