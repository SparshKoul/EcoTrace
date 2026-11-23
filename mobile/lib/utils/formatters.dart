/// Presentation helpers. Written by hand to avoid pulling in `intl` for a
/// handful of formats.
class Formatters {
  Formatters._();

  static const List<String> _months = <String>[
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];

  static DateTime? tryParse(String? iso) {
    if (iso == null || iso.trim().isEmpty) return null;
    return DateTime.tryParse(iso)?.toLocal();
  }

  /// `12 Nov 2026, 2:30 PM`
  static String date(String? iso) {
    final DateTime? dt = tryParse(iso);
    if (dt == null) return '—';
    final String hour = dt.hour % 12 == 0 ? '12' : '${dt.hour % 12}';
    final String minute = dt.minute.toString().padLeft(2, '0');
    final String suffix = dt.hour >= 12 ? 'PM' : 'AM';
    return '${dt.day} ${_months[dt.month - 1]} ${dt.year}, '
        '$hour:$minute $suffix';
  }

  /// `12 Nov 2026`
  static String dateShort(String? iso) {
    final DateTime? dt = tryParse(iso);
    if (dt == null) return '—';
    return '${dt.day} ${_months[dt.month - 1]} ${dt.year}';
  }

  /// `just now`, `5m ago`, `3h ago`, `4d ago`, otherwise a short date.
  static String relative(String? iso) {
    final DateTime? dt = tryParse(iso);
    if (dt == null) return '—';
    final Duration diff = DateTime.now().difference(dt);
    if (diff.isNegative) return dateShort(iso);
    if (diff.inSeconds < 60) return 'just now';
    if (diff.inMinutes < 60) return '${diff.inMinutes}m ago';
    if (diff.inHours < 24) return '${diff.inHours}h ago';
    if (diff.inDays < 7) return '${diff.inDays}d ago';
    return dateShort(iso);
  }

  /// Human label for the AI `trash_category` enum (see microservice
  /// `TrashCategory`).
  static String category(String? category) {
    switch (category) {
      case 'wet_organic':
        return 'Wet / organic';
      case 'dry_plastic_paper':
        return 'Plastic / paper';
      case 'sanitary_biomedical':
        return 'Sanitary / biomedical';
      case 'special_care_ewaste_hazardous':
        return 'E-waste / hazardous';
      case 'construction_debris':
        return 'Construction debris';
      case 'mixed_municipal':
        return 'Mixed municipal';
      case 'none':
        return 'Not waste';
      default:
        return category == null || category.isEmpty
            ? 'Unclassified'
            : category.replaceAll('_', ' ');
    }
  }

  /// Human label for a report `status` column.
  static String status(String? status) {
    switch (status) {
      case 'verified':
        return 'Verified';
      case 'needs_review':
        return 'Needs review';
      case 'open':
        return 'Open';
      case 'cleaning':
        return 'Cleaning';
      case 'cleaned':
        return 'Cleaned';
      case 'reopened':
        return 'Reopened';
      case 'pending':
        return 'Pending';
      default:
        return status == null || status.isEmpty ? 'Unknown' : status;
    }
  }

  /// 1-5 severity banding used by the AI pipeline.
  static String severity(int value) {
    if (value <= 2) return 'Low';
    if (value == 3) return 'Medium';
    return 'High';
  }

  static String severityDots(int value) {
    final int clamped = value.clamp(1, 5);
    return '●' * clamped + '○' * (5 - clamped);
  }

  static String count(int value) => value.toString();
}
