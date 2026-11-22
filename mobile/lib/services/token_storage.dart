import 'dart:convert';

import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import '../models/auth_session.dart';

/// Persistence for the Supabase session.
///
/// The access token is a credential, so it is stored encrypted at rest on the
/// device. The interface exists so tests (and platforms without a keychain)
/// can substitute an in-memory implementation.
abstract class TokenStorage {
  Future<void> saveSession(AuthSession session);

  /// Returns the stored session, or `null` when none exists or it cannot be
  /// read.
  Future<AuthSession?> readSession();

  Future<void> clear();
}

/// Encrypted storage backed by the Android Keystore / iOS Keychain.
class SecureTokenStorage implements TokenStorage {
  SecureTokenStorage()
      : _storage = const FlutterSecureStorage(
          aOptions: AndroidOptions(encryptedSharedPreferences: true),
        );

  static const String _sessionKey = 'ecotrace.session';

  final FlutterSecureStorage _storage;

  @override
  Future<void> saveSession(AuthSession session) async {
    try {
      await _storage.write(
        key: _sessionKey,
        value: jsonEncode(session.toJson()),
      );
    } catch (_) {
      // Never let a storage failure crash sign-in; the session still lives in
      // memory for the rest of this run.
    }
  }

  @override
  Future<AuthSession?> readSession() async {
    try {
      final String? raw = await _storage.read(key: _sessionKey);
      if (raw == null || raw.isEmpty) return null;
      final dynamic decoded = jsonDecode(raw);
      if (decoded is! Map<String, dynamic>) return null;
      final AuthSession session = AuthSession.fromJson(decoded);
      return session.hasToken ? session : null;
    } catch (_) {
      return null;
    }
  }

  @override
  Future<void> clear() async {
    try {
      await _storage.delete(key: _sessionKey);
    } catch (_) {
      // Best-effort cleanup.
    }
  }
}

/// Non-persistent storage used by unit tests and as a safe fallback.
class InMemoryTokenStorage implements TokenStorage {
  AuthSession? _session;

  @override
  Future<void> saveSession(AuthSession session) async => _session = session;

  @override
  Future<AuthSession?> readSession() async => _session;

  @override
  Future<void> clear() async => _session = null;
}
