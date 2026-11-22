/// An administrative area cleanliness scorecard from `/api/areas/:kind`.
///
/// The score stays `null` (locked) until the area reaches
/// `AppConfig.minVerifiedReports` distinct reporters, per FR-2.5.
class Area {
  const Area({
    required this.id,
    required this.name,
    required this.kind,
    required this.reporterCount,
    required this.cleanedCount,
    required this.openCount,
    required this.reopenedCount,
    required this.locked,
    required this.needed,
    this.avgCleanupHours,
    this.score,
    this.grade,
  });

  final String id;
  final String name;
  final String kind;
  final int reporterCount;
  final int cleanedCount;
  final int openCount;
  final int reopenedCount;
  final bool locked;
  final int needed;
  final double? avgCleanupHours;
  final int? score;
  final String? grade;

  factory Area.fromJson(Map<String, dynamic> json) => Area(
        id: json['id'] as String? ?? '',
        name: json['name'] as String? ?? '',
        kind: json['kind'] as String? ?? 'ward',
        reporterCount: _int(json['reporterCount']),
        cleanedCount: _int(json['cleanedCount']),
        openCount: _int(json['openCount']),
        reopenedCount: _int(json['reopenedCount']),
        avgCleanupHours: json['avgCleanupHours'] is num
            ? (json['avgCleanupHours'] as num).toDouble()
            : null,
        score: json['score'] is num ? (json['score'] as num).round() : null,
        grade: json['grade'] is String ? json['grade'] as String : null,
        locked: json['locked'] as bool? ?? json['score'] == null,
        needed: _int(json['needed'], fallback: 10),
      );

  static int _int(dynamic v, {int fallback = 0}) {
    if (v is int) return v;
    if (v is num) return v.round();
    if (v is String) return int.tryParse(v) ?? fallback;
    return fallback;
  }
}
