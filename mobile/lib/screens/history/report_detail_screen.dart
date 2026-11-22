import 'package:material_ui/material_ui.dart';

import '../../config/app_config.dart';
import '../../config/app_theme.dart';
import '../../models/report_entry.dart';
import '../../utils/formatters.dart';
import '../../widgets/eco_card.dart';
import '../../widgets/section_header.dart';
import '../../widgets/status_chip.dart';

/// Full detail for one report: sanitized evidence photo, AI classification,
/// status and location metadata.
class ReportDetailScreen extends StatelessWidget {
  const ReportDetailScreen({super.key, required this.entry});

  final ReportEntry entry;

  @override
  Widget build(BuildContext context) {
    final String summary = entry.publicAuditSummary.trim();

    return Scaffold(
      appBar: AppBar(title: const Text('Report detail')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: <Widget>[
            _HeroImage(entry: entry),
            const SizedBox(height: 16),

            Wrap(
              spacing: 8,
              runSpacing: 8,
              children: <Widget>[
                CategoryChip(category: entry.trashCategory, dense: false),
                StatusChip(status: entry.status),
                if (entry.severity > 0)
                  SeverityChip(severity: entry.severity),
              ],
            ),

            if (summary.isNotEmpty) ...<Widget>[
              const SizedBox(height: 20),
              const SectionHeader(title: 'AI audit summary'),
              EcoCard(
                child: Text(
                  summary,
                  style: const TextStyle(
                    color: EcoColors.ink,
                    fontSize: 14.5,
                    height: 1.55,
                  ),
                ),
              ),
            ],

            if (entry.detectedItems.isNotEmpty) ...<Widget>[
              const SizedBox(height: 20),
              const SectionHeader(title: 'Detected items'),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: entry.detectedItems
                    .map(
                      (String item) => Pill(
                        label: item.toUpperCase(),
                        color: EcoColors.forCategory(entry.trashCategory),
                        dense: true,
                      ),
                    )
                    .toList(),
              ),
            ],

            const SizedBox(height: 20),
            const SectionHeader(title: 'Details'),
            EcoCard(
              child: Column(
                children: <Widget>[
                  _Row(
                    icon: Icons.location_on_outlined,
                    label: 'Coordinates',
                    value:
                        '${entry.lat.toStringAsFixed(5)}, ${entry.lng.toStringAsFixed(5)}',
                  ),
                  const _Divider(),
                  _Row(
                    icon: Icons.schedule_rounded,
                    label: 'Captured',
                    value: Formatters.date(entry.capturedAt),
                  ),
                  const _Divider(),
                  _Row(
                    icon: Icons.flag_outlined,
                    label: 'Site status',
                    value: entry.siteStatus == null
                        ? '—'
                        : Formatters.status(entry.siteStatus),
                  ),
                  const _Divider(),
                  _Row(
                    icon: Icons.groups_outlined,
                    label: 'Reports at this site',
                    value: '${entry.reportCount}',
                  ),
                  const _Divider(),
                  _Row(
                    icon: Icons.shield_outlined,
                    label: 'PII regions blurred',
                    value: '${entry.piiBlurCount}',
                  ),
                  if (entry.mediaType == 'video') ...<Widget>[
                    const _Divider(),
                    _Row(
                      icon: Icons.videocam_outlined,
                      label: 'Media type',
                      value: 'Video',
                    ),
                  ],
                ],
              ),
            ),

            if (entry.siteId.isNotEmpty) ...<Widget>[
              const SizedBox(height: 16),
              EcoCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    const EcoLabel('Site identifier'),
                    const SizedBox(height: 6),
                    SelectableText(
                      entry.siteId,
                      style: const TextStyle(
                        color: EcoColors.muted,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _HeroImage extends StatelessWidget {
  const _HeroImage({required this.entry});

  final ReportEntry entry;

  @override
  Widget build(BuildContext context) {
    final String url = AppConfig.absoluteUrl(
      entry.mediaUrl ?? entry.thumbnailUrl,
    );

    return ClipRRect(
      borderRadius: BorderRadius.circular(16),
      child: AspectRatio(
        aspectRatio: 4 / 3,
        child: url.isEmpty
            ? const ColoredBox(
                color: EcoColors.tile,
                child: Icon(Icons.image_not_supported_outlined,
                    color: EcoColors.muted, size: 44),
              )
            : Image.network(
                url,
                fit: BoxFit.cover,
                loadingBuilder: (BuildContext context, Widget child,
                    ImageChunkEvent? progress) {
                  if (progress == null) return child;
                  return const ColoredBox(
                    color: EcoColors.tile,
                    child: Center(
                      child: SizedBox(
                        width: 26,
                        height: 26,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      ),
                    ),
                  );
                },
                errorBuilder: (BuildContext context, Object error,
                        StackTrace? trace) =>
                    const ColoredBox(
                  color: EcoColors.tile,
                  child: Icon(Icons.broken_image_outlined,
                      color: EcoColors.muted, size: 44),
                ),
              ),
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 11),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, size: 18, color: EcoColors.muted),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              label,
              style: const TextStyle(color: EcoColors.muted, fontSize: 14),
            ),
          ),
          const SizedBox(width: 12),
          Flexible(
            child: Text(
              value,
              textAlign: TextAlign.right,
              style: const TextStyle(
                color: EcoColors.ink,
                fontSize: 14,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider();

  @override
  Widget build(BuildContext context) => const Divider(height: 1);
}
