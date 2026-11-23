import 'complaint_letter.dart';
import 'report_entry.dart';

/// The `201` body of `POST /api/v1/reports` — the AI-verified receipt for a
/// freshly captured report, including the classification and the drafted civic
/// letter.
///
/// Note the field names differ slightly from the feed/activity rows (the
/// receipt uses `report_id`, `severity_score` and `sanitized_url`), so it is
/// modelled separately rather than reusing [ReportEntry].
class ReportSubmissionResult {
  const ReportSubmissionResult({
    required this.reportId,
    required this.siteId,
    required this.status,
    required this.mediaType,
    required this.trashCategory,
    required this.severityScore,
    required this.detectedItems,
    required this.publicAuditSummary,
    required this.capturedAt,
    required this.lat,
    required this.lng,
    required this.notes,
    this.grouped = false,
    this.sanitizedUrl,
    this.thumbnailUrl,
    this.piiBlurCount = 0,
    this.piiDetections = 0,
    this.requestIpMasked,
    this.modelUsed,
    this.letter,
  });

  final String reportId;
  final String siteId;
  final String status;
  final bool grouped;
  final String mediaType;
  final String trashCategory;
  final int severityScore;
  final List<String> detectedItems;
  final String publicAuditSummary;
  final String? sanitizedUrl;
  final String? thumbnailUrl;
  final int piiBlurCount;
  final int piiDetections;
  final String capturedAt;
  final double lat;
  final double lng;
  final String? requestIpMasked;
  final String? modelUsed;
  final String notes;
  final ComplaintLetter? letter;

  /// The report was merged into an existing site within the 20 m radius.
  bool get wasGrouped => grouped;

  factory ReportSubmissionResult.fromJson(Map<String, dynamic> json) =>
      ReportSubmissionResult(
        reportId: json['report_id'] as String? ?? '',
        siteId: json['site_id'] as String? ?? '',
        status: json['status'] as String? ?? 'VERIFIED',
        grouped: json['grouped'] as bool? ?? false,
        mediaType: json['media_type'] as String? ?? 'photo',
        trashCategory:
            json['trash_category'] as String? ?? 'mixed_municipal',
        severityScore: _int(json['severity_score'], fallback: 3),
        detectedItems: ReportEntry.asStringList(json['detected_items']),
        publicAuditSummary: json['public_audit_summary'] as String? ?? '',
        sanitizedUrl: json['sanitized_url'] is String
            ? json['sanitized_url'] as String
            : null,
        thumbnailUrl: json['thumbnail_url'] is String
            ? json['thumbnail_url'] as String
            : null,
        piiBlurCount: _int(json['pii_blur_count']),
        piiDetections: json['pii_detections'] is List
            ? (json['pii_detections'] as List).length
            : 0,
        capturedAt: json['captured_at'] as String? ?? '',
        lat: (json['lat'] as num?)?.toDouble() ?? 0,
        lng: (json['lng'] as num?)?.toDouble() ?? 0,
        requestIpMasked: json['request_ip_masked'] is String
            ? json['request_ip_masked'] as String
            : null,
        modelUsed: json['model_used'] is String
            ? json['model_used'] as String
            : null,
        notes: json['notes'] as String? ?? '',
        letter: json['letter'] is Map<String, dynamic>
            ? ComplaintLetter.fromJson(json['letter'] as Map<String, dynamic>)
            : null,
      );

  static int _int(dynamic v, {int fallback = 0}) {
    if (v is int) return v;
    if (v is num) return v.round();
    if (v is String) return int.tryParse(v) ?? fallback;
    return fallback;
  }
}
