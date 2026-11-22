import 'dart:convert';

import 'package:ecotrace/models/api_exception.dart';
import 'package:ecotrace/models/auth_session.dart';
import 'package:ecotrace/models/user.dart';
import 'package:ecotrace/services/api_client.dart';
import 'package:ecotrace/services/auth_service.dart';
import 'package:ecotrace/services/token_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Minimal stand-in for the backend's `/api/auth/*` routes.
class _FakeAuthBackend {
  _FakeAuthBackend({this.meStatus = 200, this.failMeWith});

  final int meStatus;
  final ApiException? failMeWith;

  int calls = 0;
  final List<String> paths = <String>[];

  MockClient get client => MockClient((http.Request request) async {
        calls++;
        paths.add(request.url.path);

        if (failMeWith != null) throw failMeWith!;

        switch (request.url.path) {
          case '/api/auth/me':
            return http.Response(
              jsonEncode(<String, dynamic>{
                'id': 'u-42',
                'email': 'jane@example.com',
                'fullName': 'Jane Citizen',
              }),
              meStatus,
              headers: <String, String>{'content-type': 'application/json'},
            );
          case '/api/auth/login':
          case '/api/auth/signup':
            return http.Response(
              jsonEncode(<String, dynamic>{
                'id': 'u-42',
                'email': 'jane@example.com',
                'fullName': 'Jane Citizen',
                'accessToken': 'fresh-token',
                'refreshToken': 'refresh-token',
                'expiresAt': 1790000000,
              }),
              200,
              headers: <String, String>{'content-type': 'application/json'},
            );
          case '/api/auth/signout':
            return http.Response('{}', 200,
                headers: <String, String>{'content-type': 'application/json'});
          default:
            return http.Response(
              jsonEncode(<String, dynamic>{'error': 'NOT_FOUND'}),
              404,
              headers: <String, String>{'content-type': 'application/json'},
            );
        }
      });
}

