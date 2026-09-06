// Tovu's on-device speech-to-text helper: a bare command-line tool (no app bundle, no downloaded
// model) that hands one recorded WAV file to macOS's own `Speech` framework and prints the
// transcript as JSON. It exists so the desktop shell (`apps/desktop`, CommonJS/Node) never links
// Swift or the Speech framework directly — `mac-on-device-transcriber.cjs` just spawns this as a
// child process, the same shape `tovu-server.cjs` already uses for the `tovu serve` CLI.
//
// `requiresOnDeviceRecognition = true` on every request is the entire privacy contract: this
// helper refuses to fall back to network recognition. If on-device assets are not installed for
// the recognizer's locale, `check`/`transcribe` report that as a real failure (`ON_DEVICE_UNAVAILABLE`
// in `check`, a non-zero exit + JSON error in `transcribe`) rather than silently uploading audio —
// see `mac-on-device-transcriber.cjs`'s own header for why that is treated as a correctness bug,
// not a convenience, per the owner's explicit "no network fallback" directive.
//
// Two subcommands, both JSON-only on stdout so the Node side never scrapes prose:
//   check                    -> {"available":bool,"reason":string|null}
//   transcribe <path-to-wav> -> {"ok":true,"text":string,"elapsedMs":int}
//                             | {"ok":false,"error":string}
//
// Spike history: an earlier version of this same request shape (`../../../.claude/harness-tmp/...
// /voice-spike/transcribe-spike.swift`, not part of this repo) proved the approach against
// synthesized speech (`say`) before this file existed — see that spike's own comment for the
// run-loop-vs-semaphore pitfall this file already avoids (see `spinRunLoop` below).
import Foundation
import Speech

/// Spins the current run loop until `isDone()` returns true or `timeoutSeconds` elapses.
///
/// A bare CLI binary has a main thread but nothing pumping it. `SFSpeechRecognizer`'s callbacks
/// arrive via XPC, dispatched onto the main queue — blocking that thread on a `DispatchSemaphore`
/// starves the very queue the callback needs to run on, so it never fires and every call times
/// out (confirmed live during the spike: the semaphore-based first draft timed out at exactly its
/// own 30s ceiling on every run). Polling the run loop keeps the main queue alive between checks.
///
/// - Complexity: O(timeoutSeconds / 0.1) polls in the worst case; O(1) in the common case where
///   `isDone` flips within one or two polls.
func spinRunLoop(until isDone: () -> Bool, timeoutSeconds: TimeInterval) -> Bool {
    let deadline = Date().addingTimeInterval(timeoutSeconds)
    while !isDone() {
        if Date() > deadline { return false }
        RunLoop.current.run(mode: .default, before: Date().addingTimeInterval(0.1))
    }
    return true
}

/// Blocks (via `spinRunLoop`) until the process holds Speech Recognition authorization, or returns
/// the denied/restricted/undetermined status without prompting again.
///
/// - Returns: the resolved `SFSpeechRecognizerAuthorizationStatus`.
/// - Complexity: O(1) plus the OS's own authorization round-trip.
func resolveSpeechAuthorization() -> SFSpeechRecognizerAuthorizationStatus {
    var status: SFSpeechRecognizerAuthorizationStatus = .notDetermined
    var received = false
    SFSpeechRecognizer.requestAuthorization { result in
        status = result
        received = true
    }
    _ = spinRunLoop(until: { received }, timeoutSeconds: 15)
    return status
}

/// A short, JSON-safe string for an authorization status — used only in human-facing error text,
/// never parsed back by the Node side (which reads `available`/`ok` instead).
/// - Complexity: O(1).
func describeAuthStatus(_ status: SFSpeechRecognizerAuthorizationStatus) -> String {
    switch status {
    case .authorized: return "authorized"
    case .denied: return "denied"
    case .restricted: return "restricted"
    case .notDetermined: return "not-determined"
    @unknown default: return "unknown"
    }
}

