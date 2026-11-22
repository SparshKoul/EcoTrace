import 'report_entry.dart';

/// Aggregated counters returned in the `summary` block of
/// `/api/v1/users/me/activity`.
class DashboardSummary {
  const DashboardSummary({
    this.totalReports = 0,
    this.piiProtected = 0,
    this.activeSites = 0,
    this.cleanedSites = 0,
  });

  final int totalReports;
  final int piiProtected;
  final int activeSites;
  final int cleanedSites;

  factory DashboardSummary.fromJson(Map<String, dynamic> json) =>
      DashboardSummary(
        totalReports: _int(json['total_reports']),
        piiProtected: _int(json['pii_protected']),
        activeSites: _int(json['active_sites']),
        cleanedSites: _int(json['cleaned_sites']),
      );

  static int _int(dynamic v) {
    if (v is int) return v;
    if (v is num) return v.round();
    if (v is String) return int.tryParse(v) ?? 0;
    return 0;
  }
}

/// The full `/api/v1/users/me/activity` payload: identity, counters and the
/// caller's report history (newest first).
class UserActivity {
  const UserActivity({
    required this.userId,
    required this.summary,
    required this.activity,
  });

  final String userId;
  final DashboardSummary summary;
  final List<ReportEntry> activity;

  factory UserActivity.fromJson(Map<String, dynamic> json) {
    final List<ReportEntry> activity = (json['activity'] as List<dynamic>? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(ReportEntry.fromJson)
        .toList();
    return UserActivity(
      userId: json['user_id'] as String? ?? '',
      summary: json['summary'] is Map<String, dynamic>
          ? DashboardSummary.fromJson(json['summary'] as Map<String, dynamic>)
          : const DashboardSummary(),
      activity: activity,
    );
  }
}
