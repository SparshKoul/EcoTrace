import 'package:material_ui/material_ui.dart';

import '../config/app_theme.dart';
import '../models/report_entry.dart';
import '../utils/formatters.dart';
import 'media_thumbnail.dart';
import 'status_chip.dart';

/// One row in a report list: thumbnail, classification, status and time.
class ReportTile extends StatelessWidget {
  const ReportTile({super.key, required this.entry, this.onTap});

  final ReportEntry entry;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final String summary = entry.publicAuditSummary.trim();
    final String subtitle = summary.isNotEmpty
        ? summary
        : Formatters.category(entry.trashCategory);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Ink(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: EcoColors.surface,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: EcoColors.line),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              MediaThumbnail(
                url: entry.thumbnailUrl ?? entry.mediaUrl,
                size: 68,
                category: entry.trashCategory,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Row(
                      children: <Widget>[
                        Expanded(
                          child: CategoryChip(category: entry.trashCategory),
                        ),
                        const SizedBox(width: 8),
                        StatusChip(status: entry.status),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Text(
                      subtitle,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        fontSize: 14,
                        color: EcoColors.ink,
                        height: 1.35,
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: <Widget>[
                        Icon(
                          Icons.location_on_outlined,
                          size: 13,
                          color: EcoColors.muted,
                        ),
                        const SizedBox(width: 3),
                        Expanded(
                          child: Text(
                            '${entry.lat.toStringAsFixed(4)}, '
                            '${entry.lng.toStringAsFixed(4)}',
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                              fontSize: 12,
                              color: EcoColors.muted,
                            ),
                          ),
                        ),
                        Text(
                          Formatters.relative(entry.capturedAt),
                          style: const TextStyle(
                            fontSize: 12,
                            color: EcoColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
