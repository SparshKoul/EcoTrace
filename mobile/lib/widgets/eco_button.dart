import 'package:material_ui/material_ui.dart';

import '../config/app_theme.dart';

/// The single button style used across the app, with a built-in busy state so
/// callers never show a double-tappable submit.
class EcoButton extends StatelessWidget {
  const EcoButton({
    super.key,
    required this.label,
    this.onPressed,
    this.busy = false,
    this.busyLabel,
    this.icon,
    this.variant = EcoButtonVariant.primary,
    this.expand = true,
  });

  final String label;
  final VoidCallback? onPressed;
  final bool busy;
  final String? busyLabel;
  final IconData? icon;
  final EcoButtonVariant variant;
  final bool expand;

  @override
  Widget build(BuildContext context) {
    final bool enabled = onPressed != null && !busy;
    final VoidCallback? handler = enabled ? onPressed : null;

    final Widget content = busy
        ? Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(
                  strokeWidth: 2,
                  color: Colors.white,
                ),
              ),
              const SizedBox(width: 12),
              Text(busyLabel ?? label),
            ],
          )
        : Row(
            mainAxisSize: MainAxisSize.min,
            children: <Widget>[
              if (icon != null) ...<Widget>[
                Icon(icon, size: 20),
                const SizedBox(width: 8),
              ],
              Text(label),
            ],
          );

    final Widget button;
    switch (variant) {
      case EcoButtonVariant.primary:
        button = ElevatedButton(
          onPressed: handler,
          style: ElevatedButton.styleFrom(
            backgroundColor: EcoColors.accent,
            foregroundColor: Colors.white,
            disabledBackgroundColor: EcoColors.line,
            disabledForegroundColor: EcoColors.muted,
          ),
          child: content,
        );
      case EcoButtonVariant.secondary:
        button = OutlinedButton(
          onPressed: handler,
          style: OutlinedButton.styleFrom(
            foregroundColor: EcoColors.accent,
            side: const BorderSide(color: EcoColors.accent),
            disabledForegroundColor: EcoColors.muted,
          ),
          child: content,
        );
      case EcoButtonVariant.danger:
        button = OutlinedButton(
          onPressed: handler,
          style: OutlinedButton.styleFrom(
            foregroundColor: EcoColors.dump,
            side: const BorderSide(color: EcoColors.dump),
            disabledForegroundColor: EcoColors.muted,
          ),
          child: content,
        );
    }

    return expand ? SizedBox(width: double.infinity, child: button) : button;
  }
}

enum EcoButtonVariant { primary, secondary, danger }
