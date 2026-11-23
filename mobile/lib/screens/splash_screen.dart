import 'package:material_ui/material_ui.dart';

import '../config/app_theme.dart';

/// Shown while the persisted session is being restored on cold start.
class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: EcoColors.accent,
      body: Center(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: <Widget>[
            Container(
              width: 88,
              height: 88,
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(26),
              ),
              child: const Icon(
                Icons.eco_rounded,
                size: 46,
                color: EcoColors.accent,
              ),
            ),
            const SizedBox(height: 22),
            const Text(
              'EcoTrace',
              style: TextStyle(
                fontSize: 32,
                fontWeight: FontWeight.w800,
                color: Colors.white,
                letterSpacing: -0.5,
              ),
            ),
            const SizedBox(height: 8),
            const Text(
              'Detect · Track · Resolve waste',
              style: TextStyle(
                fontSize: 14,
                color: Colors.white70,
                letterSpacing: 0.3,
              ),
            ),
            const SizedBox(height: 40),
            const SizedBox(
              width: 26,
              height: 26,
              child: CircularProgressIndicator(
                strokeWidth: 2.5,
                color: Colors.white,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
