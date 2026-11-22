import 'package:material_ui/material_ui.dart';

import '../config/app_theme.dart';
import '../utils/formatters.dart';

/// A small rounded pill. Reused for statuses, categories and severity.
class Pill extends StatelessWidget {
  const Pill({
    super.key,
    required this.label,
    required this.color,
    this.icon,
    this.dense = false,
  });

  final String label;
  final Color color;
  final IconData? icon;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.symmetric(
        horizontal: dense ? 8 : 10,
        vertical: dense ? 3 : 5,
      ),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          if (icon != null) ...<Widget>[
            Icon(icon, size: dense ? 11 : 13, color: color),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              color: color,
              fontSize: dense ? 11 : 12,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }
}

/// Report/site status pill with an EcoTrace-appropriate colour per state.
class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.status, this.site = false});

  final String? status;
  final bool site;

  (String, Color, IconData) get _resolved {
    final String value = status ?? 'unknown';
    switch (value) {
      case 'verified':
        return ('VERIFIED', EcoColors.accent, Icons.verified_outlined);
      case 'needs_review':
        return ('REVIEW', EcoColors.noBin, Icons.visibility_outlined);
      case 'open':
        return (site ? 'OPEN' : 'OPEN', EcoColors.coral, Icons.fiber_new_outlined);
      case 'cleaning':
        return ('CLEANING', EcoColors.water, Icons.cleaning_services_outlined);
      case 'cleaned':
        return ('CLEANED', EcoColors.accent, Icons.check_circle_outline_rounded);
      case 'reopened':
        return ('REOPENED', EcoColors.dump, Icons.replay_rounded);
      case 'pending':
        return ('PENDING', EcoColors.muted, Icons.hourglass_empty_rounded);
      default:
        return (Formatters.status(value).toUpperCase(), EcoColors.muted, Icons.circle_outlined);
    }
  }

  @override
  Widget build(BuildContext context) {
    final (String label, Color color, IconData icon) = _resolved;
    return Pill(label: label, color: color, icon: icon, dense: true);
  }
}

/// AI waste-category pill.
class CategoryChip extends StatelessWidget {
  const CategoryChip({super.key, required this.category, this.dense = true});

  final String? category;
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final Color color = EcoColors.forCategory(category);
    return Pill(
      label: Formatters.category(category).toUpperCase(),
      color: color,
      dense: dense,
    );
  }
}

/// Severity shown as a filled 1-5 gauge plus a word band.
class SeverityChip extends StatelessWidget {
  const SeverityChip({super.key, required this.severity});

  final int severity;

  @override
  Widget build(BuildContext context) {
    final Color color = severity <= 2
        ? EcoColors.accent
        : severity == 3
            ? EcoColors.noBin
            : EcoColors.dump;
    return Pill(
      label: '${Formatters.severity(severity)} ${severity.clamp(1, 5)}/5',
      color: color,
      icon: Icons.warning_amber_outlined,
      dense: true,
    );
  }
}