void main() {
  late InMemoryTokenStorage storage;

  setUp(() => storage = InMemoryTokenStorage());

  AuthService build(AuthSession? seed, MockClient http) {
    final ApiClient api = ApiClient(
      tokenStorage: storage,
      baseUrl: 'http://backend.test',
      httpClient: http,
    );
    return AuthService(api: api, tokenStorage: storage);
  }

  group('signIn', () {
    test('persists the returned session', () async {
      final AuthService auth = build(null, _FakeAuthBackend().client);

      final AuthSession session =
          await auth.signIn(email: ' jane@example.com ', password: 'secret1');

      expect(session.accessToken, 'fresh-token');
      expect(session.user.id, 'u-42');
      expect(session.hasToken, isTrue);

      final AuthSession? stored = await storage.readSession();
      expect(stored, isNotNull);
      expect(stored!.accessToken, 'fresh-token');
      expect(stored.user.email, 'jane@example.com');
    });

    test('trims the email before sending it', () async {
      String? sentEmail;
      final AuthService auth = build(
        null,
        MockClient((http.Request request) async {
          final Map<String, dynamic> body =
              jsonDecode(request.body) as Map<String, dynamic>;
          sentEmail = body['email'] as String?;
          return http.Response(
            jsonEncode(<String, dynamic>{
              'id': 'u-42',
              'email': 'jane@example.com',
              'accessToken': 'fresh-token',
            }),
            200,
            headers: <String, String>{'content-type': 'application/json'},
          );
        }),
      );

      await auth.signIn(email: '  jane@example.com  ', password: 'secret1');

      expect(sentEmail, 'jane@example.com');
    });

    test('surfaces the backend error instead of returning a session', () async {
      final AuthService auth = build(
        null,
        MockClient(
          (_) async => http.Response(
            jsonEncode(<String, dynamic>{
              'error': 'INVALID_CREDENTIALS',
              'message': 'Email or password is incorrect',
            }),
            401,
            headers: <String, String>{'content-type': 'application/json'},
          ),
        ),
      );

      await expectLater(
        auth.signIn(email: 'a@b.io', password: 'wrong'),
        throwsA(
          isA<ApiException>().having(
            (ApiException e) => e.message,
            'message',
            'Email or password is incorrect',
          ),
        ),
      );
      expect(await storage.readSession(), isNull);
    });

    test('rejects a 200 that carries no token', () async {
      final AuthService auth = build(
        null,
        MockClient(
          (_) async => http.Response(
            jsonEncode(<String, dynamic>{'id': 'u', 'email': 'a@b.io'}),
            200,
            headers: <String, String>{'content-type': 'application/json'},
          ),
        ),
      );

      await expectLater(
        auth.signIn(email: 'a@b.io', password: 'secret1'),
        throwsA(isA<ApiException>()),
      );
    });
  });

  group('signUp', () {
    test('sends fullName only when provided', () async {
      final AuthService auth = build(null, _FakeAuthBackend().client);
      final AuthSession session = await auth.signUp(
        email: 'jane@example.com',
        password: 'secret1',
        fullName: 'Jane Citizen',
      );
      expect(session.accessToken, 'fresh-token');
      expect(await storage.readSession(), isNotNull);
    });

    test('works without a fullName (backend derives one)', () async {
      final AuthService auth = build(null, _FakeAuthBackend().client);
      final AuthSession session =
          await auth.signUp(email: 'jane@example.com', password: 'secret1');
      expect(session.hasToken, isTrue);
    });
  });

  group('restore', () {
    test('returns null immediately when nothing is stored', () async {
      final _FakeAuthBackend backend = _FakeAuthBackend();
      final AuthService auth = build(null, backend.client);

      expect(await auth.restore(), isNull);
      expect(backend.calls, 0, reason: 'must not hit the network with no session');
    });

    test('revalidates a stored token against /api/auth/me', () async {
      final _FakeAuthBackend backend = _FakeAuthBackend();
      await storage.saveSession(
        const AuthSession(
          user: User(id: 'old', email: 'jane@example.com'),
          accessToken: 'stored-token',
        ),
      );
      final AuthService auth = build(null, backend.client);

      final AuthSession? restored = await auth.restore();

      expect(restored, isNotNull);
      expect(restored!.user.id, 'u-42', reason: 'profile should be refreshed');
      expect(restored.user.fullName, 'Jane Citizen');
      expect(restored.accessToken, 'stored-token');
      expect(backend.paths, contains('/api/auth/me'));

      final AuthSession? stored = await storage.readSession();
      expect(stored!.user.id, 'u-42');
    });

    test('clears the session and returns null on 401', () async {
      await storage.saveSession(
        const AuthSession(
          user: User(id: 'old', email: 'a@b.io'),
          accessToken: 'expired-token',
        ),
      );
      final AuthService auth = build(
        null,
        MockClient(
          (_) async => http.Response(
            jsonEncode(<String, dynamic>{'error': 'AUTHENTICATION_REQUIRED'}),
            401,
            headers: <String, String>{'content-type': 'application/json'},
          ),
        ),
      );

      expect(await auth.restore(), isNull);
      expect(await storage.readSession(), isNull, reason: 'stale token must be dropped');
    });

    test('keeps the cached session when the network is down', () async {
      const AuthSession cached = AuthSession(
        user: User(id: 'u9', email: 'offline@b.io'),
        accessToken: 'offline-token',
      );
      await storage.saveSession(cached);
      final AuthService auth = build(
        null,
        MockClient((_) async => throw http.ClientException('no route to host')),
      );

      final AuthSession? restored = await auth.restore();

      expect(restored, isNotNull, reason: 'a flaky connection must not log the user out');
      expect(restored!.accessToken, 'offline-token');
      expect(await storage.readSession(), isNotNull);
    });

    test('keeps the cached session on a 5xx', () async {
      const AuthSession cached = AuthSession(
        user: User(id: 'u9', email: 'a@b.io'),
        accessToken: 'tok',
      );
      await storage.saveSession(cached);
      final AuthService auth = build(
        null,
        MockClient(
          (_) async => http.Response('oops', 500),
        ),
      );

      expect(await auth.restore(), isNotNull);
      expect(await storage.readSession(), isNotNull);
    });

    test('treats a stored empty token as no session', () async {
      await storage.saveSession(
        const AuthSession(user: User(id: 'u', email: 'a@b.io'), accessToken: ''),
      );
      final _FakeAuthBackend backend = _FakeAuthBackend();
      final AuthService auth = build(null, backend.client);

      expect(await auth.restore(), isNull);
      expect(backend.calls, 0);
    });
  });

  group('signOut', () {
    test('clears the local session even when the server call fails', () async {
      await storage.saveSession(
        const AuthSession(
          user: User(id: 'u', email: 'a@b.io'),
          accessToken: 'tok',
        ),
      );
      final AuthService auth = build(
        null,
        MockClient((_) async => throw http.ClientException('offline')),
      );

      await auth.signOut();

      expect(await storage.readSession(), isNull);
    });

    test('clears the local session after a successful revoke', () async {
      await storage.saveSession(
        const AuthSession(
          user: User(id: 'u', email: 'a@b.io'),
          accessToken: 'tok',
        ),
      );
      final _FakeAuthBackend backend = _FakeAuthBackend();
      final AuthService auth = build(null, backend.client);

      await auth.signOut();

      expect(await storage.readSession(), isNull);
      expect(backend.paths, contains('/api/auth/signout'));
    });
  });

  group('me', () {
    test('parses the profile', () async {
      final AuthService auth = build(null, _FakeAuthBackend().client);
      final User user = await auth.me();
      expect(user.id, 'u-42');
      expect(user.displayName, 'Jane Citizen');
    });
  });
}
