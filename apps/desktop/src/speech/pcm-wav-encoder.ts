/**
 * @file Encodes raw mono PCM samples (captured by the renderer's Web Audio API — no Node audio
 * capture exists in this process) into a minimal 16-bit PCM WAV file, the format
 * `tovu-speech-helper.swift`'s `SFSpeechURLRecognitionRequest` reads directly.
 *
 * This is the whole reason nothing like `ffmpeg` or a wav-encoding npm package was added: a
 * mono 16-bit PCM WAV is a fixed 44-byte header plus the raw samples, and the encoder is under 40
 * lines. Adding a dependency for this would cost more (install size, license review, supply-chain
 * surface) than it saves.
 */

const WAV_HEADER_BYTES = 44;
const BYTES_PER_SAMPLE = 2; // 16-bit PCM
const PCM_FORMAT_CODE = 1;
const CHANNEL_COUNT = 1; // mono — matches the recognizer's own expectation and halves upload size

/**
 * Converts one `Float32Array` of samples in `[-1, 1]` (the shape `AudioContext`/`AudioWorklet`
 * produce) into 16-bit signed PCM, clamping out-of-range values instead of wrapping them.
 *
 * @param {Float32Array} float32Samples
 * @returns {Int16Array}
 * @complexity O(n) in sample count.
 */
function float32ToInt16Pcm(float32Samples) {
  const int16Samples = new Int16Array(float32Samples.length);
  for (let i = 0; i < float32Samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, float32Samples[i]));
    int16Samples[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
  }
  return int16Samples;
}

/**
 * Builds the 44-byte canonical WAV/RIFF header for a mono 16-bit PCM stream of `sampleCount`
 * samples at `sampleRate`.
 *
 * @param {Object} args
 * @param {number} args.sampleCount
 * @param {number} args.sampleRate
 * @returns {Buffer} exactly {@link WAV_HEADER_BYTES} long.
 * @complexity O(1).
 */
function buildWavHeader({ sampleCount, sampleRate }) {
  const dataBytes = sampleCount * BYTES_PER_SAMPLE;
  const byteRate = sampleRate * CHANNEL_COUNT * BYTES_PER_SAMPLE;
  const blockAlign = CHANNEL_COUNT * BYTES_PER_SAMPLE;
  const header = Buffer.alloc(WAV_HEADER_BYTES);

  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16); // fmt chunk size
  header.writeUInt16LE(PCM_FORMAT_CODE, 20);
  header.writeUInt16LE(CHANNEL_COUNT, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(BYTES_PER_SAMPLE * 8, 34); // bits per sample
  header.write("data", 36, "ascii");
  header.writeUInt32LE(dataBytes, 40);

  return header;
}

/**
 * Encodes one mono recording into a complete WAV file buffer, ready to write to disk and hand to
 * the speech helper.
 *
 * @param {Object} args
 * @param {Float32Array|number[]} args.samples - Mono samples in `[-1, 1]`.
 * @param {number} args.sampleRate - In Hz (the recognizer accepts any rate; 16000 keeps the
 *   IPC payload small — see `speech-ipc.js`'s capture-side comment).
 * @returns {Buffer} a complete, playable WAV file.
 * @complexity O(n) in sample count.
 */
function encodeMonoWav({ samples, sampleRate }) {
  const float32Samples = samples instanceof Float32Array ? samples : Float32Array.from(samples);
  const pcm = float32ToInt16Pcm(float32Samples);
  const header = buildWavHeader({ sampleCount: pcm.length, sampleRate });
  const body = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  return Buffer.concat([header, body]);
}

export { encodeMonoWav, float32ToInt16Pcm, buildWavHeader, WAV_HEADER_BYTES };
