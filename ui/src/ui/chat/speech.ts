let speaking = false;
let currentUtterance: SpeechSynthesisUtterance | null = null;

export function isTtsSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function isTtsSpeaking(): boolean {
  return speaking;
}

export function speakText(
  text: string,
  opts?: { onEnd?: () => void; onError?: () => void },
): void {
  if (!isTtsSupported()) return;
  stopTts();
  const utterance = new SpeechSynthesisUtterance(text);
  currentUtterance = utterance;
  speaking = true;
  utterance.onend = () => {
    speaking = false;
    currentUtterance = null;
    opts?.onEnd?.();
  };
  utterance.onerror = () => {
    speaking = false;
    currentUtterance = null;
    opts?.onError?.();
  };
  speechSynthesis.speak(utterance);
}

export function stopTts(): void {
  if (!isTtsSupported()) return;
  speechSynthesis.cancel();
  speaking = false;
  currentUtterance = null;
}
