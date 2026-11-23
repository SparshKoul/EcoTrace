import 'package:material_ui/material_ui.dart';

import '../config/app_theme.dart';

/// The standard EcoTrace surface: a warm, hairline-bordered card with the
/// web app's 16 px radius.
class EcoCard extends StatelessWidget {
  const EcoCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.onTap,
    this.color,
    this.borderColor,
    this.radius = EcoRadius.card,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final VoidCallback? onTap;
  final Color? color;
  final Color? borderColor;
  final double radius;

  @override
  Widget build(BuildContext context) {
    final Widget content = Padding(padding: padding, child: child);

    final BoxDecoration decoration = BoxDecoration(
      color: color ?? EcoColors.surface,
      borderRadius: BorderRadius.circular(radius),
      border: Border.all(color: borderColor ?? EcoColors.line),
    );

    if (onTap == null) {
      return DecoratedBox(decoration: decoration, child: content);
    }

    return Material(
      color: Colors.transparent,
      child: Ink(
        decoration: decoration,
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(radius),
          child: content,
        ),
      ),
    );
  }
}

/// Uppercase micro-label used above card headings (the web `.eco-label`).
class EcoLabel extends StatelessWidget {
  const EcoLabel(this.text, {super.key, this.color});

  final String text;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return Text(
      text.toUpperCase(),
      style: TextStyle(
        fontSize: 12,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.06,
        color: color ?? EcoColors.muted,
      ),
    );
  }
}
