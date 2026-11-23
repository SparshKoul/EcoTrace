import 'package:flutter/foundation.dart';

import '../models/api_exception.dart';
import '../models/area.dart';
import '../models/dashboard_summary.dart';
import '../models/report_entry.dart';
import '../services/report_service.dart';
import 'app_change_notifier.dart';

/// Loads the dashboard's data:
///  * `/api/v1/users/me/activity` — counters + the user's recent reports
///  * `/api/areas/ward` — an environmental cleanliness statistic (best effort)
class DashboardProvider extends AppChangeNotifier {
  DashboardProvider({required ReportService reportService})
      : _reports = reportService;

  final ReportService _reports;

  bool _loading = false;
  bool _loaded = false;
  String? _error;
  UserActivity? _activity;
  List<Area> _areas = const <Area>[];

  bool get loading => _loading;
  bool get loaded => _loaded;
  String? get error => _error;
  DashboardSummary get summary =>
      _activity?.summary ?? const DashboardSummary();
  List<ReportEntry> get recentReports => _activity?.activity ?? const <ReportEntry>[];
  List<Area> get areas => _areas;
  String? get userName => _activity?.userId;

  /// The top area scorecard, used for the "cleanliness" statistic.
  Area? get headlineArea {
    if (_areas.isEmpty) return null;
    final List<Area> scored =
        _areas.where((Area a) => a.score != null).toList();
    if (scored.isNotEmpty) {
      scored.sort((Area a, Area b) => (b.score ?? 0).compareTo(a.score ?? 0));
      return scored.first;
    }
    return _areas.first;
  }

  Future<void> load({bool force = false}) async {
    if (_loading || (_loaded && !force)) return;
    _loading = true;
    _error = null;
    notify();

    try {
      final UserActivity activity = await _reports.fetchMyActivity();
      _activity = activity;
      _loaded = true;
      _error = null;
    } on ApiException catch (error) {
      _error = error.message;
      _loaded = false;
    } catch (error) {
      _error = 'Could not load your dashboard.';
      debugPrint('Dashboard load failed: $error');
      _loaded = false;
    } finally {
      _loading = false;
      notify();
    }

    // Environmental statistic is optional — never block the dashboard on it.
    await _loadAreas();
  }

  Future<void> _loadAreas() async {
    try {
      final List<Area> areas = await _reports.fetchAreas('ward');
      _areas = areas;
    } catch (error) {
      debugPrint('Area scores unavailable: $error');
      _areas = const <Area>[];
    } finally {
      notify();
    }
  }

  Future<void> refresh() => load(force: true);
}
