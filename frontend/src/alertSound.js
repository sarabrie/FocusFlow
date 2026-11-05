// Short two-note chime made with Web Audio, so no sound file is needed.
// Browsers only allow audio after a user gesture: call unlockAlertSound() from a click handler first.
let context = null;

export function unlockAlertSound() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  context ??= new AudioContextClass();
  if (context.state === 'suspended') void context.resume();
}

export function playAlertSound() {
  if (!context) return;
  const start = context.currentTime;
  [880, 660].forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const noteStart = start + index * 0.18;
    oscillator.type = 'sine';
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, noteStart);
    gain.gain.exponentialRampToValueAtTime(0.25, noteStart + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.16);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(noteStart);
    oscillator.stop(noteStart + 0.17);
  });
}
