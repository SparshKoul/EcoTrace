import 'user.dart';

/// A persisted Supabase session: the user plus the Bearer access token the
/// backend requires on every authenticated route.
class AuthSession {
  const AuthSession({
    required this.user,
    required this.accessToken,
    this.refreshToken,
    this.expiresAt,
  });

  final User user;
  final String accessToken;
  final String? refreshToken;

  /// Supabase `expires_at` as a Unix timestamp in **seconds**, when provided.
  final int? expiresAt;

  factory AuthSession.fromJson(Map<String, dynamic> json) => AuthSession(
        user: User.fromJson(
          json['user'] is Map<String, dynamic>
              ? json['user'] as Map<String, dynamic>
              : json,
        ),
        accessToken: json['accessToken'] as String? ??
            json['access_token'] as String? ??
            '',
        refreshToken: json['refreshToken'] as String? ??
            json['refresh_token'] as String?,
        expiresAt: json['expiresAt'] as int? ?? json['expires_at'] as int?,
      );

  Map<String, dynamic> toJson() => {
        'user': user.toJson(),
        'accessToken': accessToken,
        if (refreshToken != null) 'refreshToken': refreshToken,
        if (expiresAt != null) 'expiresAt': expiresAt,
      };

  AuthSession copyWith({User? user}) => AuthSession(
        user: user ?? this.user,
        accessToken: accessToken,
        refreshToken: refreshToken,
        expiresAt: expiresAt,
      );

  bool get hasToken => accessToken.isNotEmpty;
}
