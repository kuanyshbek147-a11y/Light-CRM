import { useCallback, useEffect, useRef, useState } from "react";
import {
  Invitation,
  Inviter,
  Registerer,
  RegistererState,
  Session,
  SessionState,
  UserAgent
} from "sip.js";
import {
  loadTelephonySession,
  reportTelephonyCall,
  TELEPHONY_DIAL_EVENT,
  type CallLogResult,
  type TelephonySession
} from "./api";

type Props = {
  authToken: string;
  onCallLinked?: (result: CallLogResult) => void;
  onToast?: (message: string, kind: "success" | "error") => void;
};

type SoftphoneStatus = "offline" | "connecting" | "registered" | "error";

function getRemoteNumber(session: Session): string {
  try {
    const uri = session.remoteIdentity?.uri;
    if (!uri) {
      return "";
    }
    return String(uri.user || uri.toString()).replace(/^sip:/i, "").split("@")[0] || "";
  } catch {
    return "";
  }
}

function getPeerConnection(session: Session): RTCPeerConnection | null {
  const sdh = session.sessionDescriptionHandler as
    | { peerConnection?: RTCPeerConnection }
    | undefined;
  return sdh?.peerConnection || null;
}

function attachRemoteAudio(session: Session, audioEl: HTMLAudioElement | null): void {
  if (!audioEl) {
    return;
  }
  const pc = getPeerConnection(session);
  if (!pc) {
    return;
  }
  const remoteStream = new MediaStream();
  pc.getReceivers().forEach((receiver: RTCRtpReceiver) => {
    if (receiver.track) {
      remoteStream.addTrack(receiver.track);
    }
  });
  audioEl.srcObject = remoteStream;
  void audioEl.play().catch(() => undefined);
}

