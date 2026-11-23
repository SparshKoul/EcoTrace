import 'dart:convert';

/// A single waste report as returned by the feed (`/api/v1/reports/feed`) and
/// the authenticated activity feed (`/api/v1/users/me/activity`).
///
/// Both endpoints share the same column aliases, so one model covers each; the
/// only difference is that `detected_items` is selected by the public feed but
/// not by the activity query, hence it is optional here.
class ReportEntry {
  const ReportEntry({
    required this.id,
    required this.siteId,
    required this.mediaType,
    required this.trashCategory,
    required this.severity,
    required this.piiBlurCount,
    required this.publicAuditSummary,
    required this.lat,
    required this.lng,
    required this.reportCount,
    this.mediaUrl,
    this.thumbnailUrl,
    this.detectedItems = const [],
    this.capturedAt,
    this.status,
    this.siteStatus,
    this.ulbName,
    this.mlaConstituency,
    this.mpConstituency,
  });

  final String id;
  final String siteId;
  final String mediaType;

  /// Sanitized, public-bucket media URL. Raw media never reaches the client.
  final String? mediaUrl;
  final String? thumbnailUrl;
  final String trashCategory;
  final List<String> detectedItems;

  /// 1-5 severity assigned by the AI pipeline.
  final int severity;
  final int piiBlurCount;
  final String publicAuditSummary;
  final double lat;
  final double lng;
  final String? capturedAt;
  final String? status;
  final String? siteStatus;
  final int reportCount;
  final String? ulbName;
  final String? mlaConstituency;
  final String? mpConstituency;

  factory ReportEntry.fromJson(Map<String, dynamic> json) => ReportEntry(
    id: _str(json['id']) ?? '',
    siteId: _str(json['site_id']) ?? '',
    mediaType: _str(json['media_type']) ?? 'photo',
    mediaUrl:
        _str(json['sanitized_media_url']) ?? _str(json['cover_media_url']),
    thumbnailUrl:
        _str(json['thumbnail_url']) ??
        _str(json['sanitized_media_url']) ??
        _str(json['cover_media_url']),
    trashCategory:
        _str(json['trash_category']) ??
        _str(json['waste_type']) ??
        'mixed_municipal',
    detectedItems: asStringList(json['detected_items']),
    severity: _int(json['severity'] ?? json['severity_score'], fallback: 3),
    piiBlurCount: _int(json['pii_blur_count']),
    publicAuditSummary: _str(json['public_audit_summary']) ?? '',
    lat: _double(json['lat']) ?? _double(json['latitude']) ?? 0,
    lng: _double(json['lng']) ?? _double(json['longitude']) ?? 0,
    capturedAt: _str(json['captured_at']),
    status: _str(json['status']),
    siteStatus: _str(json['site_status']),
    reportCount: _int(json['report_count']),
    ulbName: _str(json['ulb_name']),
    mlaConstituency: _str(json['mla_constituency']),
    mpConstituency: _str(json['mp_constituency']),
  );

  /// Normalises a `detected_items` value, which the backend may return as a
  /// JSON array or as a JSON-encoded string depending on the column type.
  static List<String> asStringList(dynamic value) {
    if (value is List) {
      return value.map((dynamic e) => e.toString()).toList();
    }
    if (value is String && value.trim().isNotEmpty) {
      try {
        final dynamic decoded = jsonDecode(value);
        if (decoded is List) {
          return decoded.map((dynamic e) => e.toString()).toList();
        }
      } catch (_) {
        // Not JSON — treat the raw string as a single item.
      }
      return [value];
    }
    return const [];
  }

  static String? _str(dynamic v) => v is String && v.isNotEmpty ? v : null;

  static int _int(dynamic v, {int fallback = 0}) {
    if (v is int) return v;
    if (v is String) return int.tryParse(v) ?? fallback;
    if (v is num) return v.round();
    return fallback;
  }

  static double? _double(dynamic v) {
    if (v is double) return v;
    if (v is int) return v.toDouble();
    if (v is String) return double.tryParse(v);
    return null;
  }

  @override
  bool operator ==(Object other) => other is ReportEntry && other.id == id;

  @override
  int get hashCode => id.hashCode;
}
