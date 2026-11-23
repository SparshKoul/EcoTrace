import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import '../../config/app_theme.dart';
import '../../models/report_entry.dart';
import '../../providers/history_provider.dart';
import '../../widgets/report_tile.dart';
import '../../widgets/state_views.dart';
import 'report_detail_screen.dart';

/// "My reports" tab backed by `/api/v1/users/me/activity`.
class ReportHistoryScreen extends StatelessWidget {
  const ReportHistoryScreen({super.key, this.onNavigate});

  /// Requests the shell to switch tabs.
  final ValueChanged<int>? onNavigate;

  @override
  Widget build(BuildContext context) {
    final HistoryProvider history = context.watch<HistoryProvider>();

    if (!history.loaded && !history.loading && history.error == null) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        if (context.mounted) context.read<HistoryProvider>().load();
      });
    }

    return Scaffold(
      appBar: AppBar(title: const Text('My reports')),
      body: SafeArea(child: _Body(history: history, onNavigate: onNavigate)),
    );
  }
}

class _Body extends StatelessWidget {
  const _Body({required this.history, required this.onNavigate});

  final HistoryProvider history;
  final ValueChanged<int>? onNavigate;

  @override
  Widget build(BuildContext context) {
    if (history.loading && !history.loaded && history.error == null) {
      return const LoadingView(message: 'Loading your reports…');
    }
    if (history.error != null && !history.loaded) {
      return ErrorView(
        message: history.error!,
        onRetry: () => context.read<HistoryProvider>().refresh(),
      );
    }
    if (history.isEmpty) {
      return EmptyView(
        icon: Icons.inbox_outlined,
        title: 'No reports yet',
        message:
            'Reports you file appear here with their AI classification, status '
            'and location.',
        actionLabel: 'File a report',
        onAction: onNavigate == null ? null : () => onNavigate!(1),
      );
    }

    return RefreshIndicator(
      onRefresh: () => context.read<HistoryProvider>().refresh(),
      color: EcoColors.accent,
      child: ListView.separated(
        padding: const EdgeInsets.fromLTRB(20, 8, 20, 32),
        itemCount: history.items.length,
        separatorBuilder: (_, _) => const SizedBox(height: 12),
        itemBuilder: (BuildContext context, int index) {
          final ReportEntry entry = history.items[index];
          return ReportTile(
            entry: entry,
            onTap: () => Navigator.of(context).push<void>(
              MaterialPageRoute<void>(
                builder: (_) => ReportDetailScreen(entry: entry),
              ),
            ),
          );
        },
      ),
    );
  }
}
