'use client';

export type NotifySoundKind =
  | 'order.placed'
  | 'order.assigned'
  | 'order.kitchen'
  | 'order.ready'
  | 'order.preparing'
  | 'call_waiter'
  | 'order.unassigned'
  | 'remake.request'
  | 'remake.approved'
  | 'void.request'
  | 'comp.request'
  | 'till.variance_close.request'
  | 'default';

const DEFAULT_LINES: Record<NotifySoundKind, string> = {
  'order.placed': 'New guest order placed. Please review and assign.',
  'order.assigned': 'You have been assigned a new order. Send it to the kitchen when ready.',
  'order.kitchen': 'New kitchen ticket. Please start preparation.',
  'order.ready': 'Order is ready to serve.',
  'order.preparing': 'Order is now preparing.',
  call_waiter: 'A table is calling for a waiter.',
  'order.unassigned': 'A table was reassigned away from you.',
  'remake.request': 'Kitchen is asking to remake a dish. Please approve or decline.',
  'remake.approved': 'Remake approved. Please remake the dish.',
  'void.request': 'A void request needs your approval.',
  'comp.request': 'A complimentary item request needs your approval.',
  'till.variance_close.request':
    'A till close with a cash difference needs your approval.',
  default: 'New notification.',
};

const BEEP_FREQ: Record<NotifySoundKind, number[]> = {
  'order.placed': [880, 1100],
  'order.assigned': [740, 990],
  'order.kitchen': [523, 659, 784],
  'order.ready': [988, 1318],
  'order.preparing': [659, 784],
  call_waiter: [440, 554, 440],
  'order.unassigned': [660, 520],
  'remake.request': [784, 988, 784],
  'remake.approved': [523, 659, 784],
  'void.request': [880, 660, 440],
  'comp.request': [740, 880, 990],
  'till.variance_close.request': [660, 550, 440],
  default: [660, 880],
};

let audioCtx: AudioContext | null = null;
let lastSpokenAt = 0;
let lastSpokenText = '';
let unlocked = false;

/** Call from a user gesture so later announcements can play on iOS/Safari. */
export function unlockNotifyAudio() {
  if (typeof window === 'undefined' || unlocked) return;
  const ctx = getCtx();
  if (ctx) {
    void ctx.resume().catch(() => undefined);
  }
  if ('speechSynthesis' in window) {
    try {
      // Warm the engine without audible speech.
      window.speechSynthesis.getVoices();
    } catch {
      /* ignore */
    }
  }
  unlocked = true;
}

function normalizeKind(kind?: string | null): NotifySoundKind {
  if (kind && kind in DEFAULT_LINES) return kind as NotifySoundKind;
  if (kind === 'call_waiter') return 'call_waiter';
  return 'default';
}

function buildSpeechText(opts: {
  kind?: string;
  title?: string | null;
  body?: string | null;
  text?: string | null;
}): string {
  if (opts.text?.trim()) return opts.text.trim();
  const title = opts.title?.trim();
  const body = opts.body?.trim();
  if (title && body) return `${title}. ${body}`;
  if (title) return title;
  if (body) return body;
  return DEFAULT_LINES[normalizeKind(opts.kind)];
}

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  return audioCtx;
}

function playBeepFallback(kind: NotifySoundKind) {
  const ctx = getCtx();
  if (!ctx) return;
  void ctx.resume().catch(() => undefined);
  const freqs = BEEP_FREQ[kind];
  const now = ctx.currentTime;
  freqs.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.1, now + 0.02 + i * 0.1);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.16 + i * 0.1);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now + i * 0.1);
    osc.stop(now + 0.2 + i * 0.1);
  });
}

function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  return (
    voices.find((v) => /^en(-|_)/i.test(v.lang) && /female|zira|samantha|google uk/i.test(v.name)) ||
    voices.find((v) => /^en(-|_)/i.test(v.lang)) ||
    voices[0] ||
    null
  );
}

/** Speak what happened. Falls back to a short chime if speech is unavailable. */
export function announceEvent(
  opts: {
    enabled?: boolean;
    kind?: string;
    title?: string | null;
    body?: string | null;
    text?: string | null;
  } = {},
) {
  if (opts.enabled === false || typeof window === 'undefined') return;

  const kind = normalizeKind(opts.kind);
  const text = buildSpeechText(opts);
  if (!text) return;

  // Dedupe rapid identical announcements (socket + notification double-fire).
  const now = Date.now();
  if (text === lastSpokenText && now - lastSpokenAt < 2500) return;
  lastSpokenText = text;
  lastSpokenAt = now;

  if (!('speechSynthesis' in window)) {
    playBeepFallback(kind);
    return;
  }

  const speak = () => {
    try {
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = 1.05;
      utter.pitch = 1;
      utter.volume = 1;
      const voice = pickVoice();
      if (voice) utter.voice = voice;
      utter.lang = voice?.lang || 'en-GB';
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utter);
    } catch {
      playBeepFallback(kind);
    }
  };

  // Chrome often returns empty voices until voiceschanged fires.
  if (window.speechSynthesis.getVoices().length === 0) {
    const onVoices = () => {
      window.speechSynthesis.removeEventListener('voiceschanged', onVoices);
      speak();
    };
    window.speechSynthesis.addEventListener('voiceschanged', onVoices);
    window.setTimeout(speak, 250);
  } else {
    speak();
  }
}

/** @deprecated Prefer announceEvent / announceNotification — kept for call-site compatibility. */
export function playNotifySound(
  kind: NotifySoundKind | string = 'default',
  enabled = true,
  detail?: { title?: string | null; body?: string | null; text?: string | null },
) {
  announceEvent({
    enabled,
    kind,
    title: detail?.title,
    body: detail?.body,
    text: detail?.text,
  });
}

export function soundKindFromNotification(n: {
  type?: string;
  payload?: unknown;
}): NotifySoundKind {
  const payload = n.payload as { sound?: string } | null;
  if (payload?.sound) return normalizeKind(payload.sound);
  return normalizeKind(n.type);
}

export function announceNotification(
  n: {
    type?: string;
    title?: string | null;
    body?: string | null;
    payload?: unknown;
  },
  enabled = true,
) {
  announceEvent({
    enabled,
    kind: soundKindFromNotification(n),
    title: n.title,
    body: n.body,
  });
}

/** Guest-facing lines for kitchen / service status updates. */
export function announceGuestOrderStatus(
  payload: { name?: string; status?: string },
  enabled = true,
) {
  if (!enabled) return;
  const name = payload.name?.trim();
  const status = payload.status?.trim().toLowerCase();
  if (!status) return;

  const lines: Record<string, { kind: NotifySoundKind; text: string }> = {
    submitted: {
      kind: 'order.placed',
      text: name
        ? `${name} was received by the kitchen.`
        : 'Your order was received by the kitchen.',
    },
    preparing: {
      kind: 'order.preparing',
      text: name
        ? `${name} is now being prepared.`
        : 'Your order is now being prepared.',
    },
    ready: {
      kind: 'order.ready',
      text: name
        ? `${name} is ready.`
        : 'Your order is ready.',
    },
    served: {
      kind: 'order.ready',
      text: name
        ? `${name} has been served.`
        : 'Your order has been served.',
    },
    paid: {
      kind: 'default',
      text: name ? `${name} is paid.` : 'Your bill has been paid.',
    },
  };

  const line = lines[status];
  if (!line) return;
  announceEvent({
    enabled: true,
    kind: line.kind,
    text: line.text,
  });
}
