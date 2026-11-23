import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../config/app_config.dart';
import '../../config/app_theme.dart';
import '../../models/dashboard_summary.dart';
import '../../providers/auth_provider.dart';
import '../../providers/dashboard_provider.dart';
import '../../widgets/eco_button.dart';
import '../../widgets/eco_card.dart';
import '../../widgets/section_header.dart';

/// Account tab: identity, impact summary, backend configuration and sign-out.
class ProfileScreen extends StatelessWidget {
  const ProfileScreen({super.key});

  Future<void> _confirmSignOut(BuildContext context) async {
    final AuthProvider auth = context.read<AuthProvider>();
    final bool? confirmed = await showDialog<bool>(
      context: context,
      builder: (BuildContext context) => AlertDialog(
        backgroundColor: EcoColors.surface,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(20),
        ),
        title: const Text('Sign out?'),
        content: const Text(
          'You will need your email and password to sign back in.',
          style: TextStyle(color: EcoColors.muted, height: 1.5),
        ),
        actions: <Widget>[
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text(
              'Sign out',
              style: TextStyle(
                color: EcoColors.dump,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
    );

    if (confirmed == true) {
      await auth.signOut();
    }
  }

  @override
  Widget build(BuildContext context) {
    final AuthProvider auth = context.watch<AuthProvider>();
    final DashboardProvider dashboard = context.watch<DashboardProvider>();
    final DashboardSummary summary = dashboard.summary;

    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
          children: <Widget>[
            // --- Identity -------------------------------------------------
            EcoCard(
              child: Row(
                children: <Widget>[
                  Container(
                    width: 60,
                    height: 60,
                    decoration: const BoxDecoration(
                      color: EcoColors.accentSoft,
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(
                      Icons.person_rounded,
                      size: 32,
                      color: EcoColors.accent,
                    ),
                  ),
                  const SizedBox(width: 16),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        Text(
                          auth.user?.displayName ?? '—',
                          style: const TextStyle(
                            fontSize: 18,
                            fontWeight: FontWeight.w800,
                            color: EcoColors.ink,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                        const SizedBox(height: 3),
                        Text(
                          auth.user?.email ?? '',
                          style: const TextStyle(
                            color: EcoColors.muted,
                            fontSize: 14,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),

            const SizedBox(height: 24),
            const SectionHeader(title: 'Your impact'),
            GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              mainAxisSpacing: 12,
              crossAxisSpacing: 12,
              childAspectRatio: 1.25,
              children: <Widget>[
                _MiniStat(label: 'Reports', value: '${summary.totalReports}'),
                _MiniStat(label: 'Active', value: '${summary.activeSites}'),
                _MiniStat(label: 'Cleaned', value: '${summary.cleanedSites}'),
              ],
            ),

            const SizedBox(height: 24),
            const SectionHeader(title: 'Account'),
            EcoCard(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
              child: Column(
                children: <Widget>[
                  _InfoRow(
                    icon: Icons.badge_outlined,
                    label: 'User ID',
                    value: auth.user?.id ?? '—',
                    selectable: true,
                  ),
                  const Divider(),
                  _InfoRow(
                    icon: Icons.cloud_outlined,
                    label: 'Backend',
                    value: AppConfig.apiBaseUrl,
                    selectable: true,
                  ),
                  const Divider(),
                  const _InfoRow(
                    icon: Icons.verified_user_outlined,
                    label: 'Session',
                    value: 'Supabase (encrypted at rest)',
                  ),
                ],
              ),
            ),

            const SizedBox(height: 32),
            EcoButton(
              label: 'Sign out',
              icon: Icons.logout_rounded,
              variant: EcoButtonVariant.danger,
              onPressed: () => _confirmSignOut(context),
            ),
            const SizedBox(height: 20),
            const Center(
              child: Text(
                'EcoTrace · AI-powered environmental tracking',
                style: TextStyle(color: EcoColors.muted, fontSize: 12.5),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: BoxDecoration(
        color: EcoColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: EcoColors.line),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: <Widget>[
          Text(
            value,
            style: const TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.w800,
              color: EcoColors.ink,
              height: 1,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            label,
            style: const TextStyle(color: EcoColors.muted, fontSize: 12.5),
          ),
        ],
      ),
    );
  }
}

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.label,
    required this.value,
    this.selectable = false,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool selectable;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 14),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, size: 19, color: EcoColors.muted),
          const SizedBox(width: 12),
          Expanded(
            flex: 2,
            child: Text(
              label,
              style: const TextStyle(color: EcoColors.muted, fontSize: 14),
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            flex: 3,
            child: selectable
                ? SelectableText(
                    value,
                    textAlign: TextAlign.right,
                    style: const TextStyle(
                      color: EcoColors.ink,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                    ),
                  )
                : Text(
                    value,
                    textAlign: TextAlign.right,
                    style: const TextStyle(
                      color: EcoColors.ink,
                      fontSize: 13.5,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
          ),
        ],
      ),
    );
  }
}
