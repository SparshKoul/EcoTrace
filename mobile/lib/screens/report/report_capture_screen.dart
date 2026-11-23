import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../config/app_theme.dart';
import '../../models/complaint_letter.dart';
import '../../models/report_submission_result.dart';
import '../../providers/capture_provider.dart';
import '../../services/location_service.dart';
import '../../widgets/eco_button.dart';
import '../../widgets/eco_card.dart';
import '../../widgets/media_thumbnail.dart';
import '../../widgets/section_header.dart';
import '../../widgets/state_views.dart';
import '../../widgets/status_chip.dart';

/// Waste-report tab: capture or pick a photo, attach GPS, add a note and
/// submit it through the backend's AI verification pipeline.
class ReportCaptureScreen extends StatefulWidget {
  const ReportCaptureScreen({super.key, this.onNavigate});

  final ValueChanged<int>? onNavigate;

  @override
  State<ReportCaptureScreen> createState() => _ReportCaptureScreenState();
}

class _ReportCaptureScreenState extends State<ReportCaptureScreen> {
  final TextEditingController _notes = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      final CaptureProvider provider = context.read<CaptureProvider>();
      // Acquire a fix automatically the first time the tab opens.
      if (!provider.hasFix && provider.locationError == null) {
        provider.locate();
      }
    });
  }

  @override
  void dispose() {
    _notes.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final CaptureProvider capture = context.watch<CaptureProvider>();
    _syncNotes(capture);

    return Scaffold(
      appBar: AppBar(title: const Text('File a report')),
      body: SafeArea(
        child: capture.phase == CapturePhase.succeeded
            ? _SuccessBody(
                result: capture.result!,
                onNavigate: widget.onNavigate,
                onAnother: capture.clearAll,
              )
            : _FormBody(
                capture: capture,
                notes: _notes,
                onNavigate: widget.onNavigate,
              ),
      ),
    );
  }

  /// Mirrors a provider-side reset (`clearAll()`) into the controller. The
  /// controller is otherwise the source of truth while typing, so the user's
  /// input is never echoed back at them.
  void _syncNotes(CaptureProvider capture) {
    if (capture.notes.isEmpty && _notes.text.isNotEmpty) {
      _notes.clear();
    }
  }
}

class _FormBody extends StatelessWidget {
  const _FormBody({
    required this.capture,
    required this.notes,
    required this.onNavigate,
  });

  final CaptureProvider capture;
  final TextEditingController notes;
  final ValueChanged<int>? onNavigate;

  @override
  Widget build(BuildContext context) {
    final bool busy = capture.isBusy;

    return Stack(
      children: <Widget>[
        ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: <Widget>[
            const Text(
              'Show us the problem',
              style: TextStyle(
                fontSize: 20,
                fontWeight: FontWeight.w800,
                color: EcoColors.ink,
              ),
            ),
            const SizedBox(height: 6),
            const Text(
              'One clear photo, a GPS fix and the AI will classify and verify it.',
              style: TextStyle(
                color: EcoColors.muted,
                fontSize: 14,
                height: 1.45,
              ),
            ),
            const SizedBox(height: 20),

            _ImageSection(capture: capture),
            const SizedBox(height: 16),

            _GpsSection(capture: capture),
            const SizedBox(height: 16),

            SectionHeader(
              title: 'What’s going on?',
              subtitle: 'Optional note for reviewers and authorities',
            ),
            TextField(
              controller: notes,
              maxLines: 4,
              maxLength: 1000,
              enabled: !busy,
              onChanged: capture.setNotes,
              style: const TextStyle(
                color: EcoColors.ink,
                fontSize: 15,
                height: 1.5,
              ),
              decoration: const InputDecoration(
                hintText: 'e.g. Overflowing bin outside the market, present for three days…',
                counterStyle: TextStyle(color: EcoColors.muted, fontSize: 12),
              ),
            ),
            const SizedBox(height: 8),

            if (capture.phase == CapturePhase.failed &&
                capture.submitError != null) ...<Widget>[
              InlineBanner(message: capture.submitError!),
              const SizedBox(height: 16),
            ],
            if (capture.phase == CapturePhase.rejected &&
                capture.submitError != null) ...<Widget>[
              _RejectedBanner(message: capture.submitError!),
              const SizedBox(height: 16),
            ],

            const SizedBox(height: 4),
            EcoButton(
              label: 'Submit report',
              busy: busy,
              busyLabel: capture.workingLabel.isEmpty
                  ? 'Submitting…'
                  : capture.workingLabel,
              onPressed: capture.canSubmit ? () => capture.submit() : null,
            ),
            const SizedBox(height: 12),
            const Text(
              'By submitting you agree the photo may be published after faces '
              'and plates are blurred.',
              textAlign: TextAlign.center,
              style: TextStyle(
                color: EcoColors.muted,
                fontSize: 12,
                height: 1.5,
              ),
            ),
          ],
        ),
        if (busy)
          const Positioned.fill(child: ColoredBox(color: Color(0x33FFFFFF))),
      ],
    );
  }
}

