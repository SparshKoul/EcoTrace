/// The authenticated EcoTrace account, mirroring the backend's `AuthUser`
/// shape returned by `/api/auth/me` and embedded in sign-in/sign-up results.
class User {
  const User({
    required this.id,
    required this.email,
    this.fullName,
  });

  final String id;
  final String email;
  final String? fullName;

  /// Display name: the profile's full name, falling back to the email's local
  /// part so the UI never renders an empty header.
  String get displayName {
    final String? name = fullName?.trim();
    if (name != null && name.isNotEmpty) return name;
    final int at = email.indexOf('@');
    return at > 0 ? email.substring(0, at) : email;
  }

  factory User.fromJson(Map<String, dynamic> json) => User(
        id: _string(json['id']) ?? '',
        email: _string(json['email']) ?? '',
        fullName: _string(json['fullName']) ?? _string(json['full_name']),
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'email': email,
        if (fullName != null) 'fullName': fullName,
      };

  static String? _string(dynamic value) =>
      value is String && value.isNotEmpty ? value : null;

  @override
  bool operator ==(Object other) =>
      other is User && other.id == id && other.email == email;

  @override
  int get hashCode => Object.hash(id, email);
}
