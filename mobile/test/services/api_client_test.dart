import 'dart:async';
import 'dart:convert';

import 'package:ecotrace/models/api_exception.dart';
import 'package:ecotrace/models/auth_session.dart';
import 'package:ecotrace/models/user.dart';
import 'package:ecotrace/services/api_client.dart';
import 'package:ecotrace/services/token_storage.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';

/// Captures the request the client actually sent so tests can assert on
/// headers and body ordering.
class _Recorder {
  http.Request? last;

  MockClient call(http.Response Function(http.Request request) respond) {
    return MockClient((http.Request request) async {
      last = request;
      return respond(request);
    });
  }
}

http.Response _json(Object body, {int status = 200}) => http.Response(
      jsonEncode(body),
      status,
      headers: <String, String>{'content-type': 'application/json'},
    );

void main() {
  late _Recorder recorder;
  late InMemoryTokenStorage storage;
  late ApiClient client;

  setUp(() {
    recorder = _Recorder();
    storage = InMemoryTokenStorage();
  });

  tearDown(() => client.close());

  ApiClient build({String baseUrl = 'http://backend.test'}) {
    client = ApiClient(
      tokenStorage: storage,
      baseUrl: baseUrl,
      httpClient: recorder.call((_) => _json(<String, dynamic>{'ok': true})),
    );
    return client;
  }

  group('base URL', () {
    test('strips trailing slashes so paths never double up', () async {
      final ApiClient api = build(baseUrl: 'http://backend.test///');
      expect(api.baseUrl, 'http://backend.test');

      await api.getJson('/health');
      expect(recorder.last!.url.toString(), 'http://backend.test/health');
    });
  });

  group('authentication', () {
    test('sends a Bearer token when a session is stored', () async {
      await storage.saveSession(
        const AuthSession(
          user: User(id: 'u1', email: 'a@b.io'),
          accessToken: 'secret-token',
        ),
      );
      final ApiClient api = build();

      await api.getJson('/api/v1/users/me/activity');

      expect(recorder.last!.headers['Authorization'], 'Bearer secret-token');
      expect(recorder.last!.headers['Accept'], 'application/json');
    });

    test('omits the header for anonymous calls', () async {
      await storage.saveSession(
        const AuthSession(
          user: User(id: 'u1', email: 'a@b.io'),
          accessToken: 'secret-token',
        ),
      );
      final ApiClient api = build();

      await api.postJson('/api/auth/login', auth: false, body: <String, dynamic>{});

      expect(recorder.last!.headers.containsKey('Authorization'), isFalse);
      expect(recorder.last!.url.toString(), 'http://backend.test/api/auth/login');
    });

    test('omits the header when no session exists', () async {
      final ApiClient api = build();
      await api.getJson('/api/auth/me');
      expect(recorder.last!.headers.containsKey('Authorization'), isFalse);
    });
  });

  group('JSON requests', () {
    test('encodes the body and content type', () async {
      final ApiClient api = build();
      await api.postJson(
        '/api/auth/signup',
        auth: false,
        body: <String, dynamic>{'email': 'a@b.io', 'password': 'secret1'},
      );

      expect(
        recorder.last!.headers['Content-Type'],
        'application/json; charset=utf-8',
      );
      expect(
        jsonDecode(recorder.last!.body),
        <String, dynamic>{'email': 'a@b.io', 'password': 'secret1'},
      );
    });

    test('returns the decoded body on 2xx', () async {
      client = ApiClient(
        tokenStorage: storage,
        baseUrl: 'http://backend.test',
        httpClient: recorder.call(
          (_) => _json(<String, dynamic>{'accessToken': 'tok', 'id': 'u'}),
        ),
      );

      final Map<String, dynamic> body = await client.postJson('/api/auth/login');
      expect(body['accessToken'], 'tok');
    });
  });

  group('multipart requests', () {
    test('writes plain fields BEFORE the file part', () async {
      final ApiClient api = build();

      await api.postMultipart(
        '/api/v1/reports',
        fields: <String, String>{
          'media_type': 'photo',
          'lat': '12.9716',
          'lng': '77.5946',
          'accuracy': '8.5',
          'captured_at': '2026-11-12T14:30:00Z',
          'notes': 'outside the market',
        },
        file: const FileUpload(
          field: 'media',
          bytes: <int>[1, 2, 3, 4],
          filename: 'evidence.jpg',
          contentType: 'image/jpeg',
        ),
      );

      final String body = utf8.decode(recorder.last!.bodyBytes);

      final int latIndex = body.indexOf('name="lat"');
      final int notesIndex = body.indexOf('name="notes"');
      final int fileIndex = body.indexOf('name="media"');

      expect(latIndex, greaterThan(0), reason: 'lat field missing from body');
      expect(fileIndex, greaterThan(0), reason: 'file part missing from body');
      expect(
        latIndex,
        lessThan(fileIndex),
        reason: 'fields must precede the file so @fastify/multipart '
            'resolves request.file().fields with lat/lng/notes present',
      );
      expect(
        notesIndex,
        lessThan(fileIndex),
        reason: 'notes must precede the file part',
      );

      expect(recorder.last!.headers['Content-Type'], contains('multipart/form-data'));
      expect(body, contains('filename="evidence.jpg"'));
      expect(body, contains('Content-Type: image/jpeg'));
      expect(body, contains('12.9716'));
      expect(body, contains('outside the market'));
    });

    test('works without a file part', () async {
      final ApiClient api = build();
      await api.postMultipart(
        '/api/v1/reports',
        fields: <String, String>{'lat': '1'},
      );
      expect(utf8.decode(recorder.last!.bodyBytes), contains('name="lat"'));
    });

    test('attaches the Bearer token to uploads', () async {
      await storage.saveSession(
        const AuthSession(
          user: User(id: 'u1', email: 'a@b.io'),
          accessToken: 'upload-token',
        ),
      );
      final ApiClient api = build();
      await api.postMultipart('/api/v1/reports', fields: <String, String>{});
      expect(recorder.last!.headers['Authorization'], 'Bearer upload-token');
    });
  });

  group('error normalisation', () {
    test('throws ApiException with the backend code on 4xx', () async {
      client = ApiClient(
        tokenStorage: storage,
        baseUrl: 'http://backend.test',
        httpClient: recorder.call(
          (_) => _json(<String, dynamic>{'error': 'GPS_TOO_IMPRECISE'}, status: 400),
        ),
      );

      await expectLater(
        client.postMultipart('/api/v1/reports', fields: <String, String>{}),
        throwsA(
          isA<ApiException>()
              .having((ApiException e) => e.statusCode, 'statusCode', 400)
              .having((ApiException e) => e.code, 'code', 'GPS_TOO_IMPRECISE'),
        ),
      );
    });

    test('surfaces INVALID_TRASH as an AI rejection', () async {
      client = ApiClient(
        tokenStorage: storage,
        baseUrl: 'http://backend.test',
        httpClient: recorder.call(
          (_) => _json(
            <String, dynamic>{
              'error': 'INVALID_TRASH',
              'rejection_reason': 'Not waste.',
            },
            status: 422,
          ),
        ),
      );

      try {
        await client.postMultipart('/api/v1/reports', fields: <String, String>{});
        fail('expected an ApiException');
      } on ApiException catch (error) {
        expect(error.isAiRejected, isTrue);
        expect(error.message, 'Not waste.');
      }
    });

    test('maps 401 to an unauthorised ApiException', () async {
      client = ApiClient(
        tokenStorage: storage,
        baseUrl: 'http://backend.test',
        httpClient: recorder.call(
          (_) => _json(<String, dynamic>{'error': 'AUTHENTICATION_REQUIRED'}, status: 401),
        ),
      );

      try {
        await client.getJson('/api/auth/me');
        fail('expected an ApiException');
      } on ApiException catch (error) {
        expect(error.isUnauthorized, isTrue);
        expect(error.statusCode, 401);
      }
    });

    test('maps 503 to an AI-unavailable ApiException', () async {
      client = ApiClient(
        tokenStorage: storage,
        baseUrl: 'http://backend.test',
        httpClient: recorder.call(
          (_) => _json(<String, dynamic>{'error': 'AI_SERVICE_UNAVAILABLE'}, status: 503),
        ),
      );

      try {
        await client.postMultipart('/api/v1/reports', fields: <String, String>{});
        fail('expected an ApiException');
      } on ApiException catch (error) {
        expect(error.isAiUnavailable, isTrue);
      }
    });

    test('turns a transport failure into a status-0 ApiException', () async {
      client = ApiClient(
        tokenStorage: storage,
        baseUrl: 'http://backend.test',
        httpClient: MockClient((_) => throw http.ClientException('boom')),
      );

      try {
        await client.getJson('/health');
        fail('expected an ApiException');
      } on ApiException catch (error) {
        expect(error.isNetwork, isTrue);
        expect(error.statusCode, 0);
        expect(error.message, isNotEmpty);
      }
    });

    test('turns a timeout into a status-0 ApiException', () async {
      client = ApiClient(
        tokenStorage: storage,
        baseUrl: 'http://backend.test',
        httpClient: MockClient(
          (_) => Future<http.Response>.delayed(
            const Duration(seconds: 5),
            () => _json(<String, dynamic>{}),
          ),
        ),
      );

      try {
        await client.getJson('/health', timeout: const Duration(milliseconds: 50));
        fail('expected an ApiException');
      } on ApiException catch (error) {
        expect(error.statusCode, 0);
        expect(error.code, 'TIMEOUT');
      }
    });

    test('tolerates a non-JSON error body', () async {
      client = ApiClient(
        tokenStorage: storage,
        baseUrl: 'http://backend.test',
        httpClient: recorder.call(
          (_) => http.Response('<html>502 Bad Gateway</html>', 502),
        ),
      );

      try {
        await client.getJson('/health');
        fail('expected an ApiException');
      } on ApiException catch (error) {
        expect(error.statusCode, 502);
        expect(error.message, isNotEmpty);
      }
    });
  });

  group('isHealthy', () {
    test('returns true on a 200 from /health', () async {
      client = ApiClient(
        tokenStorage: storage,
        baseUrl: 'http://backend.test',
        httpClient: recorder.call((_) => _json(<String, dynamic>{'status': 'ok'})),
      );
      expect(await client.isHealthy(), isTrue);
      expect(recorder.last!.url.toString(), 'http://backend.test/health');
    });

    test('returns false when the server is unreachable', () async {
      client = ApiClient(
        tokenStorage: storage,
        baseUrl: 'http://backend.test',
        httpClient: MockClient((_) => throw http.ClientException('down')),
      );
      expect(await client.isHealthy(), isFalse);
    });
  });
}
