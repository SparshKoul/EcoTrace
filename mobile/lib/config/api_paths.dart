/// Route paths for the existing EcoTrace backend, relative to [ApiPaths.prefix].
///
/// These mirror the server's Fastify registrations in `backend/src/index.ts`.
/// Nothing here invents an endpoint — every path is read from the backend.
class ApiPaths {
  ApiPaths._();

  /// All feature routes are mounted under `/api`.
  static const String prefix = '/api';

  // --- Authentication (Supabase-backed) ---
  static const String signup = '$prefix/auth/signup';
  static const String login = '$prefix/auth/login';
  static const String me = '$prefix/auth/me';
  static const String signout = '$prefix/auth/signout';

  // --- v1 evidence pipeline (multipart upload + AI classification) ---
  static const String v1Reports = '$prefix/v1/reports';
  static const String v1Feed = '$prefix/v1/reports/feed';
  static const String v1Sites = '$prefix/v1/sites';
  static const String v1MyActivity = '$prefix/v1/users/me/activity';

  // --- Environmental statistics ---
  static String areas(String kind) => '$prefix/areas/$kind';

  // --- Health (mounted at the server root, not under /api) ---
  static const String health = '/health';
}
