import 'package:material_ui/material_ui.dart';

import '../config/app_theme.dart';
import 'eco_button.dart';

/// Full-screen spinner with an optional status line.
class LoadingView extends StatelessWidget {
  const LoadingView({super.key, this.message});

  final String? message;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            const CircularProgressIndicator(),
            if (message != null) ...<Widget>[
              const SizedBox(height: 16),
              Text(
                message!,
                textAlign: TextAlign.center,
                style: const TextStyle(color: EcoColors.muted),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Friendly empty state with an optional call to action.
class EmptyView extends StatelessWidget {
  const EmptyView({
    super.key,
    required this.icon,
    required this.title,
    required this.message,
    this.actionLabel,
    this.onAction,
  });

  final IconData icon;
  final String title;
  final String message;
  final String? actionLabel;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Container(
              width: 72,
              height: 72,
              decoration: const BoxDecoration(
                color: EcoColors.accentSoft,
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 34, color: EcoColors.accent),
            ),
            const SizedBox(height: 16),
            Text(
              title,
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: EcoColors.ink,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: EcoColors.muted, height: 1.5),
            ),
            if (actionLabel != null && onAction != null) ...<Widget>[
              const SizedBox(height: 20),
              EcoButton(
                label: actionLabel!,
                onPressed: onAction,
                variant: EcoButtonVariant.secondary,
                expand: false,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// Error state with a retry affordance.
class ErrorView extends StatelessWidget {
  const ErrorView({
    super.key,
    required this.message,
    this.onRetry,
    this.icon = Icons.wifi_off_rounded,
  });

  final String message;
  final VoidCallback? onRetry;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Container(
              width: 72,
              height: 72,
              decoration: const BoxDecoration(
                color: Color(0xFFFBE9E7),
                shape: BoxShape.circle,
              ),
              child: Icon(icon, size: 34, color: EcoColors.dump),
            ),
            const SizedBox(height: 16),
            Text(
              'Something went wrong',
              textAlign: TextAlign.center,
              style: const TextStyle(
                fontSize: 17,
                fontWeight: FontWeight.w700,
                color: EcoColors.ink,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
              style: const TextStyle(color: EcoColors.muted, height: 1.5),
            ),
            if (onRetry != null) ...<Widget>[
              const SizedBox(height: 20),
              EcoButton(
                label: 'Try again',
                onPressed: onRetry,
                variant: EcoButtonVariant.secondary,
                expand: false,
              ),
            ],
          ],
        ),
      ),
    );
  }
}

/// A compact inline banner for non-fatal messages.
class InlineBanner extends StatelessWidget {
  const InlineBanner({
    super.key,
    required this.message,
    this.tone = BannerTone.error,
    this.onDismiss,
  });

  final String message;
  final BannerTone tone;
  final VoidCallback? onDismiss;

  @override
  Widget build(BuildContext context) {
    final (Color bg, Color fg, IconData icon) = switch (tone) {
      BannerTone.error => (const Color(0xFFFBE9E7), EcoColors.dump, Icons.error_outline_rounded),
      BannerTone.success => (EcoColors.accentSoft, EcoColors.accent, Icons.check_circle_outline_rounded),
      BannerTone.info => (EcoColors.tile, EcoColors.muted, Icons.info_outline_rounded),
    };

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Icon(icon, size: 20, color: fg),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: TextStyle(color: fg, fontSize: 14, height: 1.4),
            ),
          ),
          if (onDismiss != null)
            GestureDetector(
              onTap: onDismiss,
              child: Icon(Icons.close_rounded, size: 18, color: fg),
            ),
        ],
      ),
    );
  }
}

enum BannerTone { error, success, info }