/// Escapes the handful of characters that would otherwise break a hand-built JSON string literal.
/// A full JSON library is unwarranted for two fixed-shape, single-string payloads — see this file's
/// header for why nothing heavier than Foundation is linked here.
/// - Complexity: O(n) in `text`'s length.
func jsonEscape(_ text: String) -> String {
    var result = ""
    for scalar in text.unicodeScalars {
        switch scalar {
        case "\"": result += "\\\""
        case "\\": result += "\\\\"
        case "\n": result += "\\n"
        case "\r": result += "\\r"
        case "\t": result += "\\t"
        default:
            if scalar.value < 0x20 {
                result += String(format: "\\u%04x", scalar.value)
            } else {
                result.unicodeScalars.append(scalar)
            }
        }
    }
    return result
}

/// `check`: reports whether this machine can do on-device recognition right now, without touching
/// a microphone or any audio file — the cheap probe `mac-on-device-transcriber.cjs`'s
/// `isAvailable()` calls before ever rendering the mic affordance.
/// - Complexity: O(1) plus one authorization round-trip.
func runCheck() -> Never {
    let status = resolveSpeechAuthorization()
    guard status == .authorized else {
        print("{\"available\":false,\"reason\":\"speech-recognition-not-authorized:\(describeAuthStatus(status))\"}")
        exit(0)
    }
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")) else {
        print("{\"available\":false,\"reason\":\"no-recognizer-for-locale\"}")
        exit(0)
    }
    if !recognizer.supportsOnDeviceRecognition {
        print("{\"available\":false,\"reason\":\"on-device-recognition-unavailable\"}")
        exit(0)
    }
    print("{\"available\":true,\"reason\":null}")
    exit(0)
}

/// `transcribe <path>`: the real work — one on-device recognition pass over an already-recorded
/// WAV/AIFF/CAF file. Never falls back to network recognition (see `requiresOnDeviceRecognition`
/// below); any failure to use on-device recognition is reported as an error, not silently retried
/// over the network.
/// - Complexity: O(1) plus the recognizer's own cost, which scales with clip length.
func runTranscribe(path: String) -> Never {
    let status = resolveSpeechAuthorization()
    guard status == .authorized else {
        print("{\"ok\":false,\"error\":\"speech-recognition-not-authorized:\(describeAuthStatus(status))\"}")
        exit(1)
    }
    guard let recognizer = SFSpeechRecognizer(locale: Locale(identifier: "en-US")) else {
        print("{\"ok\":false,\"error\":\"no-recognizer-for-locale\"}")
        exit(1)
    }
    guard recognizer.supportsOnDeviceRecognition else {
        print("{\"ok\":false,\"error\":\"on-device-recognition-unavailable\"}")
        exit(1)
    }

    let request = SFSpeechURLRecognitionRequest(url: URL(fileURLWithPath: path))
    request.requiresOnDeviceRecognition = true
    request.shouldReportPartialResults = false

    let start = Date()
    var finalText: String?
    var finalError: Error?
    var finished = false
    let task = recognizer.recognitionTask(with: request) { result, error in
        if let error = error {
            finalError = error
            finished = true
            return
        }
        if let result = result, result.isFinal {
            finalText = result.bestTranscription.formattedString
            finished = true
        }
    }
    _ = task

    let completed = spinRunLoop(until: { finished }, timeoutSeconds: 30)
    let elapsedMs = Int(Date().timeIntervalSince(start) * 1000)

    if !completed {
        print("{\"ok\":false,\"error\":\"timed-out-after-\(elapsedMs)ms\"}")
        exit(1)
    }
    if let error = finalError {
        print("{\"ok\":false,\"error\":\"\(jsonEscape(error.localizedDescription))\"}")
        exit(1)
    }
    print("{\"ok\":true,\"text\":\"\(jsonEscape(finalText ?? ""))\",\"elapsedMs\":\(elapsedMs)}")
    exit(0)
}

let arguments = CommandLine.arguments
guard arguments.count > 1 else {
    print("{\"ok\":false,\"error\":\"usage: tovu-speech-helper check|transcribe <path>\"}")
    exit(2)
}

switch arguments[1] {
case "check":
    runCheck()
case "transcribe":
    guard arguments.count > 2 else {
        print("{\"ok\":false,\"error\":\"usage: tovu-speech-helper transcribe <path-to-audio-file>\"}")
        exit(2)
    }
    runTranscribe(path: arguments[2])
default:
    print("{\"ok\":false,\"error\":\"unknown subcommand: \(arguments[1])\"}")
    exit(2)
}