class _ImageSection extends StatelessWidget {
  const _ImageSection({required this.capture});

  final CaptureProvider capture;

  @override
  Widget build(BuildContext context) {
    if (capture.hasImage) {
      return Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: AspectRatio(
              aspectRatio: 4 / 3,
              child: Image.memory(
                capture.image!.bytes,
                fit: BoxFit.cover,
                errorBuilder:
                    (BuildContext context, Object error, StackTrace? trace) =>
                        const ColoredBox(
                          color: EcoColors.tile,
                          child: Icon(
                            Icons.broken_image_outlined,
                            color: EcoColors.muted,
                            size: 40,
                          ),
                        ),
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: <Widget>[
              Expanded(
                child: EcoButton(
                  label: 'Retake',
                  icon: Icons.camera_alt_outlined,
                  variant: EcoButtonVariant.secondary,
                  onPressed: capture.isBusy ? null : capture.pickFromCamera,
                ),
              ),
            ],
          ),
        ],
      );
    }

    return EcoCard(
      padding: const EdgeInsets.all(20),
      child: Column(
        children: <Widget>[
          Container(
            width: 76,
            height: 76,
            decoration: const BoxDecoration(
              color: EcoColors.accentSoft,
              shape: BoxShape.circle,
            ),
            child: const Icon(
              Icons.add_a_photo_outlined,
              size: 34,
              color: EcoColors.accent,
            ),
          ),
          const SizedBox(height: 14),
          const Text(
            'Add a photo of the waste',
            style: TextStyle(
              fontSize: 16,
              fontWeight: FontWeight.w700,
              color: EcoColors.ink,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Outdoors only — dumps, litter, overflowing bins or debris.',
            textAlign: TextAlign.center,
            style: TextStyle(color: EcoColors.muted, fontSize: 13.5),
          ),
          const SizedBox(height: 18),
          Row(
            children: <Widget>[
              Expanded(
                child: EcoButton(
                  label: 'Camera',
                  icon: Icons.camera_alt_outlined,
                  onPressed: capture.pickFromCamera,
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}

class _GpsSection extends StatelessWidget {
  const _GpsSection({required this.capture});

  final CaptureProvider capture;

  @override
  Widget build(BuildContext context) {
    final bool usable = capture.hasUsableFix;

    return EcoCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              Icon(
                usable ? Icons.gps_fixed_rounded : Icons.gps_not_fixed_rounded,
                size: 20,
                color: usable ? EcoColors.accent : EcoColors.noBin,
              ),
              const SizedBox(width: 8),
              const Expanded(child: EcoLabel('Location')),
              if (capture.hasFix)
                Pill(
                  label: capture.gpsLabel,
                  color: usable ? EcoColors.accent : EcoColors.noBin,
                  dense: true,
                ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            capture.hasFix
                ? '${capture.fix!.lat.toStringAsFixed(5)}, '
                      '${capture.fix!.lng.toStringAsFixed(5)}'
                      '${usable ? '' : ' — accuracy too low to submit'}'
                : 'No GPS fix yet.',
            style: const TextStyle(
              color: EcoColors.ink,
              fontSize: 14,
              height: 1.4,
            ),
          ),
          if (capture.locationError != null) ...<Widget>[
            const SizedBox(height: 12),
            InlineBanner(
              message: capture.locationError!,
              onDismiss: capture.locationTarget == LocationSettingsTarget.none
                  ? null
                  : capture.openLocationSettings,
            ),
            if (capture.locationTarget !=
                LocationSettingsTarget.none) ...<Widget>[
              const SizedBox(height: 8),
              EcoButton(
                label: 'Open settings',
                icon: Icons.settings_outlined,
                variant: EcoButtonVariant.secondary,
                onPressed: capture.openLocationSettings,
              ),
            ],
          ],
          const SizedBox(height: 12),
          EcoButton(
            label: capture.hasFix ? 'Refresh location' : 'Get my location',
            icon: Icons.my_location_rounded,
            variant: EcoButtonVariant.secondary,
            onPressed: capture.isBusy ? null : capture.locate,
          ),
        ],
      ),
    );
  }
}

class _RejectedBanner extends StatelessWidget {
  const _RejectedBanner({required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFFFBE9E7),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: const Color(0xFFF5C6C2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const Row(
            children: <Widget>[
              Icon(Icons.block_rounded, color: EcoColors.dump, size: 20),
              SizedBox(width: 8),
              Text(
                'Not accepted as waste',
                style: TextStyle(
                  fontWeight: FontWeight.w700,
                  color: EcoColors.dump,
                ),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            message,
            style: const TextStyle(
              color: EcoColors.dump,
              fontSize: 13.5,
              height: 1.45,
            ),
          ),
          const SizedBox(height: 6),
          const Text(
            'Try a photo that clearly shows outdoor waste — dumps, litter, '
            'overflowing bins or debris.',
            style: TextStyle(
              color: EcoColors.muted,
              fontSize: 13,
              height: 1.45,
            ),
          ),
        ],
      ),
    );
  }
}

class _SuccessBody extends StatelessWidget {
  const _SuccessBody({
    required this.result,
    required this.onNavigate,
    required this.onAnother,
  });

  final ReportSubmissionResult result;
  final ValueChanged<int>? onNavigate;
  final VoidCallback onAnother;

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
      children: <Widget>[
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: EcoColors.accentSoft,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: const Color(0xFFBFE3DE)),
          ),
          child: const Row(
            children: <Widget>[
              Icon(Icons.verified_rounded, color: EcoColors.accent, size: 30),
              SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: <Widget>[
                    Text(
                      'Report verified',
                      style: TextStyle(
                        fontSize: 17,
                        fontWeight: FontWeight.w800,
                        color: EcoColors.ink,
                      ),
                    ),
                    SizedBox(height: 2),
                    Text(
                      'The AI classified your photo and filed it against a site.',
                      style: TextStyle(color: EcoColors.muted, fontSize: 13.5),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: 20),

        EcoCard(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  MediaThumbnail(
                    url: result.thumbnailUrl ?? result.sanitizedUrl,
                    size: 92,
                    radius: 12,
                    category: result.trashCategory,
                  ),
                  const SizedBox(width: 14),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        CategoryChip(category: result.trashCategory),
                        const SizedBox(height: 8),
                        SeverityChip(severity: result.severityScore),
                        const SizedBox(height: 8),
                        Text(
                          result.grouped
                              ? 'Merged into an existing site'
                              : 'New site hotspot created',
                          style: const TextStyle(
                            fontSize: 13,
                            color: EcoColors.muted,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              if (result.publicAuditSummary.isNotEmpty) ...<Widget>[
                const SizedBox(height: 14),
                const Divider(),
                const SizedBox(height: 12),
                const EcoLabel('AI audit summary'),
                const SizedBox(height: 6),
                Text(
                  result.publicAuditSummary,
                  style: const TextStyle(
                    color: EcoColors.ink,
                    fontSize: 14,
                    height: 1.5,
                  ),
                ),
              ],
              if (result.detectedItems.isNotEmpty) ...<Widget>[
                const SizedBox(height: 14),
                const EcoLabel('Detected'),
                const SizedBox(height: 8),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  children: result.detectedItems
                      .map(
                        (String item) => Pill(
                          label: item.toUpperCase(),
                          color: EcoColors.forCategory(result.trashCategory),
                          dense: true,
                        ),
                      )
                      .toList(),
                ),
              ],
              const SizedBox(height: 14),
              const Divider(),
              const SizedBox(height: 10),
              _MetaRow(
                icon: Icons.shield_outlined,
                label: '${result.piiBlurCount} PII region(s) blurred',
              ),
              const SizedBox(height: 6),
              _MetaRow(
                icon: Icons.location_on_outlined,
                label:
                    '${result.lat.toStringAsFixed(5)}, ${result.lng.toStringAsFixed(5)}',
              ),
              if (result.modelUsed != null) ...<Widget>[
                const SizedBox(height: 6),
                _MetaRow(
                  icon: Icons.smart_toy_outlined,
                  label: 'Model: ${result.modelUsed}',
                ),
              ],
            ],
          ),
        ),

        if (result.letter != null) ...<Widget>[
          const SizedBox(height: 16),
          _LetterCard(letter: result.letter!),
        ],

        const SizedBox(height: 24),
        EcoButton(
          label: 'File another report',
          icon: Icons.add_a_photo_outlined,
          onPressed: onAnother,
        ),
        const SizedBox(height: 12),
        EcoButton(
          label: 'View my reports',
          icon: Icons.history_rounded,
          variant: EcoButtonVariant.secondary,
          onPressed: onNavigate == null ? null : () => onNavigate!(2),
        ),
      ],
    );
  }
}

class _LetterCard extends StatelessWidget {
  const _LetterCard({required this.letter});

  final ComplaintLetter letter;

  @override
  Widget build(BuildContext context) {
    final String recipient = letter.recipient;
    final bool verified = letter.hasVerifiedCitations;

    return EcoCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Row(
            children: <Widget>[
              const Icon(
                Icons.gavel_rounded,
                color: EcoColors.accent,
                size: 20,
              ),
              const SizedBox(width: 8),
              const Expanded(child: EcoLabel('Civic letter ready')),
              Pill(
                label: verified ? 'VERIFIED QUOTES' : 'TEMPLATE',
                color: verified ? EcoColors.accent : EcoColors.noBin,
                dense: true,
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(
            recipient,
            style: const TextStyle(
              fontWeight: FontWeight.w700,
              color: EcoColors.ink,
              fontSize: 14.5,
            ),
          ),
          const SizedBox(height: 4),
          Text(
            'A formal grievance draft citing the Solid Waste Management Rules '
            '${verified ? 'with ${letter.verifiedQuotes} verified quote(s).' : '(template fallback).'}',
            style: const TextStyle(
              color: EcoColors.muted,
              fontSize: 13,
              height: 1.45,
            ),
          ),
          const SizedBox(height: 12),
          EcoButton(
            label: 'Read the letter',
            icon: Icons.description_outlined,
            variant: EcoButtonVariant.secondary,
            onPressed: () => _showLetter(context),
          ),
        ],
      ),
    );
  }

  void _showLetter(BuildContext context) {
    showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: EcoColors.surface,
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(EcoRadius.sheet),
        ),
      ),
      builder: (BuildContext context) => DraggableScrollableSheet(
        expand: false,
        initialChildSize: 0.75,
        minChildSize: 0.4,
        maxChildSize: 0.95,
        builder: (BuildContext context, ScrollController controller) =>
            ListView(
              controller: controller,
              padding: const EdgeInsets.fromLTRB(24, 12, 24, 32),
              children: <Widget>[
                Center(
                  child: Container(
                    width: 40,
                    height: 4,
                    decoration: BoxDecoration(
                      color: EcoColors.line,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  letter.subject,
                  style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: EcoColors.ink,
                    height: 1.35,
                  ),
                ),
                const SizedBox(height: 16),
                Text(
                  letter.body,
                  style: const TextStyle(
                    color: EcoColors.ink,
                    fontSize: 14.5,
                    height: 1.65,
                  ),
                ),
                if (letter.citations.isNotEmpty) ...<Widget>[
                  const SizedBox(height: 20),
                  const EcoLabel('Verified citations'),
                  const SizedBox(height: 8),
                  ...letter.citations.map(
                    (String c) => Padding(
                      padding: const EdgeInsets.only(bottom: 8),
                      child: Text(
                        '• $c',
                        style: const TextStyle(
                          color: EcoColors.muted,
                          fontSize: 13.5,
                          height: 1.5,
                        ),
                      ),
                    ),
                  ),
                ],
              ],
            ),
      ),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Icon(icon, size: 15, color: EcoColors.muted),
        const SizedBox(width: 7),
        Expanded(
          child: Text(
            label,
            style: const TextStyle(color: EcoColors.muted, fontSize: 13),
          ),
        ),
      ],
    );
  }
}
