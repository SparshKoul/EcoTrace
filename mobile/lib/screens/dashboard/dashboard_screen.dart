import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../config/app_theme.dart';
import '../../models/area.dart';
import '../../models/dashboard_summary.dart';
import '../../models/report_entry.dart';
import '../../providers/auth_provider.dart';
import '../../providers/dashboard_provider.dart';
import '../../widgets/eco_button.dart';
import '../../widgets/eco_card.dart';
import '../../widgets/report_tile.dart';
import '../../widgets/section_header.dart';
import '../../widgets/state_views.dart';
import '../../widgets/stat_tile.dart';
import '../../widgets/status_chip.dart';

/// Landing tab: impact statistics, an area-cleanliness statistic and the
/// user's most recent reports, plus shortcuts to the other features.
class DashboardScreen extends StatelessWidget {
  const DashboardScreen({super.key, this.onNavigate});

  /// Requests the shell to switch tabs (0 dashboard, 1 report, 2 history,
  /// 3 profile).
  final ValueChanged<int>? onNavigate;

  @override
  Widget build(BuildContext context) {
    final DashboardProvider dashboard = context.watch<DashboardProvider>();
    final AuthProvider auth = context.watch<AuthProvider>();

    // Kick off the first load exactly once.
    if (!dashboard.loaded && !dashboard.loading && dashboard.error == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) context.read<DashboardProvider>().load();
      });
    }

    return Scaffold(
      body: SafeArea(
        child: _Body(dashboard: dashboard, auth: auth, onNavigate: onNavigate),
      ),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({
    required this.dashboard,
    required this.auth,
    required this.onNavigate,
  });

  final DashboardProvider dashboard;
  final AuthProvider auth;
  final ValueChanged<int>? onNavigate;

  @override
  Widget build(BuildContext context) {
    if (dashboard.loading && !dashboard.loaded && dashboard.error == null) {
      return const LoadingView(message: 'Loading your dashboard…');
    }
    if (dashboard.error != null && !dashboard.loaded) {
      return ErrorView(
        message: dashboard.error!,
        onRetry: () => context.read<DashboardProvider>().refresh(),
      );
    }

    final String name = auth.user?.displayName ?? 'there';

    return RefreshIndicator(
      onRefresh: () => context.read<DashboardProvider>().refresh(),
      color: EcoColors.accent,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        children: <Widget>[
          _Greeting(name: name),
          const SizedBox(height: 20),
          EcoButton(
            label: 'Report waste',
            icon: Icons.add_a_photo_rounded,
            onPressed: onNavigate == null ? null : () => onNavigate!(1),
          ),
          const SizedBox(height: 24),
          const EcoLabel('Your impact'),
          const SizedBox(height: 12),
          _StatsGrid(summary: dashboard.summary),
          const SizedBox(height: 24),
          if (dashboard.headlineArea != null) ...<Widget>[
            _AreaCard(area: dashboard.headlineArea!),
            const SizedBox(height: 24),
          ],
          SectionHeader(
            title: 'Recent reports',
            subtitle: 'Your latest AI-verified submissions',
            actionLabel: dashboard.recentReports.isEmpty ? null : 'See all',
            onAction: dashboard.recentReports.isEmpty
                ? null
                : () => onNavigate?.call(2),
          ),
          if (dashboard.recentReports.isEmpty)
            EcoCard(
              child: Column(
                children: <Widget>[
                  const Icon(Icons.inbox_outlined,
                      size: 36, color: EcoColors.muted),
                  const SizedBox(height: 10),
                  const Text(
                    'No reports yet',
                    style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: EcoColors.ink,
                    ),
                  ),
                  const SizedBox(height: 6),
                  const Text(
                    'Spot illegal dumping? Capture it and let the AI verify it.',
                    textAlign: TextAlign.center,
                    style: TextStyle(color: EcoColors.muted, fontSize: 13.5),
                  ),
                  const SizedBox(height: 14),
                  EcoButton(
                    label: 'File your first report',
                    variant: EcoButtonVariant.secondary,
                    expand: false,
                    onPressed: onNavigate == null ? null : () => onNavigate!(1),
                  ),
                ],
              ),
            )
          else
            ...dashboard.recentReports
                .take(5)
                .map(
                  (ReportEntry entry) => Padding(
                    padding: const EdgeInsets.only(bottom: 12),
                    child: ReportTile(
                      entry: entry,
                      onTap: onNavigate == null ? null : () => onNavigate!(2),
                    ),
                  ),
                ),
        ],
      ),
    );
  }
}

