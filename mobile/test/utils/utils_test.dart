import 'package:ecotrace/utils/formatters.dart';
import 'package:ecotrace/utils/validators.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('Validators.email', () {
    test('rejects empty and malformed addresses', () {
      expect(Validators.email(null), 'Email is required');
      expect(Validators.email(''), 'Email is required');
      expect(Validators.email('   '), 'Email is required');
      expect(Validators.email('nope'), 'Enter a valid email address');
      expect(Validators.email('a@b'), 'Enter a valid email address');
      expect(Validators.email('a @b.io'), 'Enter a valid email address');
    });

    test('accepts common valid addresses', () {
      expect(Validators.email('jane@example.com'), isNull);
      expect(Validators.email('  jane+tag@sub.example.co.uk '), isNull);
    });
  });

  group('Validators.password', () {
    test('mirrors the backend minimum of 6 characters', () {
      expect(Validators.password(null), 'Password is required');
      expect(Validators.password(''), 'Password is required');
      expect(Validators.password('12345'), 'Password must be at least 6 characters');
      expect(Validators.password('123456'), isNull);
    });
  });

  group('Validators.confirmPassword', () {
    test('requires an exact match', () {
      expect(Validators.confirmPassword('abc', 'abc'), isNull);
      expect(Validators.confirmPassword('abc', 'abd'), 'Passwords do not match');
      expect(Validators.confirmPassword(null, ''), isNull);
    });
  });

  group('Validators.fullName', () {
    test('is optional but bounded at 120 characters', () {
      expect(Validators.fullName(null), isNull);
      expect(Validators.fullName(''), isNull);
      expect(Validators.fullName('Jane'), isNull);
      expect(Validators.fullName('x' * 120), isNull);
      expect(Validators.fullName('x' * 121), 'Name must be 120 characters or fewer');
    });
  });

  group('Validators.note', () {
    test('caps the report note at 1000 characters', () {
      expect(Validators.note(null), isNull);
      expect(Validators.note('x' * 1000), isNull);
      expect(Validators.note('x' * 1001), 'Keep the note under 1000 characters');
    });
  });

  group('Formatters.date', () {
    test('formats a known instant in local time', () {
      final String formatted = Formatters.date('2026-11-12T14:30:00Z');
      // The test machine's zone shifts the wall clock, so assert the shape
      // rather than a fixed hour.
      expect(formatted, matches(RegExp(r'^\d{1,2} Nov 2026, \d{1,2}:\d{2} (AM|PM)$')));
    });

    test('handles midnight and noon correctly', () {
      final DateTime midnight = DateTime(2026, 11, 12, 0, 5);
      final DateTime noon = DateTime(2026, 11, 12, 12, 0);
      expect(Formatters.date(midnight.toIso8601String()), contains('12:05 AM'));
      expect(Formatters.date(noon.toIso8601String()), contains('12:00 PM'));
    });

    test('renders an em dash for unparseable input', () {
      expect(Formatters.date(null), '—');
      expect(Formatters.date(''), '—');
      expect(Formatters.date('not-a-date'), '—');
    });
  });

  group('Formatters.dateShort', () {
    test('renders day, month and year only', () {
      expect(
        Formatters.dateShort('2026-01-05T00:00:00Z'),
        matches(RegExp(r'^\d{1,2} Jan 2026$')),
      );
      expect(Formatters.dateShort(null), '—');
    });
  });

  group('Formatters.relative', () {
    test('buckets recent timestamps', () {
      final DateTime now = DateTime.now();
      expect(Formatters.relative(now.toIso8601String()), 'just now');
      expect(
        Formatters.relative(now.subtract(const Duration(minutes: 5)).toIso8601String()),
        '5m ago',
      );
      expect(
        Formatters.relative(now.subtract(const Duration(hours: 3)).toIso8601String()),
        '3h ago',
      );
      expect(
        Formatters.relative(now.subtract(const Duration(days: 4)).toIso8601String()),
        '4d ago',
      );
    });

    test('falls back to a short date beyond a week', () {
      final String old =
          Formatters.relative(DateTime.now().subtract(const Duration(days: 30)).toIso8601String());
      expect(old, matches(RegExp(r'^\d{1,2} \w{3} \d{4}$')));
    });

    test('treats future timestamps as their date', () {
      final String future =
          Formatters.relative(DateTime.now().add(const Duration(days: 2)).toIso8601String());
      expect(future, matches(RegExp(r'^\d{1,2} \w{3} \d{4}$')));
      expect(Formatters.relative(null), '—');
    });
  });

  group('Formatters.category', () {
    test('maps every AI enum to a human label', () {
      expect(Formatters.category('wet_organic'), 'Wet / organic');
      expect(Formatters.category('dry_plastic_paper'), 'Plastic / paper');
      expect(Formatters.category('sanitary_biomedical'), 'Sanitary / biomedical');
      expect(Formatters.category('special_care_ewaste_hazardous'), 'E-waste / hazardous');
      expect(Formatters.category('construction_debris'), 'Construction debris');
      expect(Formatters.category('mixed_municipal'), 'Mixed municipal');
      expect(Formatters.category('none'), 'Not waste');
    });

    test('degrades gracefully for unknown or missing values', () {
      expect(Formatters.category(null), 'Unclassified');
      expect(Formatters.category(''), 'Unclassified');
      expect(Formatters.category('something_new'), 'something new');
    });
  });

  group('Formatters.status', () {
    test('maps report statuses', () {
      expect(Formatters.status('verified'), 'Verified');
      expect(Formatters.status('needs_review'), 'Needs review');
      expect(Formatters.status('cleaned'), 'Cleaned');
      expect(Formatters.status('reopened'), 'Reopened');
      expect(Formatters.status(null), 'Unknown');
      expect(Formatters.status(''), 'Unknown');
      expect(Formatters.status('custom_state'), 'custom_state');
    });
  });

  group('Formatters.severity', () {
    test('bands 1-5 into low, medium and high', () {
      expect(Formatters.severity(1), 'Low');
      expect(Formatters.severity(2), 'Low');
      expect(Formatters.severity(3), 'Medium');
      expect(Formatters.severity(4), 'High');
      expect(Formatters.severity(5), 'High');
    });

    test('severityDots always renders five glyphs', () {
      expect(Formatters.severityDots(1), '●○○○○');
      expect(Formatters.severityDots(5), '●●●●●');
      expect(Formatters.severityDots(0), '●○○○○'); // clamped low
      expect(Formatters.severityDots(9), '●●●●●'); // clamped high
    });
  });
}
