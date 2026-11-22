import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import 'config/app_theme.dart';
import 'providers/auth_provider.dart';
import 'screens/auth/login_screen.dart';
import 'screens/home_shell.dart';
import 'screens/splash_screen.dart';

/// Root widget: applies the EcoTrace theme and switches between the splash
/// (session restore), login and the authenticated shell.
///
/// The transition is fully declarative — signing in flips
/// [AuthProvider.status] to `authenticated`, which rebuilds this widget into
/// [HomeShell]; signing out flips it back. No imperative navigation is needed.
class EcoTraceApp extends StatelessWidget {
  const EcoTraceApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'EcoTrace',
      debugShowCheckedModeBanner: false,
      theme: EcoTheme.light(),
      themeMode: ThemeMode.light,
      home: const _RootView(),
    );
  }
}

class _RootView extends StatefulWidget {
  const _RootView();

  @override
  State<_RootView> createState() => _RootViewState();
}

class _RootViewState extends State<_RootView> {
  @override
  void initState() {
    super.initState();
    // Restore any persisted session after the first frame.
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      context.read<AuthProvider>().bootstrap();
    });
  }

  @override
  Widget build(BuildContext context) {
    final AuthProvider auth = context.watch<AuthProvider>();

    switch (auth.status) {
      case AuthStatus.unknown:
        return const SplashScreen();
      case AuthStatus.unauthenticated:
        return const LoginScreen();
      case AuthStatus.authenticated:
        return const HomeShell();
    }
  }
}
