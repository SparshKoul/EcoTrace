import 'package:ecotrace/models/api_exception.dart';
import 'package:ecotrace/models/auth_session.dart';
import 'package:ecotrace/models/dashboard_summary.dart';
import 'package:ecotrace/models/report_entry.dart';
import 'package:ecotrace/models/report_submission_result.dart';
import 'package:ecotrace/models/user.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  group('User', () {
    test('prefers fullName, falls back to the email local part', () {
      expect(
        const User(id: '1', email: 'jane@x.io', fullName: 'Jane Citizen')
            .displayName,
        'Jane Citizen',
      );
      expect(
        const User(id: '1', email: 'jane@x.io').displayName,
        'jane',
      );
      expect(const User(id: '1', email: 'no-at-sign').displayName, 'no-at-sign');
    });

    test('reads both camelCase and snake_case keys', () {
      expect(
        User.fromJson(<String, dynamic>{'id': 'a', 'email': 'e@x.io', 'fullName': 'N'})
            .fullName,
        'N',
      );
      expect(
        User.fromJson(<String, dynamic>{'id': 'a', 'email': 'e@x.io', 'full_name': 'M'})
            .fullName,
        'M',
      );
    });

    test('tolerates a missing name without throwing', () {
      final User user = User.fromJson(<String, dynamic>{'id': 'a', 'email': 'e@x.io'});
      expect(user.fullName, isNull);
      expect(user.displayName, 'e');
    });
  });

  group('AuthSession', () {
    test('round-trips through JSON', () {
      const AuthSession session = AuthSession(
        user: User(id: 'u1', email: 'a@b.io', fullName: 'A'),
        accessToken: 'token',
        refreshToken: 'refresh',
        expiresAt: 1790000000,
      );
      final AuthSession restored = AuthSession.fromJson(session.toJson());
      expect(restored.accessToken, 'token');
      expect(restored.refreshToken, 'refresh');
      expect(restored.expiresAt, 1790000000);
      expect(restored.user.id, 'u1');
      expect(restored.hasToken, isTrue);
    });

    test('accepts snake_case token keys from Supabase', () {
      final AuthSession session = AuthSession.fromJson(<String, dynamic>{
        'access_token': 'snake',
        'refresh_token': 'r',
        'expires_at': 42,
        'id': 'u',
        'email': 'a@b.io',
      });
      expect(session.accessToken, 'snake');
      expect(session.expiresAt, 42);
      expect(session.hasToken, isTrue);
    });

    test('is treated as absent when the token is empty', () {
      expect(
        const AuthSession(user: User(id: 'u', email: 'e@x.io'), accessToken: '')
            .hasToken,
        isFalse,
      );
    });
  });

  group('ReportEntry', () {
    test('parses a feed row', () {
      final ReportEntry entry = ReportEntry.fromJson(<String, dynamic>{
        'id': 'r1',
        'site_id': 's1',
        'media_type': 'photo',
        'sanitized_media_url': 'https://cdn/x.jpg',
        'trash_category': 'wet_organic',
        'detected_items': <String>['banana peel'],
        'severity': 4,
        'pii_blur_count': 2,
        'public_audit_summary': 'Organic waste near a drain.',
        'lat': 12.5,
        'lng': 77.1,
        'captured_at': '2026-11-12T14:30:00Z',
        'status': 'verified',
        'site_status': 'open',
        'report_count': 3,
      });

      expect(entry.id, 'r1');
      expect(entry.mediaUrl, 'https://cdn/x.jpg');
      expect(entry.detectedItems, <String>['banana peel']);
      expect(entry.severity, 4);
      expect(entry.lat, 12.5);
      expect(entry.reportCount, 3);
      expect(entry.siteStatus, 'open');
    });

    test('falls back to sensible defaults for a sparse row', () {
      final ReportEntry entry = ReportEntry.fromJson(<String, dynamic>{'id': 'r2'});
      expect(entry.mediaType, 'photo');
      expect(entry.trashCategory, 'mixed_municipal');
      expect(entry.severity, 3);
      expect(entry.detectedItems, isEmpty);
      expect(entry.lat, 0);
    });

    test('asStringList handles array, JSON-string and junk input', () {
      expect(ReportEntry.asStringList(<dynamic>['a', 'b']), <String>['a', 'b']);
      expect(ReportEntry.asStringList('["x","y"]'), <String>['x', 'y']);
      expect(ReportEntry.asStringList('not json'), <String>['not json']);
      expect(ReportEntry.asStringList(null), isEmpty);
      expect(ReportEntry.asStringList(7), isEmpty);
    });

    test('equality is by id', () {
      const ReportEntry a = ReportEntry(
        id: 'same',
        siteId: 's',
        mediaType: 'photo',
        trashCategory: 'mixed_municipal',
        severity: 1,
        piiBlurCount: 0,
        publicAuditSummary: '',
        lat: 0,
        lng: 0,
        reportCount: 0,
      );
      const ReportEntry b = ReportEntry(
        id: 'same',
        siteId: 'different',
        mediaType: 'photo',
        trashCategory: 'wet_organic',
        severity: 5,
        piiBlurCount: 9,
        publicAuditSummary: 'x',
        lat: 1,
        lng: 1,
        reportCount: 4,
      );
      expect(a, b);
    });
  });

  group('ReportSubmissionResult', () {
    test('parses the 201 receipt field names', () {
      final ReportSubmissionResult result =
          ReportSubmissionResult.fromJson(<String, dynamic>{
        'report_id': 'rep-1',
        'site_id': 'site-1',
        'status': 'VERIFIED',
        'grouped': true,
        'media_type': 'photo',
        'trash_category': 'construction_debris',
        'severity_score': 4,
        'detected_items': <String>['brick'],
        'public_audit_summary': 'Debris on the verge.',
        'sanitized_url': 'https://cdn/y.jpg',
        'pii_blur_count': 1,
        'pii_detections': <Map<String, dynamic>>[<String, dynamic>{'box': 1}],
        'captured_at': '2026-11-12T14:30:00Z',
        'lat': 12.97,
        'lng': 77.59,
        'notes': 'by the school',
        'model_used': 'gemini-2.5-flash',
      });

      expect(result.reportId, 'rep-1');
      expect(result.siteId, 'site-1');
      expect(result.grouped, isTrue);
      expect(result.wasGrouped, isTrue);
      expect(result.severityScore, 4);
      expect(result.detectedItems, <String>['brick']);
      expect(result.piiBlurCount, 1);
      expect(result.piiDetections, 1);
      expect(result.modelUsed, 'gemini-2.5-flash');
      expect(result.letter, isNull);
    });

    test('defaults piiDetections to 0 when the key is absent', () {
      final ReportSubmissionResult result =
          ReportSubmissionResult.fromJson(<String, dynamic>{'report_id': 'r'});
      expect(result.piiDetections, 0);
      expect(result.piiBlurCount, 0);
      expect(result.grouped, isFalse);
    });

    test('parses the nested complaint letter', () {
      final ReportSubmissionResult result =
          ReportSubmissionResult.fromJson(<String, dynamic>{
        'report_id': 'r',
        'letter': <String, dynamic>{
          'letter_id': 'L1',
          'site_id': 'S1',
          'to': 'The Health Officer',
          'cc': 'Ward Councillor',
          'subject': 'Uncollected waste',
          'body': 'Dear Sir, ...',
          'citations': <Map<String, dynamic>>[
            <String, dynamic>{'quote': 'Rule 4'},
          ],
          'verifier': <String, dynamic>{'verified': 1, 'total': 1},
          'template_fallback': false,
          'created_at': '2026-11-12T14:30:00Z',
        },
      });

      expect(result.letter, isNotNull);
      expect(result.letter!.recipient, 'The Health Officer');
      expect(result.letter!.subject, 'Uncollected waste');
      expect(result.letter!.verifiedQuotes, 1);
      expect(result.letter!.hasVerifiedCitations, isTrue);
    });
  });

  group('DashboardSummary', () {
    test('parses counters and tolerates string numbers', () {
      final DashboardSummary summary = DashboardSummary.fromJson(
        <String, dynamic>{
          'total_reports': 12,
          'pii_protected': '7',
          'active_sites': 3.0,
          'cleaned_sites': null,
        },
      );
      expect(summary.totalReports, 12);
      expect(summary.piiProtected, 7);
      expect(summary.activeSites, 3);
      expect(summary.cleanedSites, 0);
    });

    test('UserActivity skips malformed rows instead of throwing', () {
      final UserActivity activity = UserActivity.fromJson(<String, dynamic>{
        'user_id': 'u1',
        'summary': <String, dynamic>{'total_reports': 2},
        'activity': <dynamic>[
          <String, dynamic>{'id': 'r1'},
          'not-a-map',
          null,
        ],
      });
      expect(activity.userId, 'u1');
      expect(activity.summary.totalReports, 2);
      expect(activity.activity, hasLength(1));
      expect(activity.activity.single.id, 'r1');
    });
  });

  group('ApiException', () {
    test('maps backend error codes to friendly messages', () {
      final ApiException gps = ApiException.fromBody(
        400,
        <String, dynamic>{'error': 'GPS_TOO_IMPRECISE'},
        'fallback',
      );
      expect(gps.code, 'GPS_TOO_IMPRECISE');
      expect(gps.message, contains('imprecise'));

      final ApiException auth = ApiException.fromBody(
        401,
        <String, dynamic>{'error': 'AUTHENTICATION_REQUIRED'},
        'fallback',
      );
      expect(auth.isUnauthorized, isTrue);
      expect(auth.message, 'Please sign in to continue.');
    });

    test('prefers rejection_reason for AI rejections', () {
      final ApiException rejected = ApiException.fromBody(
        422,
        <String, dynamic>{
          'error': 'INVALID_TRASH',
          'rejection_reason': 'No outdoor waste visible in this photo.',
        },
        'fallback',
      );
      expect(rejected.isAiRejected, isTrue);
      expect(rejected.message, 'No outdoor waste visible in this photo.');
      expect(rejected.rejectionReason, 'No outdoor waste visible in this photo.');
    });

    test('uses a plain message field when the code is not machine-readable', () {
      final ApiException error = ApiException.fromBody(
        400,
        <String, dynamic>{'error': 'Email already registered'},
        'fallback',
      );
      expect(error.message, 'Email already registered');
    });

    test('falls back when the body is empty', () {
      final ApiException error =
          ApiException.fromBody(500, <String, dynamic>{}, 'Something broke');
      expect(error.message, 'Something broke');
      expect(error.code, isNull);
      expect(error.isNetwork, isFalse);
    });

    test('flags transport failures via status 0', () {
      const ApiException offline = ApiException(
        statusCode: 0,
        message: 'offline',
        code: 'NETWORK',
      );
      expect(offline.isNetwork, isTrue);
      expect(offline.isUnauthorized, isFalse);
    });
  });
}
