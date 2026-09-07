"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

type Props = {
  onConfirm: (payload: { imageBase64: string; mimeType: string }) => void;
  onCancel?: () => void;
  confirmLabel?: string;
  /** When true, show admin/manual fallback CTA */
  allowManualFallback?: boolean;
  onManualFallback?: () => void;
};

/**
 * Browser camera capture for attendance evidence — NOT facial recognition.
 */
export function CameraCapture({
  onConfirm,
  onCancel,
  confirmLabel = "Confirm",
  allowManualFallback,
  onManualFallback,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState("image/jpeg");
  const [starting, setStarting] = useState(true);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStarting(true);
      setError(null);
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera is not available in this browser.");
        setStarting(false);
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch {
        setError(
          "Camera permission denied or unavailable. Ask an admin for a manual check-in, or retry after allowing the camera.",
        );
      } finally {
        if (!cancelled) setStarting(false);
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, [stop]);

  const capture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    setMimeType("image/jpeg");
    setPreview(dataUrl);
    stop();
  };

  const retake = () => {
    setPreview(null);
    setStarting(true);
    setError(null);
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: "user" }, audio: false })
      .then(async (stream) => {
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setStarting(false);
      })
      .catch(() => {
        setError("Could not restart camera.");
        setStarting(false);
      });
  };

  const confirm = () => {
    if (!preview) return;
    const base64 = preview.split(",")[1];
    if (!base64) return;
    onConfirm({ imageBase64: base64, mimeType });
  };

  return (
    <div className="space-y-4" data-testid="camera-capture">
      <p className="text-xs text-charcoal/55">
        Camera is only attendance evidence that you were at this device — not face recognition.
      </p>
      {error ? (
        <div className="rounded-xl border border-aarla-red/30 bg-white p-4 space-y-3">
          <p className="text-sm text-aarla-red" data-testid="camera-error">
            {error}
          </p>
          {allowManualFallback && onManualFallback ? (
            <Button type="button" variant="secondary" onClick={onManualFallback}>
              Ask admin / manual fallback
            </Button>
          ) : null}
        </div>
      ) : null}

      {!preview && !error ? (
        <div className="relative overflow-hidden rounded-2xl border border-border bg-deep-navy/90 aspect-[4/3]">
          <video
            ref={videoRef}
            playsInline
            muted
            className="h-full w-full object-cover"
            data-testid="camera-preview"
          />
          {starting ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-white/80">
              Starting camera…
            </p>
          ) : null}
        </div>
      ) : null}

      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt="Attendance capture preview"
          className="w-full rounded-2xl border border-border aspect-[4/3] object-cover"
          data-testid="camera-snapshot"
        />
      ) : null}

      <div className="flex flex-wrap gap-2">
        {!preview && !error ? (
          <Button type="button" onClick={capture} data-testid="camera-capture-btn">
            Capture
          </Button>
        ) : null}
        {preview ? (
          <>
            <Button type="button" variant="secondary" onClick={retake} data-testid="camera-retake">
              Retake
            </Button>
            <Button type="button" onClick={confirm} data-testid="camera-confirm">
              {confirmLabel}
            </Button>
          </>
        ) : null}
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}
