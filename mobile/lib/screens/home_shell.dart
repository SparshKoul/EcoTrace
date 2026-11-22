import 'package:material_ui/material_ui.dart';

import '../config/app_theme.dart';
import 'dashboard/dashboard_screen.dart';
import 'history/report_history_screen.dart';
import 'profile/profile_screen.dart';
import 'report/report_capture_screen.dart';
import 'map/map_screen.dart';

/// Authenticated navigation shell.
///
/// Tabs are built lazily so the report screen only requests GPS permission the
/// first time the user actually opens it, while state (scroll position, form
/// input, loaded data) is preserved across switches via [IndexedStack].
class HomeShell extends StatefulWidget {
  const HomeShell({super.key});

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = 0;

  /// Which tabs have been instantiated at least once.
  final List<bool> _built = <bool>[true, false, false, false, false];

  void _select(int index) {
    if (index == _index) return;
    setState(() {
      _built[index] = true;
      _index = index;
    });
  }

  Widget _child(int index) {
    if (!_built[index]) return const SizedBox.shrink();
    switch (index) {
      case 0:
        return DashboardScreen(onNavigate: _select);
      case 1:
        return ReportCaptureScreen(onNavigate: _select);
      case 2:
        return ReportHistoryScreen(onNavigate: _select);
      case 3:
        return const ProfileScreen();
      case 4:
        return const MapScreen();
      default:
        return const SizedBox.shrink();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: List<Widget>.generate(5, _child),
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: _select,
        backgroundColor: EcoColors.surface,
        indicatorColor: EcoColors.accentSoft,
        elevation: 0,
        height: 68,
        labelBehavior: NavigationDestinationLabelBehavior.alwaysShow,
        destinations: const <NavigationDestination>[
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard_rounded),
            label: 'Dashboard',
          ),
          NavigationDestination(
            icon: Icon(Icons.add_a_photo_outlined),
            selectedIcon: Icon(Icons.add_a_photo_rounded),
            label: 'Report',
          ),
          NavigationDestination(
            icon: Icon(Icons.history_outlined),
            selectedIcon: Icon(Icons.history_rounded),
            label: 'History',
          ),
          NavigationDestination(
            icon: Icon(Icons.person_outline_rounded),
            selectedIcon: Icon(Icons.person_rounded),
            label: 'Profile',
          ),
          NavigationDestination(
            icon: Icon(Icons.map_outlined),
            selectedIcon: Icon(Icons.map_rounded),
            label: 'Map',
          ),
        ],
      ),
    );
  }
}
