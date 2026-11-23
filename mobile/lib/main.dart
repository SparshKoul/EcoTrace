import 'package:material_ui/material_ui.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'providers/auth_provider.dart';
import 'providers/capture_provider.dart';
import 'providers/dashboard_provider.dart';
import 'providers/history_provider.dart';
import 'providers/map_provider.dart';
import 'services/api_client.dart';
import 'services/auth_service.dart';
import 'services/location_service.dart';
import 'services/report_service.dart';
import 'services/token_storage.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();

  // One shared dependency graph: storage -> HTTP client -> services ->
  // providers. The backend is the only source of truth; nothing here talks to
  // a database directly.
  final TokenStorage tokenStorage = SecureTokenStorage();
  final ApiClient apiClient = ApiClient(tokenStorage: tokenStorage);
  final AuthService authService = AuthService(
    api: apiClient,
    tokenStorage: tokenStorage,
  );
  final ReportService reportService = ReportService(api: apiClient);
  const LocationService locationService = LocationService();

  runApp(
    MultiProvider(
      // Type inferred from `MultiProvider.providers` (`List<SingleChildWidget>`
      // from package:nested, which provider re-uses but does not export).
      providers: [
        ChangeNotifierProvider<AuthProvider>(
          create: (_) => AuthProvider(authService: authService),
        ),
        ChangeNotifierProvider<DashboardProvider>(
          create: (_) => DashboardProvider(reportService: reportService),
        ),
        ChangeNotifierProvider<HistoryProvider>(
          create: (_) => HistoryProvider(reportService: reportService),
        ),
        ChangeNotifierProvider<MapProvider>(
          create: (_) => MapProvider(
            reportService: reportService,
            locationService: locationService,
          ),
        ),
        ChangeNotifierProvider<CaptureProvider>(
          create: (_) => CaptureProvider(
            reportService: reportService,
            locationService: locationService,
          ),
        ),
      ],
      child: const EcoTraceApp(),
    ),
  );
}