class _Greeting extends StatelessWidget {
  const _Greeting({required this.name});

  final String name;

  @override
  Widget build(BuildContext context) {
    return Row(
      children: <Widget>[
        Container(
          width: 46,
          height: 46,
          decoration: const BoxDecoration(
            color: EcoColors.accentSoft,
            shape: BoxShape.circle,
          ),
          child: const Icon(Icons.eco_rounded, color: EcoColors.accent),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: <Widget>[
              Text(
                'Hi, $name',
                style: const TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: EcoColors.ink,
                  height: 1.2,
                ),
              ),
              const Text(
                'Let’s keep your area clean',
                style: TextStyle(color: EcoColors.muted, fontSize: 13.5),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _StatsGrid extends StatelessWidget {
  const _StatsGrid({required this.summary});

  final DashboardSummary summary;

  @override
  Widget build(BuildContext context) {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: 12,
      crossAxisSpacing: 12,
      childAspectRatio: 1.18,
      children: <Widget>[
        StatTile(
          label: 'Reports filed',
          value: '${summary.totalReports}',
          icon: Icons.assignment_outlined,
          color: EcoColors.accent,
        ),
        StatTile(
          label: 'Active sites',
          value: '${summary.activeSites}',
          icon: Icons.location_on_outlined,
          color: EcoColors.coral,
        ),
        StatTile(
          label: 'Sites cleaned',
          value: '${summary.cleanedSites}',
          icon: Icons.check_circle_outline_rounded,
          color: EcoColors.water,
        ),
        StatTile(
          label: 'Faces & plates blurred',
          value: '${summary.piiProtected}',
          icon: Icons.shield_outlined,
          color: EcoColors.noBin,
        ),
      ],
    );
  }
}

class _AreaCard extends StatelessWidget {
  const _AreaCard({required this.area});

  final Area area;

  @override
  Widget build(BuildContext context) {
    final int? score = area.score;
    final bool locked = score == null;

    return EcoCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          const EcoLabel('Ward cleanliness'),
          const SizedBox(height: 10),
          Row(
            children: <Widget>[
              Expanded(
                child: Text(
                  area.name,
                  style: const TextStyle(
                    fontSize: 16.5,
                    fontWeight: FontWeight.w700,
                    color: EcoColors.ink,
                  ),
                ),
              ),
              PillScore(locked: locked, score: score, grade: area.grade),
            ],
          ),
          const SizedBox(height: 12),
          Text(
            locked
                ? 'Score unlocks once ${area.needed} distinct reporters have filed in this ward '
                    '(currently ${area.reporterCount}).'
                : '${area.cleanedCount} cleaned · ${area.openCount} open · '
                    'scored on cleanup velocity vs backlog.',
            style: const TextStyle(color: EcoColors.muted, fontSize: 13, height: 1.45),
          ),
        ],
      ),
    );
  }
}

class PillScore extends StatelessWidget {
  const PillScore({
    super.key,
    required this.locked,
    required this.score,
    required this.grade,
  });

  final bool locked;
  final int? score;
  final String? grade;

  @override
  Widget build(BuildContext context) {
    if (locked) {
      return const Pill(
        label: 'LOCKED',
        color: EcoColors.muted,
        icon: Icons.lock_outline_rounded,
        dense: true,
      );
    }
    final Color color = switch (grade) {
      'good' => EcoColors.accent,
      'warn' => EcoColors.noBin,
      _ => EcoColors.dump,
    };
    return Pill(
      label: '$score/100',
      color: color,
      icon: Icons.eco_rounded,
      dense: true,
    );
  }
}