export function TelephonySoftphone({ authToken, onCallLinked, onToast }: Props) {
  const [sessionConfig, setSessionConfig] = useState<TelephonySession | null>(null);
  const [status, setStatus] = useState<SoftphoneStatus>("offline");
  const [statusText, setStatusText] = useState("Телефония выключена");
  const [dialNumber, setDialNumber] = useState("");
  const [callState, setCallState] = useState<"idle" | "ringing" | "active">("idle");
  const [incoming, setIncoming] = useState(false);
  const [muted, setMuted] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [panelOpen, setPanelOpen] = useState(false);
  const [error, setError] = useState("");
  const [remoteDisplay, setRemoteDisplay] = useState("");

  const userAgentRef = useRef<UserAgent | null>(null);
  const registererRef = useRef<Registerer | null>(null);
  const activeSessionRef = useRef<Session | null>(null);
  const callLogIdRef = useRef("");
  const callDirectionRef = useRef<"in" | "out">("out");
  const remoteNumberRef = useRef("");
  const sipCallIdRef = useRef("");
  const callStartedAtRef = useRef(0);
  const answeredRef = useRef(false);
  const reportedTerminalRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<number | null>(null);
  const sessionConfigRef = useRef<TelephonySession | null>(null);
  const onCallLinkedRef = useRef(onCallLinked);
  const onToastRef = useRef(onToast);

  useEffect(() => {
    onCallLinkedRef.current = onCallLinked;
    onToastRef.current = onToast;
  }, [onCallLinked, onToast]);

  useEffect(() => {
    sessionConfigRef.current = sessionConfig;
  }, [sessionConfig]);

  const stopTimer = useCallback(() => {
    if (timerRef.current != null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    callStartedAtRef.current = Date.now();
    setElapsedSec(0);
    timerRef.current = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - callStartedAtRef.current) / 1000));
    }, 1000);
  }, [stopTimer]);

  const reportCall = useCallback(
    async (statusValue: "ringing" | "started" | "answered" | "ended" | "missed" | "failed") => {
      if (
        (statusValue === "ended" || statusValue === "missed" || statusValue === "failed") &&
        reportedTerminalRef.current
      ) {
        return null;
      }
      if (statusValue === "ended" || statusValue === "missed" || statusValue === "failed") {
        reportedTerminalRef.current = true;
      }
      const durationSec =
        statusValue === "ended" || statusValue === "missed" || statusValue === "failed"
          ? Math.max(0, Math.floor((Date.now() - (callStartedAtRef.current || Date.now())) / 1000))
          : undefined;
      const result = await reportTelephonyCall(authToken, {
        direction: callDirectionRef.current,
        remoteNumber: remoteNumberRef.current,
        status: statusValue,
        sipCallId: sipCallIdRef.current || undefined,
        callLogId: callLogIdRef.current || undefined,
        durationSec
      });
      if (result?.id) {
        callLogIdRef.current = result.id;
      }
      if (result && (statusValue === "ended" || statusValue === "answered" || statusValue === "started")) {
        onCallLinkedRef.current?.(result);
      }
      return result;
    },
    [authToken]
  );

  const cleanupSession = useCallback(async () => {
    stopTimer();
    setCallState("idle");
    setIncoming(false);
    setMuted(false);
    answeredRef.current = false;
    activeSessionRef.current = null;
    setRemoteDisplay("");
    if (audioRef.current) {
      audioRef.current.srcObject = null;
    }
  }, [stopTimer]);

  const bindSession = useCallback(
    (session: Session, direction: "in" | "out", remoteNumber: string) => {
      activeSessionRef.current = session;
      callDirectionRef.current = direction;
      remoteNumberRef.current = remoteNumber;
      sipCallIdRef.current = session.id || `${Date.now()}`;
      callLogIdRef.current = "";
      answeredRef.current = false;
      reportedTerminalRef.current = false;
      setRemoteDisplay(remoteNumber);
      setIncoming(direction === "in");
      setCallState("ringing");
      setPanelOpen(true);
      void reportCall(direction === "in" ? "ringing" : "started");

      session.stateChange.addListener((state) => {
        if (state === SessionState.Established) {
          answeredRef.current = true;
          setCallState("active");
          setIncoming(false);
          startTimer();
          attachRemoteAudio(session, audioRef.current);
          void reportCall("answered");
        }
        if (state === SessionState.Terminated) {
          const terminalStatus =
            direction === "in" && !answeredRef.current ? "missed" : "ended";
          void reportCall(terminalStatus);
          void cleanupSession();
        }
      });
    },
    [cleanupSession, reportCall, startTimer]
  );

  const hangup = useCallback(async () => {
    const session = activeSessionRef.current;
    if (!session) {
      await cleanupSession();
      return;
    }
    try {
      if (session.state === SessionState.Established) {
        await session.bye();
      } else if (session instanceof Invitation) {
        await session.reject();
      } else if (session instanceof Inviter) {
        await session.cancel();
      }
    } catch {
      void reportCall("failed");
      await cleanupSession();
    }
  }, [cleanupSession, reportCall]);

  const answer = useCallback(async () => {
    const session = activeSessionRef.current;
    if (!(session instanceof Invitation)) {
      return;
    }
    try {
      await session.accept({
        sessionDescriptionHandlerOptions: {
          constraints: { audio: true, video: false }
        }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось ответить");
      void reportCall("failed");
      await cleanupSession();
    }
  }, [cleanupSession, reportCall]);

  const toggleMute = useCallback(() => {
    const session = activeSessionRef.current;
    const pc = session ? getPeerConnection(session) : null;
    if (!pc) {
      return;
    }
    const next = !muted;
    pc.getSenders().forEach((sender: RTCRtpSender) => {
      if (sender.track && sender.track.kind === "audio") {
        sender.track.enabled = !next;
      }
    });
    setMuted(next);
  }, [muted]);

  const dial = useCallback(
    async (rawNumber: string) => {
      const ua = userAgentRef.current;
      const config = sessionConfigRef.current;
      if (!ua || !config?.domain) {
        onToastRef.current?.("Телефония не подключена", "error");
        return;
      }
      if (activeSessionRef.current) {
        onToastRef.current?.("Уже есть активный звонок", "error");
        return;
      }
      const digits = rawNumber.replace(/[^\d+*#]/g, "").trim();
      if (!digits) {
        return;
      }
      const targetUri = UserAgent.makeURI(`sip:${digits}@${config.domain}`);
      if (!targetUri) {
        setError("Некорректный номер");
        return;
      }
      try {
        const inviter = new Inviter(ua, targetUri, {
          sessionDescriptionHandlerOptions: {
            constraints: { audio: true, video: false }
          }
        });
        bindSession(inviter, "out", digits);
        await inviter.invite();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Не удалось позвонить");
        void reportCall("failed");
        await cleanupSession();
      }
    },
    [bindSession, cleanupSession, reportCall]
  );

  const bindSessionRef = useRef(bindSession);
  const dialRef = useRef(dial);
  useEffect(() => {
    bindSessionRef.current = bindSession;
    dialRef.current = dial;
  }, [bindSession, dial]);

  useEffect(() => {
    let cancelled = false;

    async function boot(): Promise<void> {
      setStatus("connecting");
      setStatusText("Подключение…");
      setError("");
      try {
        const next = await loadTelephonySession(authToken);
        if (cancelled) {
          return;
        }
        setSessionConfig(next);
        sessionConfigRef.current = next;
        if (!next.enabled || !next.configured || !next.extension || !next.wssUrl || !next.domain) {
          setStatus("offline");
          setStatusText(
            !next.enabled
              ? "Телефония выключена"
              : !next.extension
                ? "Нет SIP-учётки"
                : "Не настроена АТС"
          );
          return;
        }

        const uri = UserAgent.makeURI(`sip:${next.extension.sipUsername}@${next.domain}`);
        if (!uri) {
          setStatus("error");
          setStatusText("Некорректный SIP URI");
          return;
        }

        if (userAgentRef.current) {
          try {
            await registererRef.current?.unregister();
          } catch {
            /* ignore */
          }
          try {
            await userAgentRef.current.stop();
          } catch {
            /* ignore */
          }
        }

        const ua = new UserAgent({
          uri,
          transportOptions: {
            server: next.wssUrl
          },
          authorizationUsername: next.extension.sipUsername,
          authorizationPassword: next.extension.sipPassword,
          displayName: next.extension.displayName || next.extension.sipUsername,
          sessionDescriptionHandlerFactoryOptions: {
            constraints: { audio: true, video: false },
            peerConnectionConfiguration: {
              iceServers: next.iceServers
            }
          },
          logLevel: "error",
          delegate: {
            onInvite: (invitation: Invitation) => {
              if (activeSessionRef.current) {
                void invitation.reject();
                return;
              }
              const remote = getRemoteNumber(invitation);
              bindSessionRef.current(invitation, "in", remote || "unknown");
              onToastRef.current?.(`Входящий: ${remote || "неизвестно"}`, "success");
            }
          }
        });

        await ua.start();
        const registerer = new Registerer(ua);
        registerer.stateChange.addListener((state) => {
          if (state === RegistererState.Registered) {
            setStatus("registered");
            setStatusText("В сети");
          } else if (state === RegistererState.Unregistered) {
            setStatus("offline");
            setStatusText("Не зарегистрирован");
          }
        });
        await registerer.register();
        if (cancelled) {
          await registerer.unregister().catch(() => undefined);
          await ua.stop().catch(() => undefined);
          return;
        }
        userAgentRef.current = ua;
        registererRef.current = registerer;
        setStatus("registered");
        setStatusText("В сети");
      } catch (err) {
        if (cancelled) {
          return;
        }
        setStatus("error");
        setStatusText("Ошибка SIP");
        setError(err instanceof Error ? err.message : "Не удалось подключить softphone");
      }
    }

    void boot();

    return () => {
      cancelled = true;
      stopTimer();
      void (async () => {
        try {
          await registererRef.current?.unregister();
        } catch {
          /* ignore */
        }
        try {
          await userAgentRef.current?.stop();
        } catch {
          /* ignore */
        }
        userAgentRef.current = null;
        registererRef.current = null;
      })();
    };
  }, [authToken, stopTimer]);

  useEffect(() => {
    const onDial = (event: Event): void => {
      const detail = (event as CustomEvent<{ phone?: string }>).detail;
      const phone = String(detail?.phone || "").trim();
      if (!phone) {
        return;
      }
      setDialNumber(phone);
      setPanelOpen(true);
      void dialRef.current(phone);
    };
    window.addEventListener(TELEPHONY_DIAL_EVENT, onDial);
    return () => window.removeEventListener(TELEPHONY_DIAL_EVENT, onDial);
  }, []);

  if (!sessionConfig?.enabled && status === "offline" && !panelOpen) {
    return null;
  }

  const mm = String(Math.floor(elapsedSec / 60)).padStart(2, "0");
  const ss = String(elapsedSec % 60).padStart(2, "0");

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline />
      <button
        type="button"
        className={`telephonyFab ${status === "registered" ? "online" : ""} ${callState !== "idle" ? "busy" : ""}`}
        title="Softphone"
        onClick={() => setPanelOpen((prev) => !prev)}
      >
        ☎
      </button>
      {panelOpen ? (
        <aside className="telephonyPanel">
          <div className="telephonyPanelHeader">
            <div>
              <div className="telephonyPanelTitle">Softphone</div>
              <div className={`telephonyStatus ${status}`}>{statusText}</div>
            </div>
            <button type="button" className="drawerClose" onClick={() => setPanelOpen(false)}>
              ✕
            </button>
          </div>
          {error ? <div className="drawerInlineError">{error}</div> : null}
          {callState === "idle" ? (
            <div className="telephonyDialRow">
              <input
                className="filterInput"
                placeholder="Номер"
                value={dialNumber}
                onChange={(event) => setDialNumber(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    void dial(dialNumber);
                  }
                }}
              />
              <button
                type="button"
                className="primaryButton"
                disabled={status !== "registered"}
                onClick={() => void dial(dialNumber)}
              >
                Позвонить
              </button>
            </div>
          ) : (
            <div className="telephonyActiveCall">
              <div className="telephonyRemote">{remoteDisplay || dialNumber}</div>
              <div className="telephonyTimer">
                {incoming && callState === "ringing" ? "Входящий…" : `${mm}:${ss}`}
              </div>
              <div className="telephonyCallActions">
                {incoming && callState === "ringing" ? (
                  <button type="button" className="primaryButton" onClick={() => void answer()}>
                    Ответить
                  </button>
                ) : (
                  <button type="button" className="secondaryButton" onClick={toggleMute}>
                    {muted ? "Вкл. звук" : "Mute"}
                  </button>
                )}
                <button type="button" className="dangerButton" onClick={() => void hangup()}>
                  Сброс
                </button>
              </div>
            </div>
          )}
          <p className="integrationsHint">
            SIP сигналинг идёт напрямую на ваш Asterisk (WSS). CRM пишет лог звонка и открывает
            карточку клиента.
          </p>
        </aside>
      ) : null}
    </>
  );
}
