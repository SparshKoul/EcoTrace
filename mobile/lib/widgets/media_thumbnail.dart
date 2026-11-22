import 'package:material_ui/material_ui.dart';

import '../config/app_config.dart';
import '../config/app_theme.dart';

/// Network image for report media with graceful fallbacks.
///
/// Handles absolute CDN URLs and backend-relative `/public/...` paths, shows a
/// neutral placeholder while loading, and falls back to an icon on failure.
class MediaThumbnail extends StatelessWidget {
  const MediaThumbnail({
    super.key,
    required this.url,
    this.size = 64,
    this.radius = 12,
    this.category,
    this.fit = BoxFit.cover,
  });

  final String? url;
  final double size;
  final double radius;
  final String? category;
  final BoxFit fit;

  @override
  Widget build(BuildContext context) {
    final String resolved = AppConfig.absoluteUrl(url);

    final Widget placeholder = Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: EcoColors.tile,
        borderRadius: BorderRadius.circular(radius),
      ),
      child: Icon(
        Icons.delete_outline_rounded,
        size: size * 0.4,
        color: EcoColors.forCategory(category),
      ),
    );

    if (resolved.isEmpty) return placeholder;

    return ClipRRect(
      borderRadius: BorderRadius.circular(radius),
      child: Image.network(
        resolved,
        width: size,
        height: size,
        fit: fit,
        loadingBuilder: (BuildContext context, Widget child,
            ImageChunkEvent? progress) {
          if (progress == null) return child;
          return Container(
            width: size,
            height: size,
            color: EcoColors.tile,
            child: const Center(
              child: SizedBox(
                width: 20,
                height: 20,
                child: CircularProgressIndicator(strokeWidth: 2),
              ),
            ),
          );
        },
        errorBuilder: (BuildContext context, Object error, StackTrace? trace) =>
            placeholder,
      ),
    );
  }
}
