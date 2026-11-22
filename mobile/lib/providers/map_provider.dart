import 'package:flutter/foundation.dart';

import '../models/api_exception.dart';
import '../models/report_entry.dart';
import '../services/location_service.dart';
import '../services/report_service.dart';
import 'app_change_notifier.dart';

class MapProvider extends AppChangeNotifier {
  MapProvider({
    required ReportService reportService,
    required LocationService locationService,
  }) : _reports = reportService,
       _location = locationService;

  final ReportService _reports;
  final LocationService _location;

  bool _loading = false;
  bool _loaded = false;
  String? _error;
  List<ReportEntry> _sites = const <ReportEntry>[];
  GpsFix? _fix;

  bool get loading => _loading;
  bool get loaded => _loaded;
  String? get error => _error;
  List<ReportEntry> get sites => _sites;
  GpsFix? get fix => _fix;

  Future<void> load({bool force = false}) async {
    if (_loading || (_loaded && !force)) return;
    _loading = true;
    _error = null;
    notify();
    try {
      _sites = await _reports.fetchSites();
      _loaded = true;
    } on ApiException catch (error) {
      _error = error.message;
    } catch (error) {
      _error = 'Could not load waste sites.';
      debugPrint('Map load failed: $error');
    } finally {
      _loading = false;
      notify();
    }
  }

  Future<void> refresh() => load(force: true);

  Future<void> locate() async {
    try {
      _fix = await _location.getCurrentFix();
      _error = null;
    } on LocationServiceException catch (error) {
      _error = error.message;
    } catch (error) {
      _error = 'Could not determine your location.';
    }
    notify();
  }
}
