/// Client-side input validation that mirrors the backend's Zod schemas in
/// `backend/src/routes/auth.ts` so errors match what the server would return.
class Validators {
  Validators._();

  static final RegExp _email = RegExp(r'^[\w.+-]+@[\w-]+(\.[\w-]+)+$');

  static String? email(String? value) {
    final String trimmed = value?.trim() ?? '';
    if (trimmed.isEmpty) return 'Email is required';
    if (!_email.hasMatch(trimmed)) return 'Enter a valid email address';
    return null;
  }

  /// Backend enforces `min(6)`.
  static String? password(String? value) {
    final String raw = value ?? '';
    if (raw.isEmpty) return 'Password is required';
    if (raw.length < 6) return 'Password must be at least 6 characters';
    return null;
  }

  /// Sign-up confirmation field (client-side only).
  static String? confirmPassword(String? value, String password) {
    if (value != password) return 'Passwords do not match';
    return null;
  }

  /// Backend enforces `max(120)`; empty is allowed (it becomes a fallback
  /// display name from the email).
  static String? fullName(String? value) {
    final String trimmed = value?.trim() ?? '';
    if (trimmed.length > 120) return 'Name must be 120 characters or fewer';
    return null;
  }

  /// Report description: backend accepts a free-text note, no hard limit
  /// beyond the form field. Keeps the UI sane.
  static String? note(String? value) {
    if ((value ?? '').length > 1000) return 'Keep the note under 1000 characters';
    return null;
  }
}
