import 'package:flutter/foundation.dart';

import '../models/api_exception.dart';
import '../models/auth_session.dart';
import '../models/user.dart';
import '../services/auth_service.dart';
import 'app_change_notifier.dart';

/// Lifecycle of the authentication state.
enum AuthStatus {
  /// Restoring a persisted session on cold start.
  unknown,

  /// No valid session — show login/register.
  unauthenticated,

  /// A valid session exists — show the app shell.
  authenticated,
}

/// Owns the session: restores it on launch, exposes sign-in/sign-up/sign-out,
/// and surfaces the backend's error messages.
class AuthProvider extends AppChangeNotifier {
  AuthProvider({required this._authService});

  final AuthService _authService;

  AuthStatus _status = AuthStatus.unknown;
  AuthSession? _session;
  String? _error;
  bool _busy = false;

  AuthStatus get status => _status;
  AuthSession? get session => _session;
  User? get user => _session?.user;
  String? get error => _error;
  bool get busy => _busy;
  bool get isAuthenticated => _status == AuthStatus.authenticated;

  /// Called once from app bootstrap: restores any persisted session.
  Future<void> bootstrap() async {
    final AuthSession? restored = await _authService.restore();
    if (restored != null) {
      _session = restored;
      _status = AuthStatus.authenticated;
    } else {
      _session = null;
      _status = AuthStatus.unauthenticated;
    }
    notify();
  }

  Future<bool> signIn({required String email, required String password}) =>
      _run(() async {
        final AuthSession session = await _authService.signIn(
          email: email,
          password: password,
        );
        _session = session;
        _status = AuthStatus.authenticated;
      });

  Future<bool> signUp({
    required String email,
    required String password,
    String? fullName,
  }) =>
      _run(() async {
        final AuthSession session = await _authService.signUp(
          email: email,
          password: password,
          fullName: fullName,
        );
        _session = session;
        _status = AuthStatus.authenticated;
      });

  Future<void> signOut() async {
    _busy = true;
    _error = null;
    notify();
    await _authService.signOut();
    _session = null;
    _status = AuthStatus.unauthenticated;
    _busy = false;
    notify();
  }

  void clearError() {
    if (_error != null) {
      _error = null;
      notify();
    }
  }

  /// Runs [action] with consistent busy/error handling. Returns `true` on
  /// success.
  Future<bool> _run(Future<void> Function() action) async {
    _busy = true;
    _error = null;
    notify();
    try {
      await action();
      return true;
    } on ApiException catch (error) {
      _error = error.message;
      return false;
    } catch (error) {
      _error = 'Something went wrong. Please try again.';
      debugPrint('Auth failure: $error');
      return false;
    } finally {
      _busy = false;
      notify();
    }
  }
}
