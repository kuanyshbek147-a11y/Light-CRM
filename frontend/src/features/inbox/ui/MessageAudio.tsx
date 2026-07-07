import { useEffect, useState } from "react";
import { API_BASE_URL } from "../../../shared/config/api";
import { mimeTypeFromAudioFileName } from "../lib/voiceRecorder";

type MessageAudioProps = {
  metaMediaId?: string | null;
  attachmentUrl?: string | null;
  attachmentName?: string | null;
  getMediaUrl: (url: string) => string;
  token: string | null;
};

export function MessageAudio(props: MessageAudioProps): JSX.Element {
  const { metaMediaId, attachmentUrl, attachmentName, getMediaUrl, token } = props;
  const [src, setSrc] = useState<string>("");
  const mimeType = mimeTypeFromAudioFileName(attachmentName || attachmentUrl || "voice.m4a");

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;

    async function load(): Promise<void> {
      if (metaMediaId && token) {
        try {
          const response = await fetch(`${API_BASE_URL}/conversations/whatsapp-media/${metaMediaId}`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          if (response.ok) {
            const blob = await response.blob();
            objectUrl = URL.createObjectURL(blob);
            if (!cancelled) {
              setSrc(objectUrl);
            }
            return;
          }
        } catch {
          // fallback to local attachment url below
        }
      }

      if (attachmentUrl && !cancelled) {
        setSrc(getMediaUrl(attachmentUrl));
      }
    }

    void load();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [metaMediaId, attachmentUrl, token, getMediaUrl]);

  if (!src) {
    return <div className="bubbleMedia bubbleMediaAudio bubbleMediaPending">Загрузка аудио…</div>;
  }

  return (
    <audio className="bubbleMedia bubbleMediaAudio" controls preload="metadata">
      <source src={src} type={mimeType} />
    </audio>
  );
}
