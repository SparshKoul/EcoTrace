/// Build-time configuration for the EcoTrace mobile app.
///
/// The backend base URL is injected with `--dart-define` so the same binary
/// logic works across the Android emulator (where `10.0.2.2` maps to the host
/// loopback), a physical device on the same LAN (use the machine's LAN IP), and
/// a deployed server (use the public HTTPS origin).
///
/// ```bash
/// # Android emulator (default).
/// flutter run
///
/// # Physical device / LAN backend.
/// flutter run --dart-define=API_BASE_URL=http://192.168.1.20:8000
///
/// # Or from a JSON file (Flutter 3.7+).
/// flutter run --dart-define-from-file=env.local.json
/// ```
class AppConfig {
  AppConfig._();

  /// Root of the existing EcoTrace backend (Fastify, port 8000 by default).
  ///
  /// Defaults to the Android emulator's alias for the host machine's loopback.
  /// A physical device must override this with the machine's LAN IP — the
  /// default is intentionally *not* `localhost`, which would resolve to the
  /// phone itself and never reach the backend.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://10.0.2.2:8000',
  );

  /// The AI pipeline runs synchronously inside the report request, so the
  /// receive window is generous to allow Gemini + OpenCV processing.
  static const Duration connectTimeout = Duration(seconds: 15);
  static const Duration receiveTimeout = Duration(seconds: 90);

  /// FR-1.2: submissions are blocked without a GPS fix at least this accurate.
  static const double gpsMaxAccuracyM = 30;

  /// FR-1.2: a fix older than this is considered stale.
  static const Duration gpsMaxAge = Duration(minutes: 2);

  /// FR-2.2: PostGIS merge radius used server-side; surfaced for copy only.
  static const double siteMergeRadiusM = 20;

  /// FR-2.5: scorecards stay hidden until this many distinct reporters.
  static const int minVerifiedReports = 10;

  /// Downscale captured photos before upload to stay well under the backend's
  /// 12 MB multipart limit and to keep uploads fast on mobile networks.
  static const double captureMaxWidth = 1600;
  static const int captureJpegQuality = 85;

  /// Resolves a media path from the backend against the configured base URL.
  ///
  /// The server returns either an absolute CDN URL (Supabase Storage) or a
  /// root-relative path such as `/public/<id>.jpg`. Relative paths are served
  /// by the backend's static `/public/` mount, so they need the origin
  /// prefixed; absolute URLs are returned untouched.
  static String absoluteUrl(String? url) {
    if (url == null || url.trim().isEmpty) return '';
    final String trimmed = url.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    return '$apiBaseUrl${trimmed.startsWith('/') ? '' : '/'}$trimmed';
  }
}
