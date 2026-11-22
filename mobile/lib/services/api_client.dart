import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:http/http.dart' as http;
import 'package:http_parser/http_parser.dart';

import '../config/app_config.dart';
import '../models/api_exception.dart';
import 'token_storage.dart';

/// Descriptor for one uploaded file part, kept independent of `package:http`
/// so service code stays free of transport types.
class FileUpload {
  const FileUpload({
    required this.field,
    required this.bytes,
    required this.filename,
    required this.contentType,
  });

  final String field;
  final List<int> bytes;
  final String filename;

  /// MIME type sent as the part's `Content-Type`, e.g. `image/jpeg`.
  final String contentType;
}

/// The single place every backend request flows through.
///
/// Responsibilities:
///  * resolve the base URL from build-time configuration
///  * attach the Bearer token from [TokenStorage] on authenticated calls
///  * encode JSON and multipart bodies — plain fields are written **before**
///    the file part so `@fastify/multipart`'s `request.file().fields`
///    contains them when the first file part is resolved
///  * normalise every failure — transport, timeout, HTTP and decode — into an
///    [ApiException]
class ApiClient {
  ApiClient({
    required this._tokenStorage,
    String? baseUrl,
    http.Client? httpClient,
  })  : baseUrl =
            (baseUrl ?? AppConfig.apiBaseUrl).replaceFirst(RegExp(r'/+$'), ''),
        _http = httpClient ?? http.Client();

  final TokenStorage _tokenStorage;
  final http.Client _http;

  /// Root of the backend, without a trailing slash.
  final String baseUrl;

  Uri _uri(String path) => Uri.parse('$baseUrl$path');

  Future<Map<String, String>> _headers({required bool auth}) async {
    final Map<String, String> headers = <String, String>{
      'Accept': 'application/json',
    };
    if (auth) {
      final String token =
          (await _tokenStorage.readSession())?.accessToken ?? '';
      if (token.isNotEmpty) headers['Authorization'] = 'Bearer $token';
    }
    return headers;
  }

  Future<Map<String, dynamic>> getJson(
    String path, {
    bool auth = true,
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final http.Request request = http.Request('GET', _uri(path));
    request.headers.addAll(await _headers(auth: auth));
    return _send(request, timeout: timeout, fallback: 'Request failed.');
  }

  Future<Map<String, dynamic>> postJson(
    String path, {
    Map<String, dynamic>? body,
    bool auth = true,
    Duration timeout = const Duration(seconds: 20),
  }) async {
    final http.Request request = http.Request('POST', _uri(path));
    request.headers.addAll(await _headers(auth: auth));
    request.headers['Content-Type'] = 'application/json; charset=utf-8';
    if (body != null) request.body = jsonEncode(body);
    return _send(request, timeout: timeout, fallback: 'Request failed.');
  }

  /// Sends a `multipart/form-data` request.
  ///
  /// Plain fields are appended first and the file last, which guarantees the
  /// backend can read `lat`, `lng`, `notes`, etc. from `part.fields`.
  Future<Map<String, dynamic>> postMultipart(
    String path, {
    required Map<String, String> fields,
    FileUpload? file,
    bool auth = true,
    Duration timeout = const Duration(seconds: 90),
  }) async {
    final http.MultipartRequest request =
        http.MultipartRequest('POST', _uri(path));
    request.headers.addAll(await _headers(auth: auth));

    request.fields.addAll(fields);

    if (file != null) {
      request.files.add(
        http.MultipartFile.fromBytes(
          file.field,
          file.bytes,
          filename: file.filename,
          contentType: MediaType.parse(file.contentType),
        ),
      );
    }

    return _send(request, timeout: timeout, fallback: 'Upload failed.');
  }

  /// Sends the request, decodes the body and maps failures to [ApiException].
  Future<Map<String, dynamic>> _send(
    http.BaseRequest request, {
    required Duration timeout,
    required String fallback,
  }) async {
    try {
      final http.StreamedResponse streamed =
          await _http.send(request).timeout(timeout);
      final http.Response response =
          await http.Response.fromStream(streamed).timeout(timeout);
      return _interpret(response, fallback);
    } on ApiException {
      rethrow;
    } on TimeoutException {
      throw ApiException(
        statusCode: 0,
        message: 'The server took too long to respond. Please try again.',
        code: 'TIMEOUT',
      );
    } on SocketException {
      throw const ApiException(
        statusCode: 0,
        message:
            'Could not reach the server. Check your connection and the API base URL.',
        code: 'NETWORK',
      );
    } on http.ClientException {
      throw ApiException(statusCode: 0, message: _networkMessage(), code: 'NETWORK');
    } catch (cause) {
      throw ApiException(
        statusCode: 0,
        message: cause is FormatException
            ? 'The server returned an unexpected response.'
            : _networkMessage(),
        code: 'NETWORK',
      );
    }
  }

  Map<String, dynamic> _interpret(http.Response response, String fallback) {
    final Map<String, dynamic> body = _decode(response.body);
    if (response.statusCode >= 200 && response.statusCode < 300) {
      return body;
    }
    throw ApiException.fromBody(response.statusCode, body, fallback);
  }

  static Map<String, dynamic> _decode(String raw) {
    if (raw.isEmpty) return <String, dynamic>{};
    try {
      final dynamic decoded = jsonDecode(raw);
      if (decoded is Map<String, dynamic>) return decoded;
      return <String, dynamic>{'data': decoded};
    } catch (_) {
      return <String, dynamic>{};
    }
  }

  static String _networkMessage() =>
      'Network error. Please check your connection and try again.';

  /// Closes the underlying HTTP client (tests / shutdown).
  void close() => _http.close();

  /// Convenience: the health probe mounted at the server root.
  Future<bool> isHealthy() async {
    try {
      await getJson('/health',
          auth: false, timeout: const Duration(seconds: 6));
      return true;
    } catch (_) {
      return false;
    }
  }
}
