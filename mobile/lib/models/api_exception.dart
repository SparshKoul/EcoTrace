/// A typed failure produced by [ApiClient] for any non-2xx or unreadable
/// backend response. Carries the HTTP status, the backend's machine-readable
/// `error` code when present, and a human-facing message.
class ApiException implements Exception {
  const ApiException({
    required this.statusCode,
    required this.message,
    this.code,
    this.rejectionReason,
    this.details,
  });

  final int statusCode;

  /// Human-readable message, preferring the most specific server field.
  final String message;

  /// The backend's `error` discriminator (e.g. `INVALID_TRASH`,
  /// `GPS_TOO_IMPRECISE`, `AUTHENTICATION_REQUIRED`).
  final String? code;

  /// AI rejection detail for `INVALID_TRASH` responses.
  final String? rejectionReason;

  final Map<String, dynamic>? details;

  bool get isUnauthorized => statusCode == 401 || statusCode == 403;
  bool get isNetwork => statusCode == 0;
  bool get isAiRejected => code == 'INVALID_TRASH' || statusCode == 422;
  bool get isAiUnavailable => code == 'AI_SERVICE_UNAVAILABLE' || statusCode == 503;

  /// Builds an exception from a decoded JSON body (may be empty).
  factory ApiException.fromBody(
    int statusCode,
    Map<String, dynamic> body,
    String fallback,
  ) {
    final dynamic error = body['error'];
    final String? code = error is String ? error : null;

    String message = fallback;
    if (body['rejection_reason'] is String) {
      message = body['rejection_reason'] as String;
    } else if (body['message'] is String) {
      message = body['message'] as String;
    } else if (error is String && !_looksLikeCode(error)) {
      message = error;
    } else if (code != null) {
      message = _friendly(code, fallback);
    }

    return ApiException(
      statusCode: statusCode,
      message: message,
      code: code,
      rejectionReason: body['rejection_reason'] is String
          ? body['rejection_reason'] as String
          : null,
      details: body['details'] is Map<String, dynamic>
          ? body['details'] as Map<String, dynamic>
          : null,
    );
  }

  static bool _looksLikeCode(String value) =>
      value.toUpperCase() == value && value.contains('_');

  static String _friendly(String code, String fallback) {
    switch (code) {
      case 'AUTHENTICATION_REQUIRED':
        return 'Please sign in to continue.';
      case 'MEDIA_REQUIRED':
        return 'A photo is required to file a report.';
      case 'INVALID_COORDINATES':
        return 'Your GPS coordinates were not valid. Please try again.';
      case 'GPS_TOO_IMPRECISE':
        return 'Your GPS fix is too imprecise. Move to an open area and retry.';
      case 'AI_SERVICE_UNAVAILABLE':
        return 'The AI classifier is temporarily unavailable. Please retry shortly.';
      case 'INVALID_TRASH':
        return 'This image was not accepted as outdoor waste.';
      default:
        return fallback;
    }
  }

  @override
  String toString() => 'ApiException($statusCode, $code): $message';
}
