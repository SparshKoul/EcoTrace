import 'package:material_ui/material_ui.dart';

/// EcoTrace visual identity, ported from the web app's design tokens
/// (`frontend/src/index.css`). The palette and radii deliberately match the
/// existing site so the mobile app reads as the same product, without touching
/// any web code.
class EcoColors {
  EcoColors._();

  static const Color page = Color(0xFFFBF6EE);
  static const Color surface = Color(0xFFFFFDF8);
  static const Color tile = Color(0xFFF4ECDF);
  static const Color ink = Color(0xFF221C15);
  static const Color muted = Color(0xFF5F5446);
  static const Color line = Color(0xFFE5D9C7);

  static const Color accent = Color(0xFF0B7A73);
  static const Color accentSoft = Color(0xFFE3F3F0);
  static const Color sun = Color(0xFFFFC23D);
  static const Color coral = Color(0xFFFF7A59);

  static const Color dump = Color(0xFFC5221F);
  static const Color noBin = Color(0xFFE37400);
  static const Color water = Color(0xFF1967D2);
  static const Color construction = Color(0xFF5D4037);
  static const Color overflow = Color(0xFF7B3FA6);

  /// Waste-category accent used for badges and pins, mirroring the web
  /// `TYPE_COLOR` map.
  static Color forCategory(String? category) {
    switch (category) {
      case 'wet_organic':
        return construction;
      case 'dry_plastic_paper':
        return water;
      case 'sanitary_biomedical':
        return overflow;
      case 'special_care_ewaste_hazardous':
        return dump;
      case 'construction_debris':
        return noBin;
      case 'none':
        return muted;
      case 'mixed_municipal':
      default:
        return accent;
    }
  }
}

/// Shared corner radii matching the web `--radius-card` / `--radius-sheet`.
class EcoRadius {
  EcoRadius._();

  static const double card = 16;
  static const double sheet = 28;
}

class EcoTheme {
  EcoTheme._();

  static ThemeData light() {
    final ColorScheme scheme = ColorScheme(
      brightness: Brightness.light,
      primary: EcoColors.accent,
      onPrimary: Colors.white,
      primaryContainer: EcoColors.accentSoft,
      onPrimaryContainer: EcoColors.accent,
      secondary: EcoColors.sun,
      onSecondary: EcoColors.ink,
      secondaryContainer: EcoColors.tile,
      onSecondaryContainer: EcoColors.ink,
      tertiary: EcoColors.coral,
      onTertiary: Colors.white,
      error: EcoColors.dump,
      onError: Colors.white,
      surface: EcoColors.surface,
      onSurface: EcoColors.ink,
      onSurfaceVariant: EcoColors.muted,
      surfaceContainerLowest: EcoColors.surface,
      surfaceContainerLow: EcoColors.tile,
      surfaceContainer: EcoColors.surface,
      surfaceContainerHigh: EcoColors.tile,
      surfaceContainerHighest: EcoColors.line,
      outline: EcoColors.line,
      outlineVariant: EcoColors.line,
      shadow: Colors.black,
      inverseSurface: EcoColors.ink,
      onInverseSurface: EcoColors.surface,
      inversePrimary: EcoColors.accentSoft,
      scrim: Colors.black,
    );

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: EcoColors.page,
      splashFactory: InkSparkle.splashFactory,
      appBarTheme: const AppBarTheme(
        backgroundColor: EcoColors.page,
        foregroundColor: EcoColors.ink,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        centerTitle: false,
        titleTextStyle: TextStyle(
          color: EcoColors.ink,
          fontSize: 22,
          fontWeight: FontWeight.w700,
          height: 1.2,
        ),
      ),
      cardTheme: CardThemeData(
        color: EcoColors.surface,
        surfaceTintColor: Colors.transparent,
        elevation: 0,
        margin: EdgeInsets.zero,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(EcoRadius.card),
          side: const BorderSide(color: EcoColors.line),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: EcoColors.surface,
        hintStyle: const TextStyle(color: EcoColors.muted),
        contentPadding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: EcoColors.line),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: EcoColors.line),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: EcoColors.accent, width: 1.6),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: EcoColors.dump),
        ),
        focusedErrorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(14),
          borderSide: const BorderSide(color: EcoColors.dump, width: 1.6),
        ),
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: EcoColors.accent,
          foregroundColor: Colors.white,
          minimumSize: const Size.fromHeight(52),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: EcoColors.accent,
          minimumSize: const Size.fromHeight(52),
          side: const BorderSide(color: EcoColors.accent),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(14),
          ),
          textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
        ),
      ),
      textButtonTheme: TextButtonThemeData(
        style: TextButton.styleFrom(foregroundColor: EcoColors.accent),
      ),
      snackBarTheme: SnackBarThemeData(
        behavior: SnackBarBehavior.floating,
        backgroundColor: EcoColors.ink,
        contentTextStyle: const TextStyle(color: EcoColors.surface),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(12),
        ),
      ),
      bottomNavigationBarTheme: const BottomNavigationBarThemeData(
        backgroundColor: EcoColors.surface,
        selectedItemColor: EcoColors.accent,
        unselectedItemColor: EcoColors.muted,
        type: BottomNavigationBarType.fixed,
        elevation: 0,
      ),
      dividerTheme: const DividerThemeData(
        color: EcoColors.line,
        thickness: 1,
        space: 1,
      ),
      progressIndicatorTheme: const ProgressIndicatorThemeData(
        color: EcoColors.accent,
      ),
    );
  }
}
