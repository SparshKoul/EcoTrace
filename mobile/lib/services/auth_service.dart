import '../config/api_paths.dart';
import '../models/api_exception.dart';
import '../models/auth_session.dart';
import '../models/user.dart';
import 'api_client.dart';
import 'token_storage.dart';

/// Talks to the existing Supabase-backed auth routes (`backend/src/routes/auth.ts`).
///
/// Credentials never touch this app's storage — the backend returns a Supabase
/// access token which is persisted via [TokenStorage].
class AuthService {
  AuthService({
    required this._api,
    required this._tokenStorage,
  });

  final ApiClient _api;
  final TokenStorage _tokenStorage;

  /// `POST /api/auth/signup` — creates the account and returns a session.
  Future<AuthSession> signUp({
    required String email,
    required String password,
    String? fullName,
  }) async {
    final Map<String, dynamic> body = await _api.postJson(
      ApiPaths.signup,
      auth: false,
      body: <String, dynamic>{
        'email': email.trim(),
        'password': password,
        if (fullName != null && fullName.trim().isNotEmpty)
          'fullName': fullName.trim(),
      },
    );
    return _persist(body);
  }

  /// `POST /api/auth/login`.
  Future<AuthSession> signIn({
    required String email,
    required String password,
  }) async {
    final Map<String, dynamic> body = await _api.postJson(
      ApiPaths.login,
      auth: false,
      body: <String, dynamic>{'email': email.trim(), 'password': password},
    );
    return _persist(body);
  }

  /// `GET /api/auth/me` — validates the current token and refreshes the
  /// profile. Throws [ApiException] when the session is no longer valid.
  Future<User> me() async {
    final Map<String, dynamic> body = await _api.getJson(ApiPaths.me);
    return User.fromJson(body);
  }

  /// `POST /api/auth/signout` — server-side revocation, then local cleanup.
  /// Local state is always cleared even when the server call fails.
  Future<void> signOut() async {
    try {
      await _api.postJson(ApiPaths.signout, body: <String, dynamic>{});
    } catch (_) {
      // Best effort: clear locally regardless.
    } finally {
      await _tokenStorage.clear();
    }
  }

  /// Restores a persisted session on app start.
  ///
  ///  * no stored token          -> `null` (show login)
  ///  * token + `/auth/me` OK    -> refreshed [AuthSession]
  ///  * 401/403                  -> cleared, `null` (expired/foreign account)
  ///  * network failure          -> keep the cached session so a flaky
  ///    connection does not silently log the user out
  Future<AuthSession?> restore() async {
    final AuthSession? cached = await _tokenStorage.readSession();
    if (cached == null || !cached.hasToken) return null;

    try {
      final User user = await me();
      final AuthSession refreshed = cached.copyWith(user: user);
      await _tokenStorage.saveSession(refreshed);
      return refreshed;
    } on ApiException catch (error) {
      if (error.isUnauthorized) {
        await _tokenStorage.clear();
        return null;
      }
      // Offline or server down: keep the cached identity.
      return cached;
    }
  }

  AuthSession _persist(Map<String, dynamic> body) {
    final AuthSession session = AuthSession.fromJson(body);
    if (!session.hasToken) {
      throw const ApiException(
        statusCode: 500,
        message: 'The server did not return a session token.',
      );
    }
    // Fire-and-forget persistence; the caller proceeds with the in-memory
    // session regardless of whether the secure store accepted it.
    _tokenStorage.saveSession(session);
    return session;
  }
}
